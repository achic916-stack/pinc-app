import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  Dimensions,
  Alert,
  Linking
} from 'react-native';
import { Image } from 'expo-image';
import * as Sharing from 'expo-sharing';
import ViewShot from 'react-native-view-shot';
import { Ionicons, FontAwesome5 } from '@expo/vector-icons';
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
  const [shareTarget, setShareTarget] = useState<string | null>(null);

  const handleShareMedia = async (targetApp: 'instagram' | 'tiktok' | 'facebook' | 'general') => {
    if (isSharing) return;

    try {
      setIsSharing(true);
      setShareTarget(targetApp);

      let finalShareUri = photoUri;

      // Capture watermarked ViewShot snapshot (works for both photo and video frame with watermark overlay)
      if (viewShotRef.current?.capture) {
        try {
          const capturedUri = await viewShotRef.current.capture();
          if (capturedUri) {
            finalShareUri = capturedUri;
          }
        } catch (captureErr) {
          console.warn("ViewShot capture warning:", captureErr);
        }
      }

      // Download remote http/https file to local cache for iOS/Android Share Sheet compatibility
      if (finalShareUri.startsWith('http://') || finalShareUri.startsWith('https://')) {
        const ext = isVideo ? '.mp4' : '.jpg';
        const localPath = `${FileSystem.cacheDirectory}pinc_share_${Date.now()}${ext}`;
        const downloadRes = await FileSystem.downloadAsync(finalShareUri, localPath);
        finalShareUri = downloadRes.uri;
      }

      const isAvailable = await Sharing.isAvailableAsync();
      if (!isAvailable) {
        Alert.alert('Not Supported', 'Sharing is not available on this device.');
        return;
      }

      // Direct Deep Link Redirection to Instagram
      if (targetApp === 'instagram') {
        const igSchemes = ['instagram-stories://share', 'instagram://app', 'instagram://'];
        for (const scheme of igSchemes) {
          try {
            const canOpen = await Linking.canOpenURL(scheme);
            if (canOpen) {
              await Sharing.shareAsync(finalShareUri, {
                mimeType: 'image/jpeg',
                dialogTitle: 'Share to Instagram',
                UTI: 'com.instagram.photo',
              });
              setTimeout(() => {
                Linking.openURL(scheme).catch(() => {});
              }, 500);
              return;
            }
          } catch (e) {
            console.warn("Instagram scheme check:", e);
          }
        }
      }

      // Direct Deep Link Redirection to TikTok
      if (targetApp === 'tiktok') {
        const tiktokSchemes = ['snssdk1128://', 'tiktok://', 'tiktoksharesdk://'];
        for (const scheme of tiktokSchemes) {
          try {
            const canOpen = await Linking.canOpenURL(scheme);
            if (canOpen) {
              await Sharing.shareAsync(finalShareUri, {
                mimeType: 'image/jpeg',
                dialogTitle: 'Share to TikTok',
                UTI: 'public.jpeg',
              });
              setTimeout(() => {
                Linking.openURL(scheme).catch(() => {});
              }, 500);
              return;
            }
          } catch (e) {
            console.warn("TikTok scheme check:", e);
          }
        }
      }

      // Direct Deep Link Redirection to Facebook
      if (targetApp === 'facebook') {
        const fbSchemes = ['fb://composer', 'fb://'];
        for (const scheme of fbSchemes) {
          try {
            const canOpen = await Linking.canOpenURL(scheme);
            if (canOpen) {
              await Sharing.shareAsync(finalShareUri, {
                mimeType: 'image/jpeg',
                dialogTitle: 'Share to Facebook',
                UTI: 'public.jpeg',
              });
              setTimeout(() => {
                Linking.openURL(scheme).catch(() => {});
              }, 500);
              return;
            }
          } catch (e) {
            console.warn("Facebook scheme check:", e);
          }
        }
      }

      // Fallback / General: Native System Share Sheet
      await Sharing.shareAsync(finalShareUri, {
        mimeType: 'image/jpeg',
        dialogTitle: 'Share Pinc Memory',
        UTI: 'public.jpeg',
      });
    } catch (error) {
      console.error('Error sharing media:', error);
      Alert.alert('Share Error', 'Could not complete sharing. Please try again.');
    } finally {
      setIsSharing(false);
      setShareTarget(null);
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
              resizeMode="cover"
              shouldPlay={true}
              isLooping={true}
            />
          ) : (
            <Image
              source={{ uri: photoUri }}
              style={styles.mediaItem}
              contentFit="cover"
              cachePolicy="memory-disk"
            />
          )}

          {/* MIDDLE-LEFT WATERMARK (pinc_watermark_btn + @username) */}
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

      {/* Social Media Sharing Buttons Bar (No header text) */}
      <View style={styles.actionsContainer}>
        <View style={styles.socialButtonsRow}>
          {/* Instagram Button */}
          <TouchableOpacity
            style={[styles.socialButton, { backgroundColor: '#E1306C' }]}
            onPress={() => handleShareMedia('instagram')}
            disabled={isSharing}
          >
            <Ionicons name="logo-instagram" size={20} color="#FFF" />
            <Text style={styles.socialButtonText}>Instagram</Text>
          </TouchableOpacity>

          {/* TikTok Button */}
          <TouchableOpacity
            style={[styles.socialButton, { backgroundColor: '#000000', borderWidth: 1, borderColor: '#333' }]}
            onPress={() => handleShareMedia('tiktok')}
            disabled={isSharing}
          >
            <FontAwesome5 name="tiktok" size={16} color="#FFF" />
            <Text style={styles.socialButtonText}>TikTok</Text>
          </TouchableOpacity>

          {/* Facebook Button */}
          <TouchableOpacity
            style={[styles.socialButton, { backgroundColor: '#1877F2' }]}
            onPress={() => handleShareMedia('facebook')}
            disabled={isSharing}
          >
            <Ionicons name="logo-facebook" size={20} color="#FFF" />
            <Text style={styles.socialButtonText}>Facebook</Text>
          </TouchableOpacity>

          {/* General / Other Apps Button */}
          <TouchableOpacity
            style={[styles.socialButton, { backgroundColor: PincTheme.colors.primary }]}
            onPress={() => handleShareMedia('general')}
            disabled={isSharing}
          >
            <Ionicons name="share-social" size={18} color="#FFF" />
            <Text style={styles.socialButtonText}>แชร์แอปอื่น</Text>
          </TouchableOpacity>
        </View>

        {isSharing && (
          <View style={styles.loadingRow}>
            <ActivityIndicator color="#E4007F" size="small" style={{ marginRight: 8 }} />
            <Text style={styles.loadingText}>กำลังเตรียมไฟล์สำหรับแชร์...</Text>
          </View>
        )}

        {onClose && (
          <TouchableOpacity
            style={styles.cancelButton}
            onPress={onClose}
            disabled={isSharing}
          >
            <Text style={styles.cancelText}>ปิดหน้าต่าง (Close)</Text>
          </TouchableOpacity>
        )}
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
    height: PREVIEW_SIZE * 1.45, // 9:13 aspect ratio
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: '#1E1E28',
    ...PincTheme.shadows.lg,
  },
  viewShotContainer: {
    flex: 1,
    width: '100%',
    height: '100%',
    backgroundColor: '#1E1E28',
  },
  mediaItem: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
  },
  watermarkOverlayContainer: {
    position: 'absolute',
    top: '42%',
    left: 16,
    zIndex: 100,
    alignItems: 'flex-start',
  },
  watermarkLogoImage: {
    width: 110,
    height: 48,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.6,
    shadowRadius: 4,
    elevation: 6,
  },
  watermarkUsernameText: {
    color: 'rgba(255, 255, 255, 0.85)',
    fontSize: 13,
    fontWeight: '600',
    marginTop: 2,
    marginLeft: 4,
    textShadowColor: 'rgba(0, 0, 0, 0.85)',
    textShadowOffset: { width: 0, height: 1.5 },
    textShadowRadius: 4,
    fontFamily: PincTheme.fonts.body,
  },
  actionsContainer: {
    marginTop: 20,
    width: PREVIEW_SIZE,
    alignItems: 'center',
  },
  socialButtonsRow: {
    flexDirection: 'row',
    gap: 6,
    width: '100%',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  socialButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 14,
    gap: 4,
    ...PincTheme.shadows.md,
  },
  socialButtonText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
    fontFamily: PincTheme.fonts.heading,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  loadingText: {
    color: '#E4007F',
    fontSize: 12,
    fontWeight: '700',
  },
  cancelButton: {
    paddingVertical: 8,
  },
  cancelText: {
    color: '#888899',
    fontSize: 14,
    fontWeight: '600',
  },
});
