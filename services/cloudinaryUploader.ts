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

  const uploadBody = new FormData();
  uploadBody.append('file', {
    uri: localVideoUri,
    type: 'video/mp4',
    name: `pinc_video_${Date.now()}.mp4`,
  } as any);
  uploadBody.append('upload_preset', UPLOAD_PRESET);
  uploadBody.append('resource_type', 'video');

  // Use XMLHttpRequest for upload progress tracking
  const publicId = await new Promise<string>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', uploadUrl);

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && onProgress) {
        const progress = event.loaded / event.total;
        onProgress(progress * 0.9); // Upload = 0-90%, transformation = 90-100%
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const result = JSON.parse(xhr.responseText);
          onProgress?.(0.95);
          resolve(result.public_id);
        } catch {
          reject(new Error('Failed to parse Cloudinary response'));
        }
      } else {
        reject(new Error(`Cloudinary upload failed with status: ${xhr.status} - ${xhr.responseText}`));
      }
    };

    xhr.onerror = () => reject(new Error('Network error during Cloudinary upload'));
    xhr.ontimeout = () => reject(new Error('Cloudinary upload timed out'));
    xhr.timeout = 120000; // 2 minute timeout

    xhr.send(uploadBody);
  });

  // Build Cloudinary transformation URL with watermark overlay
  // Layer 1: Logo (pinc_watermark_btn) - left-center, 65% opacity, width 140px
  // Layer 2: @username text - white, 65% opacity, below logo
  const logoTransform = `l_${WATERMARK_PUBLIC_ID},o_65,g_west,x_20,y_-18,w_140/fl_layer_apply`;
  const textTransform = `l_text:Arial_16_bold:%40${encodeURIComponent(formattedUsername)},co_white,o_65,g_west,x_24,y_28/fl_layer_apply`;

  const watermarkedUrl = `https://res.cloudinary.com/${CLOUD_NAME}/video/upload/${logoTransform}/${textTransform}/${publicId}.mp4`;

  onProgress?.(1.0);
  return watermarkedUrl;
}
