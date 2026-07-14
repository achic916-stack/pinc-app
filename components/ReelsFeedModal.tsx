import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Dimensions,
  Image,
  FlatList,
  Platform,
  Share,
  Alert,
  TouchableWithoutFeedback,
  Animated,
  Easing
} from "react-native";
import { Audio, Video, ResizeMode } from "expo-av";

import { CachedVideo } from "./CachedVideo";
import { Feather, Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { Pin, auth, toggleLikePin, subscribeToComments, fetchUserProfile, UserProfile, checkIsFollowing, toggleFollow, reportPin } from "../services/firebase";
import { PincTheme } from "../styles/theme";
import { CommentsDrawer } from './CommentsDrawer';
import { WatermarkShare } from './WatermarkShare';
import { FullScreenMediaViewer } from './FullScreenMediaViewer';
import { FloatingHeartsOverlay, FloatingHeartsRef } from './FloatingHeartsOverlay';

const { height: windowHeight, width: windowWidth } = Dimensions.get("window");

interface ReelsFeedModalProps {
  visible: boolean;
  pins: Pin[];
  onClose: () => void;
  currentUserId: string;
  initialIndex?: number;
  onOpenUserProfile?: (userId: string) => void;
  locale?: "en" | "th";
}

const FeedItem = ({ 
  item, 
  isVisible,
  shouldMountVideo = true,
  onCommentPress,
  onSharePress,
  currentUserId,
  onOpenUserProfile,
  locale = "en",
  onReport,
  onOpenMedia
}: { 
  item: Pin; 
  isVisible: boolean;
  shouldMountVideo?: boolean;
  onCommentPress: () => void;
  onSharePress: () => void;
  currentUserId: string;
  onOpenUserProfile?: (userId: string) => void;
  locale?: "en" | "th";
  onReport?: (pinId: string) => void;
  onOpenMedia: (url: string, type: 'video' | 'image') => void;
}) => {
  const [liked, setLiked] = useState(item.likes?.includes(currentUserId) || false);
  const [likesCount, setLikesCount] = useState(item.likes?.length || item.likesCount || 0);
  const [commentsCount, setCommentsCount] = useState(item.commentsCount || 0);
  const [lastTap, setLastTap] = useState(0);
  const doubleTapRef = useRef<NodeJS.Timeout | null>(null);
  const floatingHeartsRef = useRef<FloatingHeartsRef>(null);

  const [isFollowing, setIsFollowing] = useState(false);
  const [isTogglingFollow, setIsTogglingFollow] = useState(false);

  useEffect(() => {
    const checkStatus = async () => {
      if (!currentUserId || !item.userId || item.userId === currentUserId) return;
      try {
        const status = await checkIsFollowing(currentUserId, item.userId);
        setIsFollowing(status);
      } catch (err) {
        console.warn("Failed to check follow status in FeedItem:", err);
      }
    };
    checkStatus();
  }, [item.userId, currentUserId]);

  const handleMediaTap = (url: string, type: 'video' | 'image') => {
    const now = Date.now();
    const DOUBLE_PRESS_DELAY = 300;
    if (lastTap && (now - lastTap) < DOUBLE_PRESS_DELAY) {
      if (doubleTapRef.current) clearTimeout(doubleTapRef.current);
      if (!liked) handleLike();
      
      // Always trigger animation on double tap
      floatingHeartsRef.current?.triggerAnimation();
      setLastTap(0);
    } else {
      setLastTap(now);
      doubleTapRef.current = setTimeout(() => {
        onOpenMedia(url, type);
      }, DOUBLE_PRESS_DELAY);
    }
  };

  const handleToggleFollow = async () => {
    if (!currentUserId || !item.userId || item.userId === currentUserId || isTogglingFollow) return;
    setIsTogglingFollow(true);
    const prevStatus = isFollowing;
    setIsFollowing(!prevStatus);
    try {
      const nowFollowing = await toggleFollow(currentUserId, item.userId);
      setIsFollowing(nowFollowing);
    } catch (err) {
      console.warn("Failed to toggle follow in FeedItem:", err);
      setIsFollowing(prevStatus);
    } finally {
      setIsTogglingFollow(false);
    }
  };

  useEffect(() => {
    setLiked(item.likes?.includes(currentUserId) || false);
    setLikesCount(item.likes?.length || item.likesCount || 0);
  }, [item, currentUserId]);

  useEffect(() => {
    if (!item.pinId) return;
    const unsubscribe = subscribeToComments(item.pinId, (commentsList) => {
      setCommentsCount(commentsList.length);
    });
    return () => unsubscribe();
  }, [item.pinId]);

  const handleLike = async () => {
    const nextLiked = !liked;
    const nextCount = likesCount + (nextLiked ? 1 : -1);
    setLiked(nextLiked);
    setLikesCount(nextCount);

    if (item.pinId) {
      try {
        await toggleLikePin(item.pinId, currentUserId);
      } catch (err: any) {
        console.warn("Failed to persist like in ReelsFeedModal:", err);
        Alert.alert("Like Failed", err?.message || String(err));
        setLiked(liked);
        setLikesCount(likesCount);
      }
    }
  };

  let formattedTime = "";
  if (item.timestamp) {
    try {
      const dateObj = (item.timestamp as any).toDate ? (item.timestamp as any).toDate() : new Date(item.timestamp);
      if (!isNaN(dateObj.getTime())) {
        formattedTime = dateObj.toLocaleString(locale === "th" ? "th-TH" : "en-GB", { 
          day: 'numeric', month: 'short', year: 'numeric', 
          hour: '2-digit', minute: '2-digit' 
        });
      }
    } catch(e) {}
  }

  const isVideo = item.media_type === "video";

  return (
    <View style={styles.itemContainer}>
      <LinearGradient 
        colors={["#0A0A0A", "#262626"]} 
        style={StyleSheet.absoluteFillObject}
      />
      
      <TouchableWithoutFeedback onPress={() => {
        const url = (isVideo ? item.image_url : item.image_url);
        if (url) {
           handleMediaTap(url, isVideo ? 'video' : 'image');
        }
      }}>
        <View style={styles.media}>
          {isVideo ? (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
              {!!item.thumbnail_url && (
                <Image
                  source={{ uri: item.thumbnail_url }}
                  style={[styles.media, { position: 'absolute' }]}
                  resizeMode="contain"
                />
              )}
              {shouldMountVideo && !!item.image_url && (
                <CachedVideo
                  source={{ uri: item.image_url }}
                  style={[styles.media, { position: 'absolute' }]}
                  resizeMode="contain"
                  shouldPlay={isVisible}
                  isLooping
                  useNativeControls={false}
                />
              )}
            </View>
          ) : (
            !!item.image_url && (
              <Image
                source={{ uri: item.image_url }}
                style={styles.media}
                resizeMode="contain"
              />
            )
          )}
        </View>
      </TouchableWithoutFeedback>

      <LinearGradient 
        colors={["transparent", "rgba(0,0,0,0.45)", "rgba(0,0,0,0.85)"]} 
        style={styles.gradientOverlay} 
      />

      {item.post_type === "live_news" && (
        <View style={styles.liveNewsHeader}>
          <View style={styles.liveNewsBadge}>
            <Text style={styles.liveNewsText}>STORY</Text>
          </View>
        </View>
      )}

      <View style={styles.bottomOverlay}>
        <View style={styles.userInfoRow}>
          <TouchableOpacity 
            onPress={() => onOpenUserProfile && onOpenUserProfile(item.userId)}
            style={{ flexDirection: 'row', alignItems: 'center' }}
          >
            <Image 
              source={{ uri: item.user_profile_pic || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&q=80' }} 
              style={styles.avatar} 
            />
            <View>
              <Text style={styles.username}>{item.username || 'User'}</Text>
              {formattedTime ? <Text style={styles.timeText}>{formattedTime}</Text> : null}
            </View>
          </TouchableOpacity>
          {item.userId !== currentUserId && (
            <TouchableOpacity 
              style={[styles.followButton, isFollowing && styles.followingButtonActive]}
              onPress={handleToggleFollow}
              disabled={isTogglingFollow}
            >
              <Text style={styles.followText}>
                {isFollowing ? "Following" : "Follow"}
              </Text>
            </TouchableOpacity>
          )}
        </View>
        
        {(() => {
          let captionText = item.text_content || "";
          if (captionText.includes("Current Location")) {
            captionText = captionText.replace(/\n?📍\s*Current Location.*/g, '');
          }
          captionText = captionText.trim();
          return captionText ? (
            <Text style={styles.caption} numberOfLines={2}>
              {captionText}
            </Text>
          ) : null;
        })()}
        
        <View style={styles.musicRow}>
          <Ionicons name="musical-note" size={12} color="#FFF" />
          <Text style={styles.musicText}>{locale === "th" ? "เสียงต้นฉบับ (original audio)" : "pinc. original audio"}</Text>
        </View>
      </View>

      <View style={styles.rightOverlay}>
        <TouchableOpacity hitSlop={{ top: 15, bottom: 15, left: 20, right: 20 }} style={styles.actionButton} onPress={handleLike}>
          <Ionicons name={liked ? "heart" : "heart-outline"} size={36} color={liked ? "#FF2D55" : "#FFF"} />
          <Text style={styles.actionText}>{likesCount}</Text>
        </TouchableOpacity>

        <TouchableOpacity hitSlop={{ top: 15, bottom: 15, left: 20, right: 20 }} style={styles.actionButton} onPress={onCommentPress}>
          <Ionicons name="chatbubble-outline" size={32} color="#FFF" />
          <Text style={styles.actionText}>{commentsCount}</Text>
        </TouchableOpacity>

        <TouchableOpacity hitSlop={{ top: 15, bottom: 15, left: 20, right: 20 }} style={styles.actionButton} onPress={onSharePress}>
          <MaterialCommunityIcons name="share" size={32} color="#FFF" />
          <Text style={styles.actionText}>Share</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          hitSlop={{ top: 15, bottom: 15, left: 20, right: 20 }} 
          style={styles.actionButton}
          onPress={() => {
            Alert.alert("Post Options", "What would you like to do?", [
              { text: "Report Post", style: "destructive", onPress: () => {
                Alert.alert("Report Post", "Are you sure you want to report this post for objectionable content?", [
                  { text: "Cancel", style: "cancel" },
                  {
                    text: "Report",
                    style: "destructive",
                    onPress: async () => {
                      if (item.pinId) {
                        try {
                          await reportPin(currentUserId, item.pinId);
                          Alert.alert("Reported", "This post has been reported and removed.");
                          if (onReport) onReport(item.pinId);
                        } catch (e) {
                          Alert.alert("Error", "Failed to report post.");
                        }
                      }
                    }
                  }
                ]);
              }},
              { text: "Cancel", style: "cancel" }
            ]);
          }}
        >
          <Feather name="more-horizontal" size={28} color="#FFF" />
        </TouchableOpacity>
      </View>
      
      <FloatingHeartsOverlay ref={floatingHeartsRef} />
    </View>
  );
};

export const ReelsFeedModal: React.FC<ReelsFeedModalProps> = ({
  visible,
  pins,
  onClose,
  currentUserId,
  initialIndex = 0,
  onOpenUserProfile,
  locale = "en"
}) => {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [activeCommentPinId, setActiveCommentPinId] = useState<string | null>(null);
  const [sharePin, setSharePin] = useState<Pin | null>(null);
  const [localHiddenPins, setLocalHiddenPins] = useState<Record<string, boolean>>({});
  const flatListRef = useRef<FlatList>(null);
  
  const [viewerVisible, setViewerVisible] = useState(false);
  const [viewerMediaUrl, setViewerMediaUrl] = useState<string | null>(null);
  const [viewerMediaType, setViewerMediaType] = useState<'image' | 'video'>('image');

  const onOpenMedia = useCallback((url: string, type: 'video' | 'image') => {
    setViewerMediaUrl(url);
    setViewerMediaType(type);
    setViewerVisible(true);
  }, []);

  const [currentUserProfile, setCurrentUserProfile] = useState<UserProfile>({
    userId: currentUserId || auth.currentUser?.uid || "cafe_hopper",
    username: auth.currentUser?.displayName || "cafe_hopper",
    profile_pic: auth.currentUser?.photoURL || "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&q=80",
    bio: "Pinc member",
    created_at: new Date()
  });

  useEffect(() => {
    const fetchProfile = async () => {
      const uid = currentUserId || auth.currentUser?.uid;
      if (!uid) return;
      try {
        const profile = await fetchUserProfile(uid);
        if (profile) {
          setCurrentUserProfile(profile);
        }
      } catch (err) {
        console.warn("Failed to fetch user profile in ReelsFeedModal:", err);
      }
    };
    if (visible) {
      fetchProfile();
    }
  }, [visible, currentUserId]);

  const filteredPins = pins.filter(p => {
    if (p.pinId && localHiddenPins[p.pinId]) return false;
    if (currentUserProfile && currentUserProfile.blockedUsers?.includes(p.userId)) return false;
    if (p.pinId && currentUserProfile && currentUserProfile.reportedPins?.includes(p.pinId)) return false;
    return true;
  });

  useEffect(() => {
    if (visible && pins.length > 0) {
      setCurrentIndex(initialIndex);
      setTimeout(() => {
        if (flatListRef.current && filteredPins.length > 0 && initialIndex >= 0 && initialIndex < filteredPins.length) {
          try {
            flatListRef.current.scrollToIndex({ index: initialIndex, animated: false });
          } catch (e) {
            console.warn("Failed to scroll to index", e);
          }
        }
      }, 100);
    }
  }, [visible, initialIndex, pins.length, filteredPins.length]);

  const handleViewableItemsChanged = useRef(({ viewableItems }: any) => {
    if (viewableItems.length > 0) {
      setCurrentIndex(viewableItems[0].index);
    }
  }).current;

  const viewabilityConfig = useRef({
    itemVisiblePercentThreshold: 50
  }).current;


  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={false}
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        {visible && (
          <FlatList
            ref={flatListRef}
            data={filteredPins}
            keyExtractor={(item) => item.pinId || Math.random().toString()}
            horizontal
            pagingEnabled
            snapToInterval={windowWidth}
            snapToAlignment="center"
            decelerationRate="fast"
            showsHorizontalScrollIndicator={false}
            initialNumToRender={1}
            maxToRenderPerBatch={2}
            windowSize={5}
            renderItem={({ item, index }) => (
              <FeedItem 
                item={item} 
                isVisible={index === currentIndex} 
                shouldMountVideo={Math.abs(index - currentIndex) <= 2}
                onCommentPress={() => setActiveCommentPinId(item.pinId || null)}
                onSharePress={() => setSharePin(item)}
                currentUserId={currentUserId}
                onOpenUserProfile={onOpenUserProfile}
                locale={locale}
                onReport={(pinId) => setLocalHiddenPins(prev => ({ ...prev, [pinId]: true }))}
                onOpenMedia={onOpenMedia}
              />
            )}
            onViewableItemsChanged={handleViewableItemsChanged}
            viewabilityConfig={viewabilityConfig}
            initialScrollIndex={initialIndex}
            getItemLayout={(data, index) => ({
              length: windowWidth,
              offset: windowWidth * index,
              index,
            })}
            onScrollToIndexFailed={(info) => {
              setTimeout(() => {
                flatListRef.current?.scrollToIndex({ index: info.index, animated: false });
              }, 100);
            }}
          />
        )}

        <TouchableOpacity style={styles.closeButton} onPress={onClose}>
          <Feather name="chevron-left" size={32} color="#FFF" />
        </TouchableOpacity>

        <CommentsDrawer 
          visible={activeCommentPinId !== null}
          pinId={activeCommentPinId}
          currentUser={currentUserProfile}
          onClose={() => setActiveCommentPinId(null)}
          locale={locale}
          onOpenUserProfile={onOpenUserProfile}
        />

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

        <FullScreenMediaViewer 
          visible={viewerVisible}
          mediaUrl={viewerMediaUrl}
          mediaType={viewerMediaType}
          onClose={() => setViewerVisible(false)}
        />
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0A0A0A",
  },
  itemContainer: {
    width: windowWidth,
    height: windowHeight,
  },
  media: {
    width: "100%",
    height: "100%",
    position: "absolute",
  },
  gradientOverlay: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: "15%", // Reduced from 23% to align perfectly with the bottom song title bar and caption, ensuring no overlap with center video content or user profiles
  },
  closeButton: {
    position: "absolute",
    top: Platform.OS === "ios" ? 50 : 20,
    left: 16,
    zIndex: 100,
    padding: 8,
  },
  liveNewsHeader: {
    position: "absolute",
    top: Platform.OS === "ios" ? 60 : 30,
    alignSelf: "center",
    zIndex: 10,
  },
  liveNewsBadge: {
    backgroundColor: "#FF2D55",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  liveNewsText: {
    color: "#FFF",
    fontWeight: "bold",
    fontSize: 12,
  },
  bottomOverlay: {
    position: "absolute",
    bottom: Platform.OS === "ios" ? 90 : 70,
    left: 16,
    right: 80, // leave space for right action buttons
    zIndex: 10,
  },
  userInfoRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: PincTheme.colors.border,
    marginRight: 10,
  },
  username: {
    color: "#FFF",
    fontWeight: "600",
    fontSize: 15,
    marginRight: 10,
  },
  timeText: {
    color: "rgba(255, 255, 255, 0.7)",
    fontSize: 11,
    marginTop: 2,
  },
  followButton: {
    borderWidth: 1,
    borderColor: PincTheme.colors.border,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 4,
  },
  followText: {
    color: "#FFF",
    fontSize: 12,
    fontWeight: "600",
  },
  caption: {
    color: "#FFF",
    fontSize: 14,
    marginBottom: 10,
    lineHeight: 20,
  },
  musicRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  musicText: {
    color: "#FFF",
    fontSize: 13,
    marginLeft: 6,
  },
  rightOverlay: {
    position: "absolute",
    bottom: Platform.OS === "ios" ? 90 : 70,
    right: 8,
    alignItems: "center",
    zIndex: 10,
  },
  actionButton: {
    alignItems: "center",
    marginBottom: 20,
  },
  actionText: {
    color: "#FFF",
    fontSize: 13,
    fontWeight: "600",
    marginTop: 4,
  },
  followingButtonActive: {
    backgroundColor: "rgba(255, 255, 255, 0.3)",
    borderColor: "transparent",
  },
});
