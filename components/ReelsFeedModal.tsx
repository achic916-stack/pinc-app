import React, { useState, useRef, useEffect } from "react";
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
  Share
} from "react-native";
import { Audio, Video, ResizeMode } from "expo-av";

import { CachedVideo } from "./CachedVideo";
import { Feather, Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { Pin, auth, toggleLikePin, subscribeToComments, fetchUserProfile, UserProfile, checkIsFollowing, toggleFollow } from "../services/firebase";
import { PincTheme } from "../styles/theme";
import { CommentsDrawer } from "./CommentsDrawer";
import { WatermarkShare } from "./WatermarkShare";

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
  locale = "en"
}: { 
  item: Pin; 
  isVisible: boolean;
  shouldMountVideo?: boolean;
  onCommentPress: () => void;
  onSharePress: () => void;
  currentUserId: string;
  onOpenUserProfile?: (userId: string) => void;
  locale?: "en" | "th";
}) => {
  const [liked, setLiked] = useState(item.likes?.includes(currentUserId) || false);
  const [likesCount, setLikesCount] = useState(item.likes?.length || item.likesCount || 0);
  const [commentsCount, setCommentsCount] = useState(item.commentsCount || 0);

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

  // Sync likes and check if currentUserId liked on item change
  useEffect(() => {
    setLiked(item.likes?.includes(currentUserId) || false);
    setLikesCount(item.likes?.length || item.likesCount || 0);
  }, [item, currentUserId]);

  // Subscribe to real-time comments count
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
      } catch (err) {
        console.warn("Failed to persist like in ReelsFeedModal:", err);
        setLiked(liked);
        setLikesCount(likesCount);
      }
    }
  };

  return (
    <View style={styles.itemContainer}>
      {/* Media Background */}
      {item.media_type === "video" ? (
        <View style={[styles.media, { backgroundColor: '#000', justifyContent: 'center', alignItems: 'center' }]}>
          {item.thumbnail_url && (
            <Image
              source={{ uri: item.thumbnail_url }}
              style={[styles.media, { position: 'absolute' }]}
              resizeMode="contain"
            />
          )}
          {shouldMountVideo && (
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
        <Image
          source={{ uri: item.image_url }}
          style={styles.media}
          resizeMode="contain"
        />
      )}

      {/* Dark Gradient Overlay for text readability (using premium LinearGradient) */}
      <LinearGradient 
        colors={["transparent", "rgba(0,0,0,0.45)", "rgba(0,0,0,0.85)"]} 
        style={styles.gradientOverlay} 
      />

      {/* Top Header: LIVE NEWS Badge (if applicable) */}
      {item.post_type === "live_news" && (
        <View style={styles.liveNewsHeader}>
          <View style={styles.liveNewsBadge}>
            <Text style={styles.liveNewsText}>STORY</Text>
          </View>
        </View>
      )}

      {/* Bottom Left: User Info & Caption */}
      <View style={styles.bottomOverlay}>
        <View style={styles.userInfoRow}>
          <TouchableOpacity 
            onPress={() => onOpenUserProfile && onOpenUserProfile(item.userId)}
            style={{ flexDirection: 'row', alignItems: 'center' }}
          >
            <Image source={{ uri: item.user_profile_pic }} style={styles.avatar} />
            <Text style={styles.username}>{item.username}</Text>
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
        
        {item.text_content ? (
          <Text style={styles.caption} numberOfLines={2}>
            {item.text_content}
          </Text>
        ) : null}
        
        <View style={styles.musicRow}>
          <Ionicons name="musical-note" size={12} color="#FFF" />
          <Text style={styles.musicText}>{locale === "th" ? "เสียงต้นฉบับ (original audio)" : "pinc. original audio"}</Text>
        </View>
      </View>

      {/* Bottom Right: Action Buttons */}
      <View style={styles.rightOverlay}>
        <TouchableOpacity style={styles.actionButton} onPress={handleLike}>
          <Ionicons name={liked ? "heart" : "heart-outline"} size={36} color={liked ? "#FF2D55" : "#FFF"} />
          <Text style={styles.actionText}>{likesCount}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.actionButton} onPress={onCommentPress}>
          <Ionicons name="chatbubble-outline" size={32} color="#FFF" />
          <Text style={styles.actionText}>{commentsCount}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.actionButton} onPress={onSharePress}>
          <Ionicons name="paper-plane-outline" size={32} color="#FFF" />
          <Text style={styles.actionText}>Share</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.actionButton}>
          <Feather name="more-horizontal" size={28} color="#FFF" />
        </TouchableOpacity>
      </View>
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
  const flatListRef = useRef<FlatList>(null);

  useEffect(() => {
    if (visible && pins.length > 0) {
      setCurrentIndex(initialIndex);
      // Small delay to ensure layout is ready before scrolling
      setTimeout(() => {
        if (flatListRef.current) {
          flatListRef.current.scrollToIndex({ index: initialIndex, animated: false });
        }
      }, 100);
    }
  }, [visible, initialIndex, pins.length]);

  const handleViewableItemsChanged = useRef(({ viewableItems }: any) => {
    if (viewableItems.length > 0) {
      setCurrentIndex(viewableItems[0].index);
    }
  }).current;

  const viewabilityConfig = useRef({
    itemVisiblePercentThreshold: 50
  }).current;

  // Build resilient currentUser object for CommentsDrawer
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
            data={pins}
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

        {/* Global Close Button */}
        <TouchableOpacity style={styles.closeButton} onPress={onClose}>
          <Feather name="chevron-left" size={32} color="#FFF" />
        </TouchableOpacity>

        {/* Comments Drawer Popup */}
        <CommentsDrawer 
          visible={activeCommentPinId !== null}
          pinId={activeCommentPinId}
          currentUser={currentUserProfile}
          onClose={() => setActiveCommentPinId(null)}
          locale={locale}
          onOpenUserProfile={onOpenUserProfile}
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
            />
          </Modal>
        )}
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
  },
  itemContainer: {
    width: windowWidth,
    height: windowHeight,
    backgroundColor: "#000",
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
    borderColor: "#FFF",
    marginRight: 10,
  },
  username: {
    color: "#FFF",
    fontWeight: "600",
    fontSize: 15,
    marginRight: 10,
  },
  followButton: {
    borderWidth: 1,
    borderColor: "#FFF",
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
