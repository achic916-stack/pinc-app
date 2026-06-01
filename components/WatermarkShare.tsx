import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import * as Sharing from 'expo-sharing';
import ViewShot from 'react-native-view-shot';

const { width } = Dimensions.get('window');
const PREVIEW_SIZE = width - 40;

interface WatermarkShareProps {
  photoUri: string;
  locationName: string;
  onClose?: () => void;
}

export const WatermarkShare: React.FC<WatermarkShareProps> = ({
  photoUri,
  locationName,
  onClose,
}) => {
  const viewShotRef = useRef<ViewShot>(null);
  const [isSharing, setIsSharing] = useState(false);

  const handleShare = async () => {
    if (isSharing) return;

    try {
      setIsSharing(true);

      // 1. Capture the view as an image URI
      const uri = await viewShotRef.current?.capture?.();

      if (!uri) {
        throw new Error('Failed to generate snapshot');
      }

      // 2. Check if sharing is available on the device
      const isAvailable = await Sharing.isAvailableAsync();
      if (!isAvailable) {
        alert('Sharing is not available on your platform');
        return;
      }

      // 3. Share the image using the native share sheet
      await Sharing.shareAsync(uri, {
        mimeType: 'image/jpeg',
        dialogTitle: 'Share your memory',
        UTI: 'public.jpeg', // for iOS
      });
    } catch (error) {
      console.error('Error sharing image:', error);
      alert('Could not share the image. Please try again.');
    } finally {
      setIsSharing(false);
    }
  };

  return (
    <View style={styles.container}>
      {/* Hidden view for capturing full resolution (Rendered off-screen or scaled) */}
      <View style={styles.captureContainer}>
        <ViewShot
          ref={viewShotRef}
          options={{ format: 'jpg', quality: 1.0 }}
          style={styles.viewShotContainer}
        >
          <Image
            source={{ uri: photoUri }}
            style={styles.photo}
            contentFit="cover"
            cachePolicy="memory-disk"
          />

          {/* Aesthetic Gradient Overlay at the bottom */}
          <LinearGradient
            colors={['transparent', 'rgba(0,0,0,0.7)', 'rgba(0,0,0,0.9)']}
            style={styles.gradientOverlay}
          >
            <View style={styles.watermarkContent}>
              <Text style={styles.locationText}>{locationName}</Text>
              <Text style={styles.brandText}>Shared via Pinc. 📍</Text>
            </View>
          </LinearGradient>
        </ViewShot>
      </View>

      {/* Action Buttons */}
      <View style={styles.actionsContainer}>
        <TouchableOpacity
          style={styles.shareButton}
          onPress={handleShare}
          disabled={isSharing}
          activeOpacity={0.8}
        >
          {isSharing ? (
            <>
              <ActivityIndicator color="#fff" size="small" style={styles.loader} />
              <Text style={styles.shareText}>Preparing to share...</Text>
            </>
          ) : (
            <Text style={styles.shareText}>Share to Social</Text>
          )}
        </TouchableOpacity>

        {onClose && (
          <TouchableOpacity
            style={styles.cancelButton}
            onPress={onClose}
            disabled={isSharing}
          >
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  captureContainer: {
    width: PREVIEW_SIZE,
    height: PREVIEW_SIZE * 1.5, // 2:3 aspect ratio like standard stories
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: '#222',
  },
  viewShotContainer: {
    flex: 1,
    width: '100%',
    height: '100%',
    backgroundColor: '#000', // ensure background is solid when capturing
  },
  photo: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
  },
  gradientOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 180,
    justifyContent: 'flex-end',
    padding: 20,
  },
  watermarkContent: {
    alignItems: 'flex-start',
  },
  locationText: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 4,
    textShadowColor: 'rgba(0, 0, 0, 0.75)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  brandText: {
    color: '#FF4B72', // Using Pinc's brand color
    fontSize: 16,
    fontWeight: '600',
    textShadowColor: 'rgba(0, 0, 0, 0.75)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  actionsContainer: {
    marginTop: 30,
    width: PREVIEW_SIZE,
    alignItems: 'center',
  },
  shareButton: {
    backgroundColor: '#FF4B72',
    width: '100%',
    paddingVertical: 16,
    borderRadius: 30,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    shadowColor: '#FF4B72',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  loader: {
    marginRight: 10,
  },
  shareText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },
  cancelButton: {
    paddingVertical: 12,
  },
  cancelText: {
    color: '#aaa',
    fontSize: 16,
    fontWeight: '600',
  },
});
