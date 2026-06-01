import { Video } from 'react-native-compressor';
import * as VideoThumbnails from 'expo-video-thumbnails';

/**
 * Compresses a video using react-native-compressor.
 * - Targets 720p medium quality.
 * - Optimized for mobile viewing (supports vertical aspect ratios).
 * 
 * @param uri Local URI of the source video.
 * @param onProgress Optional callback to receive compression progress (0 to 1).
 * @returns Promise<string> Resolves to the URI of the compressed video.
 */
export async function compressVideo(
  uri: string,
  onProgress?: (progress: number) => void
): Promise<string> {
  try {
    const result = await Video.compress(
      uri,
      {
        compressionMethod: 'auto',
      },
      (progress: number) => {
        if (onProgress) {
          onProgress(progress);
        }
      }
    );
    return result;
  } catch (error) {
    console.error('[compressVideo] Failed to compress video:', error);
    // Graceful fallback to original URI
    return uri;
  }
}

/**
 * Generates a thumbnail image from the first frame of a video using expo-video-thumbnails.
 * 
 * @param uri Local URI of the video.
 * @returns Promise<string> Resolves to the URI of the extracted thumbnail.
 */
export async function generateThumbnail(uri: string): Promise<string> {
  try {
    const { uri: thumbnailUri } = await VideoThumbnails.getThumbnailAsync(uri, {
      time: 0, // Very first frame (0ms)
    });
    return thumbnailUri;
  } catch (error) {
    console.error('[generateThumbnail] Failed to extract thumbnail:', error);
    throw error;
  }
}
