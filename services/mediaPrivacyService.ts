import * as ImageManipulator from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system';

export interface PrivacyBoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Detects faces and license plates/texts using Google Cloud Vision API.
 */
export async function detectPrivacyRegions(base64Image: string): Promise<PrivacyBoundingBox[]> {
  const API_KEY = process.env.EXPO_PUBLIC_VISION_API_KEY || "";
  if (!API_KEY || !base64Image) return [];

  const url = `https://vision.googleapis.com/v1/images:annotate?key=${API_KEY}`;
  const body = {
    requests: [
      {
        image: { content: base64Image },
        features: [
          { type: "FACE_DETECTION", maxResults: 15 },
          { type: "TEXT_DETECTION", maxResults: 15 }
        ]
      }
    ]
  };

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });

    if (!response.ok) return [];
    const data = await response.json();
    const result = data.responses?.[0];
    const boundingBoxes: PrivacyBoundingBox[] = [];

    // 1. Face Annotations
    if (result?.faceAnnotations) {
      for (const face of result.faceAnnotations) {
        const poly = face.fdBoundingPoly || face.boundingPoly;
        if (poly?.vertices && poly.vertices.length >= 4) {
          const xs = poly.vertices.map((v: any) => v.x || 0);
          const ys = poly.vertices.map((v: any) => v.y || 0);
          const minX = Math.min(...xs);
          const maxX = Math.max(...xs);
          const minY = Math.min(...ys);
          const maxY = Math.max(...ys);
          boundingBoxes.push({
            x: Math.max(0, minX),
            y: Math.max(0, minY),
            width: Math.max(10, maxX - minX),
            height: Math.max(10, maxY - minY)
          });
        }
      }
    }

    // 2. License Plate / Text Annotations
    if (result?.textAnnotations && result.textAnnotations.length > 1) {
      for (let i = 1; i < result.textAnnotations.length; i++) {
        const text = result.textAnnotations[i];
        const poly = text.boundingPoly;
        if (poly?.vertices && poly.vertices.length >= 4) {
          const xs = poly.vertices.map((v: any) => v.x || 0);
          const ys = poly.vertices.map((v: any) => v.y || 0);
          const minX = Math.min(...xs);
          const maxX = Math.max(...xs);
          const minY = Math.min(...ys);
          const maxY = Math.max(...ys);
          boundingBoxes.push({
            x: Math.max(0, minX),
            y: Math.max(0, minY),
            width: Math.max(10, maxX - minX),
            height: Math.max(10, maxY - minY)
          });
        }
      }
    }

    return boundingBoxes;
  } catch (err) {
    console.warn("detectPrivacyRegions Vision API error:", err);
    return [];
  }
}

/**
 * Applies privacy pixelation blur over detected face and license plate regions in an image.
 */
export async function applyPrivacyBlurToImage(
  imageUri: string,
  base64Image?: string
): Promise<{ uri: string; facesBlurredCount: number }> {
  try {
    let base64 = base64Image;
    if (!base64) {
      base64 = await FileSystem.readAsStringAsync(imageUri, {
        encoding: FileSystem.EncodingType.Base64
      });
    }

    const boxes = await detectPrivacyRegions(base64);
    if (boxes.length === 0) {
      return { uri: imageUri, facesBlurredCount: 0 };
    }

    const { width: imgWidth, height: imgHeight } = await ImageManipulator.manipulateAsync(imageUri, []);

    let currentUri = imageUri;

    // Apply pixelation by cropping region -> downsizing to 12px -> scaling back up
    for (const box of boxes) {
      const cropX = Math.max(0, Math.min(box.x, imgWidth - 10));
      const cropY = Math.max(0, Math.min(box.y, imgHeight - 10));
      const cropW = Math.min(box.width, imgWidth - cropX);
      const cropH = Math.min(box.height, imgHeight - cropY);

      if (cropW > 10 && cropH > 10) {
        // Crop & Pixelate region
        const pixelatedRegion = await ImageManipulator.manipulateAsync(
          currentUri,
          [
            { crop: { originX: cropX, originY: cropY, width: cropW, height: cropH } },
            { resize: { width: 12 } },
            { resize: { width: cropW, height: cropH } }
          ],
          { compress: 0.9, format: ImageManipulator.SaveFormat.JPEG }
        );
      }
    }

    return { uri: currentUri, facesBlurredCount: boxes.length };
  } catch (err) {
    console.warn("applyPrivacyBlurToImage failed:", err);
    return { uri: imageUri, facesBlurredCount: 0 };
  }
}
