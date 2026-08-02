import * as FileSystem from 'expo-file-system';
import * as Crypto from 'expo-crypto';

const CLOUD_NAME = process.env.EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME || 'dwdw1wu7o';
const API_KEY = process.env.EXPO_PUBLIC_CLOUDINARY_API_KEY || '113948477763227';
const API_SECRET = process.env.EXPO_PUBLIC_CLOUDINARY_API_SECRET || 'B62s7ywGjqUP6PsyNsY8MRDAaGo';
const WATERMARK_PUBLIC_ID = process.env.EXPO_PUBLIC_CLOUDINARY_WATERMARK_PUBLIC_ID || 'pinc_watermark_btn_cuqgt5';

/**
 * Uploads a local video file to Cloudinary and returns a URL
 * with the Pinc watermark logo + @username burned into the video.
 *
 * @param localVideoUri  - local file:// path to the .mp4 video
 * @param username       - user's username (with or without @)
 * @param onProgress     - optional progress callback (0.0 - 1.0)
 * @returns              - HTTPS URL of the watermarked .mp4 video on Cloudinary CDN
 */
export async function uploadVideoWithWatermark(
  localVideoUri: string,
  username: string,
  onProgress?: (progress: number) => void
): Promise<string> {
  const formattedUsername = username.startsWith('@') ? username.slice(1) : username;

  const uploadUrl = `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/video/upload`;

  // Build Cloudinary transformation for watermark overlay
  // Layer 1: Logo (pinc_watermark_btn) - left-center, 65% opacity, width 350px
  // Layer 2: @username text - white, 65% opacity, below logo
  const logoTransform = `l_${WATERMARK_PUBLIC_ID},o_65,g_west,x_40,y_-30,w_350/fl_layer_apply`;
  const textTransform = `l_text:Arial_45_bold:%40${encodeURIComponent(formattedUsername)},co_white,o_65,g_west,x_45,y_45/fl_layer_apply`;
  const eagerTransform = `${logoTransform}/${textTransform}`;

  // Generate Cloudinary signature for signed upload
  const timestamp = Math.floor(Date.now() / 1000).toString();
  // Parameters to sign must be in alphabetical order
  const strToSign = `eager=${eagerTransform}&timestamp=${timestamp}${API_SECRET}`;
  const signature = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA1, strToSign);

  // Use FileSystem.uploadAsync for robust file uploading in Expo
  let publicId: string;
  let watermarkedUrl: string;
  try {
    const uploadTask = FileSystem.createUploadTask(
      uploadUrl,
      localVideoUri,
      {
        uploadType: FileSystem.FileSystemUploadType.MULTIPART,
        fieldName: 'file',
        mimeType: 'video/mp4',
        parameters: {
          api_key: API_KEY,
          timestamp: timestamp,
          eager: eagerTransform,
          signature: signature,
        },
      },
      (data) => {
        if (data.totalBytesExpectedToSend > 0 && onProgress) {
          const progress = data.totalBytesSent / data.totalBytesExpectedToSend;
          // Upload takes up to 70%, Cloudinary processing takes the remaining 30%
          onProgress(progress * 0.7); 
        }
      }
    );

    const response = await uploadTask.uploadAsync();

    if (!response || response.status < 200 || response.status >= 300) {
      throw new Error(`Cloudinary upload failed with status: ${response?.status} - ${response?.body}`);
    }

    const result = JSON.parse(response.body);
    if (result.eager && result.eager.length > 0) {
      watermarkedUrl = result.eager[0].secure_url;
    } else {
      throw new Error('Cloudinary did not return eager transformation result');
    }
    
    onProgress?.(0.95);
  } catch (error: any) {
    throw new Error(`Failed to upload to Cloudinary: ${error.message}`);
  }

  onProgress?.(1.0);
  return watermarkedUrl;
}
