import React, { useState, useMemo, useRef, useCallback, useEffect } from 'react';
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
  Modal,
  TouchableWithoutFeedback,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { Pin, UserProfile, toggleLikePin, calculateDistance, deletePin, toggleSavePin, cleanupMyExpiredStories, reportPin } from '../services/firebase';
import { PincTheme } from '../styles/theme';
import { CachedVideo } from '../components/CachedVideo';
import { WatermarkShare } from '../components/WatermarkShare';
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
  onGoToMap?: (latitude: number, longitude: number) => void;
  selectedPin?: Pin | null;
  isVisible: boolean;
}


interface FeedPinItemProps {
  item: Pin;
  isActiveVideo: boolean;
  currentUser: UserProfile;
  localSavedPins: Record<string, boolean>;
  onOpenUserProfile: (userId: string) => void;
  handleOptionsPress: (item: Pin) => void;
  handleLike: (pinId: string) => void;
  setCommentPinId: (pinId: string) => void;
  handleShare: (item: Pin) => void;
  handleToggleSave: (pinId: string) => void;
  onGoToMap?: (latitude: number, longitude: number) => void;
}

const FeedPinItem: React.FC<FeedPinItemProps> = React.memo(({ 
  item, isActiveVideo, currentUser, localSavedPins, 
  onOpenUserProfile, handleOptionsPress, handleLike, 
  setCommentPinId, handleShare, handleToggleSave, onGoToMap
}) => {
  const [localAspectRatios, setLocalAspectRatios] = useState<Record<string, number>>({});
  const [activeMediaIndex, setActiveMediaIndex] = useState(0);

  const [liked, setLiked] = useState(item.likes?.includes(currentUser.userId) || false);
  const [likesCount, setLikesCount] = useState(item.likesCount || item.likes?.length || 0);
  const [lastTap, setLastTap] = useState(0);

  const handleDoubleTap = () => {
    const now = Date.now();
    const DOUBLE_PRESS_DELAY = 300;
    if (lastTap && (now - lastTap) < DOUBLE_PRESS_DELAY) {
      if (!liked) {
        onLikePress();
      }
      setLastTap(0);
    } else {
      setLastTap(now);
    }
  };

  useEffect(() => {
    setLiked(item.likes?.includes(currentUser.userId) || false);
    setLikesCount(item.likesCount || item.likes?.length || 0);
  }, [item.likes, item.likesCount, currentUser.userId]);

  const onLikePress = () => {
    if (!item.pinId) return;
    const nextLiked = !liked;
    setLiked(nextLiked);
    setLikesCount(prev => prev + (nextLiked ? 1 : -1));
    handleLike(item.pinId);
  };

  const handleScroll = (event: any) => {
    const slideSize = event.nativeEvent.layoutMeasurement.width;
    const index = event.nativeEvent.contentOffset.x / slideSize;
    setActiveMediaIndex(Math.round(index));
  };

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
            style={[styles.userInfo, { flex: 1, paddingRight: 10 }]}
            onPress={() => onOpenUserProfile(item.userId)}
          >
            <Image 
              source={{ uri: item.user_profile_pic || 'https://via.placeholder.com/40' }} 
              style={styles.avatar} 
            />
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text style={[styles.username, { flexShrink: 1 }]} numberOfLines={1}>{safeUsername}</Text>
                {item.post_type === "live_news" ? (
                  <View style={{
                    backgroundColor: PincTheme.colors.crowdRed,
                    paddingHorizontal: 6,
                    paddingVertical: 2,
                    borderRadius: 6,
                    marginLeft: 8,
                    marginTop: 2,
                    flexShrink: 0
                  }}>
                    <Text style={{ color: '#FFF', fontSize: 9, fontWeight: '900', letterSpacing: 0.5 }}>STORY</Text>
                  </View>
                ) : null}
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 2 }}>
                <Text style={[styles.handle, { marginTop: 0 }]}>{timeFormatted}</Text>
                <FollowButton currentUserId={currentUser.userId} targetUserId={item.userId} size="small" />
              </View>
            </View>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => handleOptionsPress(item)} style={{ padding: 4 }}>
            <Ionicons name="ellipsis-vertical" size={20} color={PincTheme.colors.textSecondary} />
          </TouchableOpacity>
        </View>

        {/* Content */}
        {(() => {
          let displayText = item.text_content || "";
          if (displayText.includes("Current Location")) {
            displayText = displayText.replace(/\n?📍\s*Current Location.*/g, '');
          } else if (item.is_gallery) {
            displayText = displayText.replace(/\n?📍.*/g, '');
          }
          displayText = displayText.trim();
          return displayText ? <Text style={styles.content}>{displayText}</Text> : null;
        })()}

        {/* Media */}
        {(item.media_urls && item.media_urls.length > 1) ? (
          <View style={{ position: 'relative' }}>
            <ScrollView 
              horizontal 
              showsHorizontalScrollIndicator={false} 
              style={[styles.mediaContainer, { aspectRatio: localAspectRatios[item.media_urls[0]] || 4/5, marginBottom: 0 }]}
              snapToInterval={Dimensions.get('window').width}
              decelerationRate="fast"
              snapToAlignment="center"
              onMomentumScrollEnd={handleScroll}
              onScrollEndDrag={handleScroll}
            >
              {item.media_urls.map((url, index) => {
                const isVid = item.media_type === "video" || url.includes(".mp4");
                return (
                  <View key={index} style={{ width: Dimensions.get('window').width }}>
                    <TouchableWithoutFeedback onPress={handleDoubleTap}>
                      <View style={{ flex: 1 }}>
                        {isVid ? (
                          <CachedVideo
                            source={{ uri: url }}
                            style={styles.media}
                            resizeMode="contain"
                            useNativeControls
                            isLooping
                            shouldPlay={isActiveVideo && activeMediaIndex === index}
                          />
                        ) : (
                          <Image 
                            source={{ uri: url }} 
                            style={styles.media} 
                            contentFit="contain" 
                            onLoad={(e) => {
                              if (index === 0 && e.source.width && e.source.height) {
                                setLocalAspectRatios(prev => ({ ...prev, [url]: e.source.width / e.source.height }));
                              }
                            }}
                          />
                        )}
                      </View>
                    </TouchableWithoutFeedback>
                  </View>
                );
              })}
            </ScrollView>
            
            {/* Pagination Dots */}
            <View style={styles.paginationContainer}>
              {item.media_urls.map((_, idx) => (
                <View 
                  key={idx} 
                  style={[styles.paginationDot, activeMediaIndex === idx && styles.paginationDotActive]} 
                />
              ))}
            </View>
          </View>
        ) : item.image_url ? (
          <View style={[styles.mediaContainer, { aspectRatio: localAspectRatios[item.image_url] || 4/5 }]}>
            <TouchableWithoutFeedback onPress={handleDoubleTap}>
              <View style={{ flex: 1 }}>
                {isVideo ? (
                  <CachedVideo
                    source={{ uri: item.image_url }}
                    style={styles.media}
                    resizeMode="contain"
                    useNativeControls
                    isLooping
                    shouldPlay={isActiveVideo}
                  />
                ) : (
                  <Image 
                    source={{ uri: item.image_url }} 
                    style={styles.media} 
                    contentFit="contain"
                    onLoad={(e) => {
                      if (e.source.width && e.source.height) {
                        setLocalAspectRatios(prev => ({ ...prev, [item.image_url]: e.source.width / e.source.height }));
                      }
                    }}
                  />
                )}
              </View>
            </TouchableWithoutFeedback>
          </View>
        ) : null}

        {/* Actions */}
        <View style={[styles.actions, { justifyContent: 'space-between' }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <TouchableOpacity 
              style={styles.actionButton}
              onPress={onLikePress}
            >
              <Ionicons 
                name={liked ? "heart" : "heart-outline"} 
                size={24} 
                color={liked ? PincTheme.colors.primary : PincTheme.colors.textPrimary} 
              />
              <Text style={styles.actionText}>{likesCount}</Text>
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

        {/* Go To Map Button (Only for Venue Pins) */}
        {item.venueId && item.venueId !== "gallery_post" && (
          <TouchableOpacity 
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              paddingVertical: 8,
              paddingHorizontal: 16,
              marginHorizontal: 16,
              marginBottom: 12,
              borderRadius: 8,
              backgroundColor: PincTheme.colors.primaryLight,
              borderWidth: 1,
              borderColor: PincTheme.colors.primary,
            }}
            onPress={() => onGoToMap?.(item.latitude, item.longitude)}
          >
            <Ionicons name="map-outline" size={16} color={PincTheme.colors.primary} style={{ marginRight: 6 }} />
            <Text style={{ fontSize: 13, fontWeight: '700', color: PincTheme.colors.primary }}>Go To Map</Text>
          </TouchableOpacity>
        )}
    </View>
  );
});

export const HomeFeedScreen: React.FC<HomeFeedScreenProps> = ({
  pins,
  currentUser,
  onOpenUserProfile,
  onNewPostPress,
  onStartVideoPost,
  onStartPhotoPost,
  onStartGalleryPost,
  onGoToMap,
  selectedPin,
  isVisible,
}) => {
  const flatListRef = useRef<FlatList>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [isPostMenuOpen, setIsPostMenuOpen] = useState(false);
  const [commentPinId, setCommentPinId] = useState<string | null>(null);
  const [aspectRatios, setAspectRatios] = useState<Record<string, number>>({});
  const [activeVideoId, setActiveVideoId] = useState<string | null>(null);
  
  // Local state to instantly toggle bookmark UI
  const [localSavedPins, setLocalSavedPins] = useState<Record<string, boolean>>({});
  const [localHiddenPins, setLocalHiddenPins] = useState<Record<string, boolean>>({});
  const [sharePin, setSharePin] = useState<Pin | null>(null);

  useEffect(() => {
    if (currentUser?.userId) {
      cleanupMyExpiredStories(currentUser.userId).catch(err => console.log("Cleanup err:", err));
    }
  }, [currentUser?.userId]);

  useEffect(() => {
    const initial: Record<string, boolean> = {};
    if (currentUser.savedPins) {
      currentUser.savedPins.forEach(id => {
        initial[id] = true;
      });
    }
    setLocalSavedPins(initial);
  }, [currentUser.savedPins]);

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

  // Grouping pins for Feed (Map posts within 500m & 4 hours get clustered)
  const sortedPins = useMemo(() => {
    let validPins = [...pins].filter(p => {
      if (p.pinId && localHiddenPins[p.pinId]) return false;
      if (currentUser.blockedUsers?.includes(p.userId)) return false;
      if (p.pinId && currentUser.reportedPins?.includes(p.pinId)) return false;
      return true;
    });

    // Sort oldest first to form groups properly
    validPins.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    const processed = new Set<string>();
    const clustered: Pin[] = [];

    for (const pin of validPins) {
      if (processed.has(pin.pinId!)) continue;
      processed.add(pin.pinId!);

      // Only group if it has location (map pin)
      if (pin.latitude === undefined || pin.longitude === undefined || (pin.latitude === 0 && pin.longitude === 0)) {
        clustered.push(pin);
        continue;
      }

      const cluster = [pin];
      for (const otherPin of validPins) {
        if (processed.has(otherPin.pinId!)) continue;
        if (pin.userId !== otherPin.userId) continue;
        if (otherPin.latitude === undefined || otherPin.longitude === undefined || (otherPin.latitude === 0 && otherPin.longitude === 0)) continue;

        const distance = calculateDistance(pin.latitude, pin.longitude, otherPin.latitude, otherPin.longitude);
        const timeDiffHours = Math.abs(new Date(pin.timestamp).getTime() - new Date(otherPin.timestamp).getTime()) / (1000 * 60 * 60);

        if (distance <= 500 && timeDiffHours <= 4) {
          cluster.push(otherPin);
          processed.add(otherPin.pinId!);
        }
      }

      if (cluster.length > 1) {
        // Group into a gallery post
        const anchor = { ...cluster[cluster.length - 1] }; // Use newest pin for text/details
        const allMedia = cluster.flatMap(c => {
          if (c.media_urls && c.media_urls.length > 0) return c.media_urls;
          if (c.image_url) return [c.image_url];
          return [];
        });
        anchor.media_urls = allMedia.reverse(); // Newest first
        anchor.media_type = 'gallery' as any;
        anchor.image_url = anchor.media_urls[0] || '';
        clustered.push(anchor);
      } else {
        clustered.push(pin);
      }
    }

    // Sort newest first for the feed
    let finalSorted = clustered.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    if (selectedPin) {
      const selectedIndex = finalSorted.findIndex(p => p.pinId === selectedPin.pinId);
      if (selectedIndex > 0) {
        const [pin] = finalSorted.splice(selectedIndex, 1);
        finalSorted.unshift(pin);
      } else if (selectedIndex === -1) {
        finalSorted.unshift(selectedPin);
      }
    }
    return finalSorted;
  }, [pins, selectedPin, currentUser.blockedUsers, currentUser.reportedPins, localHiddenPins]);

  const onRefresh = () => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 1000);
  };

  const handleLike = useCallback(async (pinId: string) => {
    try {
      await toggleLikePin(pinId, currentUser.userId);
    } catch (e) {
      console.error(e);
    }
  }, [currentUser.userId]);

  const handleOptionsPress = useCallback((item: Pin) => {
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
          Alert.alert(
            "Report Post", 
            "Are you sure you want to report this post? It will be hidden from your feed and sent to our team for review.", 
            [
              { text: "Cancel", style: "cancel" },
              { 
                text: "Report", 
                style: "destructive", 
                onPress: async () => {
                  if (item.pinId) {
                    try {
                      // Optimistically hide from feed
                      setLocalHiddenPins(prev => ({ ...prev, [item.pinId!]: true }));
                      await reportPin(currentUser.userId, item.pinId);
                      Alert.alert("Reported", "This post has been reported and removed from your feed.");
                    } catch (e) {
                      console.error("Report failed:", e);
                      // Revert optimistic hide
                      setLocalHiddenPins(prev => {
                        const next = { ...prev };
                        delete next[item.pinId!];
                        return next;
                      });
                      Alert.alert("Error", "Failed to report post.");
                    }
                  }
                }
              }
            ]
          );
        }},
        { text: "Cancel", style: "cancel" }
      ]);
    }
  }, [currentUser.userId]);

  const handleShare = useCallback(async (pin: Pin) => {
    setSharePin(pin);
  }, []);

  const handleToggleSave = useCallback(async (pinId: string) => {
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
  }, [currentUser.userId, localSavedPins]);

  const renderItem = useCallback(({ item }: { item: Pin }) => (
    <FeedPinItem 
      item={item} 
      isActiveVideo={isVisible && activeVideoId === (item.pinId || item.timestamp.toString())}
      currentUser={currentUser}
      localSavedPins={localSavedPins}
      onOpenUserProfile={onOpenUserProfile}
      handleOptionsPress={handleOptionsPress}
      handleLike={handleLike}
      setCommentPinId={setCommentPinId}
      handleShare={handleShare}
      handleToggleSave={handleToggleSave}
      onGoToMap={onGoToMap}
    />
  ), [activeVideoId, currentUser.userId, localSavedPins, isVisible, onGoToMap]);

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
          <View style={{ flex: 1 }} />
        </View>

      <FlatList
        ref={flatListRef}
        data={sortedPins}
        renderItem={renderItem}
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

      {/* Watermark Share Modal */}
      {sharePin && sharePin.image_url && (
        <Modal
          visible={true}
          transparent={true}
          animationType="slide"
          onRequestClose={() => setSharePin(null)}
        >
          <WatermarkShare 
            photoUri={sharePin.image_url} 
            locationName={sharePin.username || "Pinc Memory"} 
            onClose={() => setSharePin(null)} 
            isVideo={sharePin.media_type === 'video'}
          />
        </Modal>
      )}
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
  },
  paginationContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 12,
  },
  paginationDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    marginHorizontal: 4,
  },
  paginationDotActive: {
    backgroundColor: PincTheme.colors.primary,
    width: 8,
    height: 8,
    borderRadius: 4,
  }
});
