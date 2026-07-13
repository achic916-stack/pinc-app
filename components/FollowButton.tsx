import React, { useState, useEffect } from 'react';
import { TouchableOpacity, Text, ActivityIndicator, StyleSheet, Alert } from 'react-native';
import { checkIsFollowing, toggleFollow } from '../services/firebase';
import { PincTheme } from '../styles/theme';
import { useTranslation } from 'react-i18next';

interface FollowButtonProps {
  currentUserId: string;
  targetUserId: string;
  size?: 'small' | 'default';
}

export const FollowButton: React.FC<FollowButtonProps> = ({ currentUserId, targetUserId, size = 'default' }) => {
  const { t } = useTranslation();
  const [isFollowing, setIsFollowing] = useState<boolean | null>(null);
  const [isToggling, setIsToggling] = useState(false);

  useEffect(() => {
    let mounted = true;
    if (currentUserId && targetUserId) {
      checkIsFollowing(currentUserId, targetUserId).then(status => {
        if (mounted) setIsFollowing(status);
      }).catch(err => {
        console.warn("Follow check error:", err);
      });
    }
    return () => { mounted = false; };
  }, [currentUserId, targetUserId]);

  const handleToggle = async () => {
    if (isToggling || isFollowing === null) return;
    const prevState = isFollowing;
    setIsToggling(true);
    setIsFollowing(!prevState); // optimistic update

    try {
      const nowFollowing = await toggleFollow(currentUserId, targetUserId);
      setIsFollowing(nowFollowing);
    } catch (err) {
      setIsFollowing(prevState);
      Alert.alert(t('error') || 'Error', t('failedToUpdateFollow') || 'Failed to update follow status.');
    } finally {
      setIsToggling(false);
    }
  };

  if (currentUserId === targetUserId) {
    return null; // Don't show follow button for own posts
  }

  // Still loading initial state
  if (isFollowing === null) {
    return null;
  }

  return (
    <TouchableOpacity 
      style={[
        styles.button, 
        isFollowing ? styles.buttonFollowing : styles.buttonFollow,
        size === 'small' && styles.buttonSmall
      ]}
      onPress={handleToggle}
      disabled={isToggling}
    >
      {isToggling ? (
        <ActivityIndicator size="small" color={isFollowing ? PincTheme.colors.primary : "#FFF"} />
      ) : (
        <Text style={[
          styles.text, 
          isFollowing ? styles.textFollowing : styles.textFollow,
          size === 'small' && styles.textSmall
        ]}>
          {isFollowing ? t('following') : t('follow')}
        </Text>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  button: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
  buttonFollow: {
    backgroundColor: PincTheme.colors.primary,
  },
  buttonFollowing: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: PincTheme.colors.primary,
  },
  text: {
    fontSize: 12,
    fontWeight: 'bold',
    fontFamily: PincTheme.fonts.heading,
  },
  textFollow: {
    color: '#FFF',
  },
  textFollowing: {
    color: PincTheme.colors.primary,
  },
  buttonSmall: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  textSmall: {
    fontSize: 10,
  }
});

