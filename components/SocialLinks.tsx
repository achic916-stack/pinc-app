import React from 'react';
import { View, Text, TextInput, StyleSheet, TouchableOpacity, Linking, Alert } from 'react-native';
import { FontAwesome5 } from '@expo/vector-icons';
import { PincTheme } from '../styles/theme';

export interface SocialLinksData {
  instagramUrl?: string;
  facebookUrl?: string;
  tiktokUrl?: string;
}

export interface SocialLinksInputProps {
  socialLinks: SocialLinksData;
  onChange: (links: SocialLinksData) => void;
}

/**
 * Reusable Input component for social media links.
 */
export const SocialLinksInput: React.FC<SocialLinksInputProps> = ({ socialLinks, onChange }) => {
  const updateLink = (platform: keyof SocialLinksData, value: string) => {
    onChange({ ...socialLinks, [platform]: value });
  };

  return (
    <View style={styles.inputContainer}>
      <Text style={styles.sectionTitle}>Social Media Links (Optional)</Text>

      {/* Instagram */}
      <View style={styles.inputWrapper}>
        <FontAwesome5 name="instagram" size={20} color="#E1306C" style={styles.inputIcon} />
        <TextInput
          style={styles.textInput}
          placeholder="Paste Instagram URL or username"
          placeholderTextColor={PincTheme.colors.textTertiary}
          value={socialLinks.instagramUrl || ''}
          onChangeText={(val) => updateLink('instagramUrl', val)}
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>

      {/* Facebook */}
      <View style={styles.inputWrapper}>
        <FontAwesome5 name="facebook" size={20} color="#1877F2" style={styles.inputIcon} />
        <TextInput
          style={styles.textInput}
          placeholder="Paste Facebook URL"
          placeholderTextColor={PincTheme.colors.textTertiary}
          value={socialLinks.facebookUrl || ''}
          onChangeText={(val) => updateLink('facebookUrl', val)}
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>

      {/* TikTok */}
      <View style={styles.inputWrapper}>
        <FontAwesome5 name="tiktok" size={20} color="#000000" style={styles.inputIcon} />
        <TextInput
          style={styles.textInput}
          placeholder="Paste TikTok URL or @username"
          placeholderTextColor={PincTheme.colors.textTertiary}
          value={socialLinks.tiktokUrl || ''}
          onChangeText={(val) => updateLink('tiktokUrl', val)}
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>
    </View>
  );
};

export interface SocialLinksDisplayProps {
  socialLinks?: SocialLinksData;
  size?: number;
}

/**
 * Reusable Display component for rendering clickable social media icons.
 */
export const SocialLinksDisplay: React.FC<SocialLinksDisplayProps> = ({ socialLinks, size = 36 }) => {
  if (!socialLinks) return null;

  const { instagramUrl, facebookUrl, tiktokUrl } = socialLinks;
  if (!instagramUrl && !facebookUrl && !tiktokUrl) return null;

  const handleOpenLink = async (platform: string, url: string) => {
    let targetUrl = url.trim();

    try {
      // Basic formatting to handle usernames and pure URLs
      if (platform === 'instagram') {
        if (!targetUrl.startsWith('http')) {
          const username = targetUrl.replace('@', '');
          targetUrl = `https://instagram.com/${username}`;
        }
      } else if (platform === 'tiktok') {
        if (!targetUrl.startsWith('http')) {
          const username = targetUrl.startsWith('@') ? targetUrl : `@${targetUrl}`;
          targetUrl = `https://www.tiktok.com/${username}`;
        }
      } else if (platform === 'facebook') {
        if (!targetUrl.startsWith('http')) {
          targetUrl = `https://facebook.com/${targetUrl}`;
        }
      }

      // Deep linking attempt
      // React Native Linking will automatically try to route to the native app 
      // if the OS supports Universal Links / App Links for https:// domains.
      const supported = await Linking.canOpenURL(targetUrl);
      if (supported) {
        await Linking.openURL(targetUrl);
      } else {
        Alert.alert("Cannot Open", `Unable to open the link: ${targetUrl}`);
      }
    } catch (err) {
      console.error("Deep link error:", err);
      Alert.alert("Error", "Could not open the application.");
    }
  };

  return (
    <View style={styles.displayContainer}>
      {!!instagramUrl && (
        <TouchableOpacity
          style={[styles.iconButton, { width: size, height: size, borderRadius: size / 2 }]}
          onPress={() => handleOpenLink('instagram', instagramUrl)}
          activeOpacity={0.7}
        >
          <FontAwesome5 name="instagram" size={size * 0.55} color="#E1306C" />
        </TouchableOpacity>
      )}

      {!!facebookUrl && (
        <TouchableOpacity
          style={[styles.iconButton, { width: size, height: size, borderRadius: size / 2 }]}
          onPress={() => handleOpenLink('facebook', facebookUrl)}
          activeOpacity={0.7}
        >
          <FontAwesome5 name="facebook-f" size={size * 0.55} color="#1877F2" />
        </TouchableOpacity>
      )}

      {!!tiktokUrl && (
        <TouchableOpacity
          style={[styles.iconButton, { width: size, height: size, borderRadius: size / 2 }]}
          onPress={() => handleOpenLink('tiktok', tiktokUrl)}
          activeOpacity={0.7}
        >
          <FontAwesome5 name="tiktok" size={size * 0.55} color="#000000" />
        </TouchableOpacity>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  // Input Styles
  inputContainer: {
    marginVertical: 12,
  },
  sectionTitle: {
    fontSize: 14,
    fontFamily: PincTheme.fonts.heading,
    fontWeight: '700',
    color: PincTheme.colors.textPrimary,
    marginBottom: 12,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: PincTheme.colors.card,
    borderWidth: 1,
    borderColor: PincTheme.colors.border,
    borderRadius: PincTheme.borderRadius.md,
    paddingHorizontal: 12,
    marginBottom: 10,
    height: 48,
  },
  inputIcon: {
    marginRight: 10,
    width: 24,
    textAlign: 'center',
  },
  textInput: {
    flex: 1,
    fontSize: 14,
    fontFamily: PincTheme.fonts.body,
    color: PincTheme.colors.textPrimary,
  },

  // Display Styles
  displayContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconButton: {
    backgroundColor: PincTheme.colors.card,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: PincTheme.colors.border,
    ...PincTheme.shadows.sm,
  }
});
