import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  SafeAreaView,
  RefreshControl,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { Pin, UserProfile, toggleLikePin } from '../services/firebase';
import { PincTheme } from '../styles/theme';
import { CachedVideo } from '../components/CachedVideo';

interface HomeFeedScreenProps {
  pins: Pin[];
  currentUser: UserProfile;
  onOpenUserProfile: (userId: string) => void;
  onNewPostPress: () => void;
}

export const HomeFeedScreen: React.FC<HomeFeedScreenProps> = ({
  pins,
  currentUser,
  onOpenUserProfile,
  onNewPostPress,
}) => {
  const [refreshing, setRefreshing] = useState(false);

  // Sort pins newest first
  const sortedPins = [...pins].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  const onRefresh = () => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 1000);
  };

  const renderPin = ({ item }: { item: Pin }) => {
    const isVideo = item.media_type === "video" || (item.image_url && item.image_url.includes(".mp4"));
    const safeUsername = item.username || "Unknown";
    const safeHandle = safeUsername.toLowerCase().replace(/\s+/g, '_');
    const timeFormatted = new Intl.DateTimeFormat('en-GB', { 
      day: 'numeric', month: 'short', 
      hour: '2-digit', minute: '2-digit' 
    }).format(new Date(item.timestamp));

    return (
      <View style={styles.card}>
        {/* Header */}
        <View style={styles.cardHeader}>
          <TouchableOpacity 
            style={styles.userInfo}
            onPress={() => onOpenUserProfile(item.userId)}
          >
            <Image 
              source={{ uri: item.user_profile_pic || 'https://via.placeholder.com/40' }} 
              style={styles.avatar} 
            />
            <View>
              <Text style={styles.username}>{safeUsername}</Text>
              <Text style={styles.handle}>@{safeHandle} • {timeFormatted}</Text>
            </View>
          </TouchableOpacity>
          <TouchableOpacity>
            <Ionicons name="ellipsis-horizontal" size={20} color={PincTheme.colors.textSecondary} />
          </TouchableOpacity>
        </View>

        {/* Content */}
        {item.text_content ? (
          <Text style={styles.content}>{item.text_content}</Text>
        ) : null}

        {/* Media */}
        {item.image_url ? (
          <View style={styles.mediaContainer}>
            {isVideo ? (
              <CachedVideo
                source={{ uri: item.image_url }}
                style={styles.media}
                resizeMode="cover"
                useNativeControls
                isLooping
              />
            ) : (
              <Image source={{ uri: item.image_url }} style={styles.media} contentFit="cover" />
            )}
          </View>
        ) : null}

        {/* Actions */}
        <View style={styles.actions}>
          <TouchableOpacity style={styles.actionButton}>
            <Ionicons name="heart-outline" size={24} color={PincTheme.colors.textPrimary} />
            <Text style={styles.actionText}>{item.likesCount || 0}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionButton}>
            <Ionicons name="chatbubble-outline" size={22} color={PincTheme.colors.textPrimary} />
            <Text style={styles.actionText}>{item.commentsCount || 0}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionButton}>
            <Ionicons name="share-social-outline" size={22} color={PincTheme.colors.textPrimary} />
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Reality Feed</Text>
          <Text style={styles.subtitle}>Welcome to the Pinc App Experience.</Text>
        </View>
        <TouchableOpacity style={styles.newPostBtn} onPress={onNewPostPress}>
          <Ionicons name="add" size={20} color="#FFF" />
          <Text style={styles.newPostText}>New Post</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={sortedPins}
        renderItem={renderPin}
        keyExtractor={(item) => item.pinId || item.timestamp.toString()}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={PincTheme.colors.primary} />}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>Loading feed or no posts available.</Text>
          </View>
        }
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: PincTheme.colors.background,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'android' ? 40 : 20,
    paddingBottom: 20,
  },
  title: {
    fontSize: 28,
    fontFamily: PincTheme.fonts.heading,
    fontWeight: '800',
    color: PincTheme.colors.primary,
  },
  subtitle: {
    fontSize: 14,
    color: PincTheme.colors.textSecondary,
    fontFamily: PincTheme.fonts.body,
    marginTop: 4,
  },
  newPostBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: PincTheme.colors.primary,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  newPostText: {
    color: '#FFF',
    fontWeight: '700',
    fontFamily: PincTheme.fonts.heading,
    marginLeft: 4,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 100, // Space for bottom tab bar
  },
  card: {
    backgroundColor: PincTheme.colors.card,
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: PincTheme.colors.border,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  userInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: 10,
    borderWidth: 1,
    borderColor: PincTheme.colors.border,
  },
  username: {
    fontSize: 15,
    fontWeight: '700',
    color: PincTheme.colors.textPrimary,
    fontFamily: PincTheme.fonts.heading,
  },
  handle: {
    fontSize: 12,
    color: PincTheme.colors.textSecondary,
    fontFamily: PincTheme.fonts.body,
    marginTop: 2,
  },
  content: {
    fontSize: 14,
    color: PincTheme.colors.textPrimary,
    fontFamily: PincTheme.fonts.body,
    lineHeight: 20,
    marginBottom: 12,
  },
  mediaContainer: {
    width: '100%',
    aspectRatio: 4/5,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: PincTheme.colors.border,
    marginBottom: 12,
  },
  media: {
    width: '100%',
    height: '100%',
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 20,
  },
  actionText: {
    color: PincTheme.colors.textPrimary,
    marginLeft: 6,
    fontSize: 14,
    fontWeight: '600',
  },
  emptyContainer: {
    padding: 40,
    alignItems: 'center',
  },
  emptyText: {
    color: PincTheme.colors.textSecondary,
    fontSize: 14,
  }
});
