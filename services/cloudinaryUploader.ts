import * as FileSystem from 'expo-file-system';

const CLOUD_NAME = process.env.EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME || 'dwdw1wu7o';
const UPLOAD_PRESET = process.env.EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET || 'pinc_video_upload';
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

  // Upload video to Cloudinary using unsigned upload preset
  const uploadUrl = `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/video/upload`;

  // Use FileSystem.uploadAsync for robust file uploading in Expo
  let publicId: string;
  try {
    const uploadTask = FileSystem.createUploadTask(
      uploadUrl,
      localVideoUri,
      {
        uploadType: FileSystem.FileSystemUploadType.MULTIPART,
        fieldName: 'file',
        mimeType: 'video/mp4',
        parameters: {
          upload_preset: UPLOAD_PRESET,
          resource_type: 'video',
        },
      },
      (data) => {
        if (data.totalBytesExpectedToSend > 0 && onProgress) {
          const progress = data.totalBytesSent / data.totalBytesExpectedToSend;
          onProgress(progress * 0.9); // Upload = 0-90%
        }
      }
    );

    const response = await uploadTask.uploadAsync();

    if (!response || response.status < 200 || response.status >= 300) {
      throw new Error(`Cloudinary upload failed with status: ${response?.status} - ${response?.body}`);
    }

    const result = JSON.parse(response.body);
    publicId = result.public_id;
    onProgress?.(0.95);
  } catch (error: any) {
    throw new Error(`Failed to upload to Cloudinary: ${error.message}`);
  }

  // Build Cloudinary transformation URL with watermark overlay
  // Layer 1: Logo (pinc_watermark_btn) - left-center, 65% opacity, width 350px
  // Layer 2: @username text - white, 65% opacity, below logo
  const logoTransform = `l_${WATERMARK_PUBLIC_ID},o_65,g_west,x_40,y_-30,w_350/fl_layer_apply`;
  const textTransform = `l_text:Arial_45_bold:%40${encodeURIComponent(formattedUsername)},co_white,o_65,g_west,x_45,y_45/fl_layer_apply`;

  const watermarkedUrl = `https://res.cloudinary.com/${CLOUD_NAME}/video/upload/${logoTransform}/${textTransform}/${publicId}.mp4`;

  onProgress?.(1.0);
  return watermarkedUrl;
}
