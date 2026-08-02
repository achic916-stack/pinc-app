import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  Dimensions,
  Platform,
  Alert,
  Linking
} from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
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

  const handleShareMedia = async (targetApp?: 'instagram' | 'tiktok' | 'general') => {
    if (isSharing) return;

    try {
      setIsSharing(true);
      setShareTarget(targetApp || 'general');

      let finalShareUri = photoUri;

      // If photo, capture watermarked ViewShot snapshot
      if (!isVideo && viewShotRef.current?.capture) {
        const capturedUri = await viewShotRef.current.capture();
        if (capturedUri) {
          finalShareUri = capturedUri;
        }
      }

      // Download remote http/https file to local cache for iOS Share Sheet compatibility
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

      // Handle App Specific Deep Links safely
      if (targetApp === 'instagram') {
        try {
          const instagramUrl = 'instagram://app';
          const canOpen = await Linking.canOpenURL(instagramUrl);
          if (canOpen) {
            await Sharing.shareAsync(finalShareUri, {
              mimeType: isVideo ? 'video/mp4' : 'image/jpeg',
              dialogTitle: 'Share to Instagram',
              UTI: isVideo ? 'com.apple.quicktime-movie' : 'public.jpeg',
            });
            return;
          }
        } catch (e) {
          console.warn("Instagram deep link check warning:", e);
        }
      }

      if (targetApp === 'tiktok') {
        try {
          const tiktokUrl = 'snssdk1128://';
          const canOpen = await Linking.canOpenURL(tiktokUrl);
          if (canOpen) {
            await Sharing.shareAsync(finalShareUri, {
              mimeType: isVideo ? 'video/mp4' : 'image/jpeg',
              dialogTitle: 'Share to TikTok',
              UTI: isVideo ? 'com.apple.quicktime-movie' : 'public.jpeg',
            });
            return;
          }
        } catch (e) {
          console.warn("TikTok deep link check warning:", e);
        }
      }

      // Fallback: Native System Share Sheet (Supports IG, TikTok, FB, LINE, etc.)
      await Sharing.shareAsync(finalShareUri, {
        mimeType: isVideo ? 'video/mp4' : 'image/jpeg',
        dialogTitle: 'Share Pinc Memory',
        UTI: isVideo ? 'com.apple.quicktime-movie' : 'public.jpeg',
      });
    } catch (error) {
      console.error('Error sharing media:', error);
      Alert.alert('Share Error', 'Could not complete sharing. Please try again.');
    } finally {
      setIsSharing(false);
      setShareTarget(null);
    }
  };

  return (
    <View style={styles.container}>
      {/* Media Card Preview with Top-Left Watermark Badge */}
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

          {/* TOP-CENTER SINGLE LOGO WATERMARK (pinc_story_btn) */}
          <View style={styles.topCenterWatermarkContainer} pointerEvents="none">
            <Image
              source={require("../assets/pinc_story_btn.png")}
              style={styles.pincLogoImage}
              contentFit="contain"
            />
          </View>
        </ViewShot>
      </View>

      {/* Social Media Sharing Buttons */}
      <View style={styles.actionsContainer}>
        <Text style={styles.shareTitleText}>
          {isVideo ? '🎬 แชร์วิดีโอนี้ไปยังโซเชียล' : '📸 แชร์รูปภาพนี้ไปยังโซเชียล'}
        </Text>

        <View style={styles.socialButtonsRow}>
          {/* Instagram Button */}
          <TouchableOpacity
            style={[styles.socialButton, { backgroundColor: '#E1306C' }]}
            onPress={() => handleShareMedia('instagram')}
            disabled={isSharing}
          >
            <Ionicons name="logo-instagram" size={22} color="#FFF" />
            <Text style={styles.socialButtonText}>Instagram</Text>
          </TouchableOpacity>

          {/* TikTok Button */}
          <TouchableOpacity
            style={[styles.socialButton, { backgroundColor: '#000000', borderWidth: 1, borderColor: '#333' }]}
            onPress={() => handleShareMedia('tiktok')}
            disabled={isSharing}
          >
            <FontAwesome5 name="tiktok" size={18} color="#FFF" />
            <Text style={styles.socialButtonText}>TikTok</Text>
          </TouchableOpacity>

          {/* General / Facebook Share Button */}
          <TouchableOpacity
            style={[styles.socialButton, { backgroundColor: PincTheme.colors.primary }]}
            onPress={() => handleShareMedia('general')}
            disabled={isSharing}
          >
            <Ionicons name="share-social" size={20} color="#FFF" />
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
  topCenterWatermarkContainer: {
    position: 'absolute',
    top: 14,
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 100,
  },
  pincLogoImage: {
    width: 90,
    height: 42,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.6,
    shadowRadius: 4,
    elevation: 6,
  },
  actionsContainer: {
    marginTop: 20,
    width: PREVIEW_SIZE,
    alignItems: 'center',
  },
  shareTitleText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 12,
    fontFamily: PincTheme.fonts.heading,
  },
  socialButtonsRow: {
    flexDirection: 'row',
    gap: 8,
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
    borderRadius: 16,
    gap: 6,
    ...PincTheme.shadows.md,
  },
  socialButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
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
