import React, { useState, useMemo, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  SafeAreaView,
  RefreshControl,
  Platform,
  ScrollView,
  Alert,
  Share,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { Pin, UserProfile, toggleLikePin, calculateDistance, deletePin, toggleSavePin } from '../services/firebase';
import { PincTheme } from '../styles/theme';
import { CachedVideo } from '../components/CachedVideo';
import { CommentsDrawer } from '../components/CommentsDrawer';
import { FollowButton } from '../components/FollowButton';

interface HomeFeedScreenProps {
  pins: Pin[];
  currentUser: UserProfile;
  onOpenUserProfile: (userId: string) => void;
  onNewPostPress: () => void;
  onStartVideoPost?: () => void;
  onStartPhotoPost?: () => void;
  onStartGalleryPost?: () => void;
}

export const HomeFeedScreen: React.FC<HomeFeedScreenProps> = ({
  pins,
  currentUser,
  onOpenUserProfile,
  onNewPostPress,
  onStartVideoPost,
  onStartPhotoPost,
  onStartGalleryPost,
}) => {
  const [refreshing, setRefreshing] = useState(false);
  const [isPostMenuOpen, setIsPostMenuOpen] = useState(false);
  const [commentPinId, setCommentPinId] = useState<string | null>(null);
  const [aspectRatios, setAspectRatios] = useState<Record<string, number>>({});
  const [activeVideoId, setActiveVideoId] = useState<string | null>(null);
  
  // Local state to instantly toggle bookmark UI
  const [localSavedPins, setLocalSavedPins] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    if (currentUser.savedPins) {
      currentUser.savedPins.forEach(id => {
        initial[id] = true;
      });
    }
    return initial;
  });

  const onViewableItemsChanged = useRef(({ viewableItems }: any) => {
    const visibleVideo = viewableItems.find((itemInfo: any) => {
      const pin = itemInfo.item as Pin;
      return pin.media_type === "video" || (pin.image_url && pin.image_url.includes(".mp4")) || (pin.media_urls && pin.media_urls.some(url => url.includes(".mp4")));
    });

    if (visibleVideo) {
      setActiveVideoId(visibleVideo.item.pinId || visibleVideo.item.timestamp.toString());
    } else {
      setActiveVideoId(null);
    }
  }).current;

  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 60 }).current;

  // Grouping pins by user and 500m distance
  const clusteredPins = useMemo(() => {
    // Sort oldest first to use the first uploaded pin as the anchor
    const sortedOldestFirst = [...pins].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    const groups: Pin[][] = [];
    const processed = new Set<string>();

    for (const pin of sortedOldestFirst) {
      if (processed.has(pin.pinId!)) continue;
      const currentGroup = [pin];
      processed.add(pin.pinId!);

      for (const otherPin of sortedOldestFirst) {
        if (processed.has(otherPin.pinId!)) continue;
        const distance = calculateDistance(pin.latitude, pin.longitude, otherPin.latitude, otherPin.longitude);
        // If within 500m AND same user, group them
        if (distance <= 500 && pin.userId === otherPin.userId) {
          currentGroup.push(otherPin);
          processed.add(otherPin.pinId!);
        }
      }
      groups.push(currentGroup);
    }

    // Map groups back to a single representative 'Pin' object that has media_urls
    return groups.map(group => {
      if (group.length === 1) return group[0];
      
      const anchorPin = { ...group[0] };
      // Combine all media URLs
      const allMedia = group.map(p => p.image_url).filter(Boolean) as string[];
      if (allMedia.length > 1) {
        anchorPin.media_urls = allMedia;
      }
      
      // Update timestamp to the latest pin in the group so it bubbles up the feed
      const latestTime = Math.max(...group.map(p => new Date(p.timestamp).getTime()));
      anchorPin.timestamp = new Date(latestTime) as any;
      
      return anchorPin;
    });
  }, [pins]);

  // Sorting pins (newest first)
  const sortedPins = [...clusteredPins].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  const onRefresh = () => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 1000);
  };

  const handleLike = async (pinId: string) => {
    try {
      await toggleLikePin(pinId, currentUser.userId);
    } catch (e) {
      console.error(e);
    }
  };

  const handleOptionsPress = (item: Pin) => {
    if (item.userId === currentUser.userId) {
      Alert.alert("Post Options", "What would you like to do?", [
        { text: "Delete Post", style: "destructive", onPress: () => {
          Alert.alert("Confirm Delete", "Are you sure you want to delete this post?", [
            { text: "Cancel", style: "cancel" },
            { text: "Delete", style: "destructive", onPress: async () => {
              try {
                if (item.pinId) {
                  await deletePin(item.pinId);
                  Alert.alert("Success", "Post deleted successfully.");
                }
              } catch (e) {
                Alert.alert("Error", "Failed to delete post.");
              }
            }}
          ]);
        }},
        { text: "Cancel", style: "cancel" }
      ]);
    } else {
      Alert.alert("Post Options", "What would you like to do?", [
        { text: "Report Post", style: "destructive", onPress: () => {
          Alert.alert("Report", "This post has been reported for review.");
        }},
        { text: "Cancel", style: "cancel" }
      ]);
    }
  };

  const handleShare = async (pin: Pin) => {
    try {
      await Share.share({
        message: `Check out this post by @${pin.username} on Pinc!`,
        url: pin.image_url || undefined,
      });
    } catch (error) {
      console.error('Share failed', error);
    }
  };

  const handleToggleSave = async (pinId: string) => {
    const isCurrentlySaved = localSavedPins[pinId];
    
    // Optimistic UI update
    setLocalSavedPins(prev => ({
      ...prev,
      [pinId]: !isCurrentlySaved
    }));

    try {
      const isSavedNow = await toggleSavePin(pinId, currentUser.userId);
      // Sync with actual server result
      setLocalSavedPins(prev => ({
        ...prev,
        [pinId]: isSavedNow
      }));
    } catch (err) {
      console.error('Save pin failed', err);
      // Revert if failed
      setLocalSavedPins(prev => ({
        ...prev,
        [pinId]: isCurrentlySaved
      }));
      Alert.alert("Error", "Failed to save post.");
    }
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
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text style={styles.username}>{safeUsername}</Text>
                <FollowButton currentUserId={currentUser.userId} targetUserId={item.userId} />
              </View>
              <Text style={styles.handle}>@{safeHandle} • {timeFormatted}</Text>
            </View>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => handleOptionsPress(item)}>
            <Ionicons name="ellipsis-horizontal" size={20} color={PincTheme.colors.textSecondary} />
          </TouchableOpacity>
        </View>

        {/* Content */}
        {item.text_content ? (
          <Text style={styles.content}>{item.text_content}</Text>
        ) : null}

        {/* Media */}
        {(item.media_urls && item.media_urls.length > 1) ? (
          <ScrollView 
            horizontal 
            showsHorizontalScrollIndicator={false} 
            style={[styles.mediaContainer, { aspectRatio: aspectRatios[item.media_urls[0]] || 4/5 }]}
            snapToInterval={Dimensions.get('window').width}
            decelerationRate="fast"
            snapToAlignment="center"
          >
            {item.media_urls.map((url, index) => {
              const isVid = item.media_type === "video" || url.includes(".mp4");
              return (
                <View key={index} style={{ width: Dimensions.get('window').width }}>
                  {isVid ? (
                    <CachedVideo
                      source={{ uri: url }}
                      style={styles.media}
                      resizeMode="contain"
                      useNativeControls
                      isLooping
                      shouldPlay={activeVideoId === (item.pinId || item.timestamp.toString())}
                    />
                  ) : (
                    <Image 
                      source={{ uri: url }} 
                      style={styles.media} 
                      contentFit="contain" 
                      onLoad={(e) => {
                        if (index === 0 && e.source.width && e.source.height) {
                          setAspectRatios(prev => ({ ...prev, [url]: e.source.width / e.source.height }));
                        }
                      }}
                    />
                  )}
                </View>
              );
            })}
          </ScrollView>
        ) : item.image_url ? (
          <View style={[styles.mediaContainer, { aspectRatio: aspectRatios[item.image_url] || 4/5 }]}>
            {isVideo ? (
              <CachedVideo
                source={{ uri: item.image_url }}
                style={styles.media}
                resizeMode="contain"
                useNativeControls
                isLooping
                shouldPlay={activeVideoId === (item.pinId || item.timestamp.toString())}
              />
            ) : (
              <Image 
                source={{ uri: item.image_url }} 
                style={styles.media} 
                contentFit="contain"
                onLoad={(e) => {
                  if (e.source.width && e.source.height) {
                    setAspectRatios(prev => ({ ...prev, [item.image_url]: e.source.width / e.source.height }));
                  }
                }}
              />
            )}
          </View>
        ) : null}

        {/* Actions */}
        <View style={[styles.actions, { justifyContent: 'space-between' }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <TouchableOpacity 
              style={styles.actionButton}
              onPress={() => item.pinId && handleLike(item.pinId)}
            >
              <Ionicons 
                name={item.likes?.includes(currentUser.userId) ? "heart" : "heart-outline"} 
                size={24} 
                color={item.likes?.includes(currentUser.userId) ? PincTheme.colors.primary : PincTheme.colors.textPrimary} 
              />
              <Text style={styles.actionText}>{item.likesCount || item.likes?.length || 0}</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={styles.actionButton}
              onPress={() => item.pinId && setCommentPinId(item.pinId)}
            >
              <Ionicons name="chatbubble-outline" size={22} color={PincTheme.colors.textPrimary} />
              <Text style={styles.actionText}>{item.commentsCount || 0}</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={styles.actionButton}
              onPress={() => handleShare(item)}
            >
              <Ionicons name="share-social-outline" size={22} color={PincTheme.colors.textPrimary} />
            </TouchableOpacity>
          </View>
          
          <TouchableOpacity 
            style={{ padding: 4 }}
            onPress={() => item.pinId && handleToggleSave(item.pinId)}
          >
            <Ionicons 
              name={(item.pinId && localSavedPins[item.pinId]) ? "bookmark" : "bookmark-outline"} 
              size={24} 
              color={(item.pinId && localSavedPins[item.pinId]) ? PincTheme.colors.primary : PincTheme.colors.textPrimary} 
            />
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
        <View style={[styles.header, { zIndex: 10 }]}>
          <View style={{ flex: 1 }} />
          <View style={{ flex: 2, alignItems: 'center' }}>
            <Image 
              source={require("../assets/pinc_story_btn.png")} 
              style={{ width: 80, height: 40 }} 
              contentFit="contain" 
            />
          </View>
          <View style={{ flex: 1, alignItems: 'flex-end', position: 'relative', zIndex: 20 }}>
            <TouchableOpacity 
              style={styles.newPostBtn} 
              onPress={() => setIsPostMenuOpen(!isPostMenuOpen)}
            >
              <Ionicons name="add" size={32} color="#FFF" />
            </TouchableOpacity>
            
            {isPostMenuOpen && (
              <View style={{
                position: 'absolute',
                top: 45,
                right: 0,
                backgroundColor: 'rgba(15, 15, 20, 0.95)',
                borderRadius: 12,
                borderWidth: 1,
                borderColor: PincTheme.colors.border,
                width: 140,
                zIndex: 999,
                elevation: 10,
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 5 },
                shadowOpacity: 0.5,
                shadowRadius: 10,
              }}>
                <TouchableOpacity 
                  style={{ paddingVertical: 12, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)' }}
                  onPress={() => { setIsPostMenuOpen(false); onStartVideoPost?.(); }}
                >
                  <Text style={{ color: '#FFF', fontWeight: '600', textAlign: 'center', fontSize: 13 }}>VIDEO</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={{ paddingVertical: 12, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)' }}
                  onPress={() => { setIsPostMenuOpen(false); onStartPhotoPost?.(); }}
                >
                  <Text style={{ color: '#FFF', fontWeight: '600', textAlign: 'center', fontSize: 13 }}>PHOTO</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={{ paddingVertical: 12, paddingHorizontal: 16 }}
                  onPress={() => { setIsPostMenuOpen(false); onStartGalleryPost?.(); }}
                >
                  <Text style={{ color: '#FFF', fontWeight: '600', textAlign: 'center', fontSize: 13 }}>ALBUM</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>

      <FlatList
        data={sortedPins}
        renderItem={renderPin}
        keyExtractor={(item) => item.pinId || item.timestamp.toString()}
        extraData={activeVideoId}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={PincTheme.colors.primary} />}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>Loading feed or no posts available.</Text>
          </View>
        }
      />

      <CommentsDrawer
        visible={!!commentPinId}
        pinId={commentPinId}
        currentUser={currentUser}
        onClose={() => setCommentPinId(null)}
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
    position: 'absolute',
    top: Platform.OS === 'android' ? 30 : 50,
    left: 16,
    right: 16,
    height: 52,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  title: {
    fontSize: 28,
    fontFamily: PincTheme.fonts.heading,
    fontWeight: '600',
    color: PincTheme.colors.primary,
  },
  newPostBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: 36,
    height: 36,
  },
  newPostText: {
    color: '#FFF',
    fontWeight: '700',
    fontFamily: PincTheme.fonts.heading,
    marginLeft: 4,
  },
  listContent: {
    paddingHorizontal: 0,
    paddingTop: Platform.OS === 'android' ? 100 : 80, // Space for the top floating header
    paddingBottom: 100, // Space for bottom tab bar
  },
  card: {
    backgroundColor: PincTheme.colors.background,
    padding: 0,
    marginBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: PincTheme.colors.border,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    paddingHorizontal: 16,
    paddingTop: 16,
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
    paddingHorizontal: 16,
  },
  mediaContainer: {
    width: '100%',
    borderRadius: 0,
    overflow: 'hidden',
    backgroundColor: '#0F0F14',
    marginBottom: 12,
  },
  media: {
    width: '100%',
    height: '100%',
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 16,
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
