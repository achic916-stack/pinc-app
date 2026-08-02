import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  Dimensions,
  Alert
} from 'react-native';
import { Image } from 'expo-image';
import * as Sharing from 'expo-sharing';
import ViewShot from 'react-native-view-shot';
import { Ionicons } from '@expo/vector-icons';
import { PincTheme } from "../styles/theme";
import { CachedVideo } from './CachedVideo';
import * as FileSystem from 'expo-file-system';

const { width } = Dimensions.get('window');
const PREVIEW_SIZE = width - 40;

interface WatermarkShareProps {
  photoUri: string;
  locationName?: string;
  username?: string;
  onClose?: () => void;
  isVideo?: boolean;
}

export const WatermarkShare: React.FC<WatermarkShareProps> = ({
  photoUri,
  locationName = "Pinc Location",
  username,
  onClose,
  isVideo = false,
}) => {
  const viewShotRef = useRef<ViewShot>(null);
  const [isSharing, setIsSharing] = useState(false);

  const handleShareMedia = async () => {
    if (isSharing) return;

    try {
      setIsSharing(true);

      let finalShareUri = photoUri;

      if (!isVideo) {
        // --- PHOTO WATERMARKING ---
        if (viewShotRef.current?.capture) {
          try {
            const capturedUri = await viewShotRef.current.capture();
            if (capturedUri) {
              finalShareUri = capturedUri;
            }
          } catch (captureErr) {
            console.warn("ViewShot photo capture warning:", captureErr);
          }
        }

        if (finalShareUri.startsWith('http://') || finalShareUri.startsWith('https://')) {
          const localPath = `${FileSystem.cacheDirectory}pinc_share_${Date.now()}.jpg`;
          const downloadRes = await FileSystem.downloadAsync(finalShareUri, localPath);
          finalShareUri = downloadRes.uri;
        }
      } else {
        // --- VIDEO SHARING (.mp4 PLAYABLE VIDEO) ---
        if (finalShareUri.startsWith('http://') || finalShareUri.startsWith('https://')) {
          const downloadPath = `${FileSystem.cacheDirectory}pinc_share_video_${Date.now()}.mp4`;
          const downloadRes = await FileSystem.downloadAsync(finalShareUri, downloadPath);
          finalShareUri = downloadRes.uri;
        }
      }

      const isAvailable = await Sharing.isAvailableAsync();
      if (!isAvailable) {
        Alert.alert('Not Supported', 'Sharing is not available on this device.');
        return;
      }

      const shareMimeType = isVideo ? 'video/mp4' : 'image/jpeg';
      const shareUTI = isVideo ? 'com.apple.quicktime-movie' : 'public.jpeg';

      // Open Native System Share Sheet
      await Sharing.shareAsync(finalShareUri, {
        mimeType: shareMimeType,
        dialogTitle: 'Share Pinc Memory',
        UTI: shareUTI,
      });
    } catch (error) {
      console.error('Error sharing media:', error);
      Alert.alert('Share Error', 'Could not complete sharing. Please try again.');
    } finally {
      setIsSharing(false);
    }
  };

  const formattedUsername = username
    ? (username.startsWith('@') ? username : `@${username}`)
    : '@pinc_user';

  return (
    <View style={styles.container}>
      {/* Media Card Preview with Middle-Left Watermark Badge */}
      <View style={styles.captureContainer}>
        <ViewShot
          ref={viewShotRef}
          options={{ format: 'jpg', quality: 1.0 }}
          style={styles.viewShotContainer}
        >
          {isVideo ? (
            <CachedVideo
              source={{ uri: photoUri }}
              style={styles.mediaItem}
              resizeMode="contain"
              shouldPlay={true}
              isLooping={true}
            />
          ) : (
            <Image
              source={{ uri: photoUri }}
              style={styles.mediaItem}
              contentFit="contain"
              cachePolicy="memory-disk"
            />
          )}

          {/* MIDDLE-LEFT WATERMARK BADGE */}
          <View style={styles.watermarkOverlayContainer} pointerEvents="none">
            <Image
              source={require("../assets/pinc_watermark_btn.png")}
              style={styles.watermarkLogoImage}
              contentFit="contain"
            />
            <Text style={styles.watermarkUsernameText}>{formattedUsername}</Text>
          </View>
        </ViewShot>
      </View>

      {/* Control Action Buttons (Blue Rocket Share + Circular X Close) */}
      <View style={styles.actionsContainer}>
        {isSharing && (
          <View style={styles.loadingRow}>
            <ActivityIndicator color="#0084FF" size="small" style={{ marginRight: 8 }} />
            <Text style={styles.loadingText}>กำลังเตรียมไฟล์สำหรับแชร์...</Text>
          </View>
        )}

        <View style={styles.controlButtonsRow}>
          {/* Blue Rocket Share Button */}
          <TouchableOpacity
            style={styles.blueRocketButton}
            onPress={handleShareMedia}
            disabled={isSharing}
            activeOpacity={0.85}
          >
            <Ionicons name="rocket" size={24} color="#FFFFFF" />
          </TouchableOpacity>

          {/* Circular Close X Button */}
          {onClose && (
            <TouchableOpacity
              style={styles.circleCloseButton}
              onPress={onClose}
              disabled={isSharing}
              activeOpacity={0.8}
            >
              <Ionicons name="close" size={24} color="#FFFFFF" />
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F0F14',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 20,
  },
  captureContainer: {
    width: PREVIEW_SIZE,
    height: PREVIEW_SIZE * 1.35,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: '#000000',
    ...PincTheme.shadows.lg,
  },
  viewShotContainer: {
    flex: 1,
    width: '100%',
    height: '100%',
    backgroundColor: '#000000',
  },
  mediaItem: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
  },
  watermarkOverlayContainer: {
    position: 'absolute',
    top: '40%',
    left: 16,
    zIndex: 100,
    alignItems: 'flex-start',
  },
  watermarkLogoImage: {
    width: 100,
    height: 42,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.6,
    shadowRadius: 4,
    elevation: 6,
  },
  watermarkUsernameText: {
    color: 'rgba(255, 255, 255, 0.65)',
    fontSize: 10,
    fontWeight: '600',
    marginTop: -8,
    marginLeft: 4,
    textShadowColor: 'rgba(0, 0, 0, 0.75)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
    fontFamily: PincTheme.fonts.body,
  },
  actionsContainer: {
    marginTop: 24,
    width: PREVIEW_SIZE,
    alignItems: 'center',
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  loadingText: {
    color: '#0084FF',
    fontSize: 13,
    fontWeight: '700',
  },
  controlButtonsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 20,
  },
  blueRocketButton: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: '#0084FF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0084FF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
    elevation: 8,
  },
  circleCloseButton: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.25)',
    ...PincTheme.shadows.md,
  },
});
