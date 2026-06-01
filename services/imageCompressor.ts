import * as ImageManipulator from 'expo-image-manipulator';

/**
 * Compresses and resizes an image to optimize for Firebase Storage.
 * - Resizes so that the maximum width or height is 1080 pixels (maintaining aspect ratio).
 * - Compresses using JPEG format with 0.7 quality.
 * - Includes a graceful fallback to the original URI if compression fails.
 * 
 * @param uri Local URI of the image to compress.
 * @returns Promise<string> Resolves to the URI of the newly compressed image.
 */
export async function compressImage(uri: string): Promise<string> {
  try {
    // 1. Get original image dimensions by performing a no-op manipulation
    const { width, height } = await ImageManipulator.manipulateAsync(uri, []);

    // 2. Compute resize action maintaining aspect ratio
    const maxLimit = 1080;
    const actions: ImageManipulator.Action[] = [];

    if (width > maxLimit || height > maxLimit) {
      if (width > height) {
        actions.push({ resize: { width: maxLimit } });
      } else {
        actions.push({ resize: { height: maxLimit } });
      }
    }

    // 3. Compress using JPEG format with 0.7 quality
    const result = await ImageManipulator.manipulateAsync(
      uri,
      actions,
      {
        compress: 0.7,
        format: ImageManipulator.SaveFormat.JPEG,
      }
    );

    return result.uri;
  } catch (error) {
    console.error('[compressImage] Error during image compression:', error);
    // Graceful fallback: return the original URI so the upload process doesn't break
    return uri;
  }
}
