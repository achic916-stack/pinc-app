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
import { Pin, auth } from "../services/firebase";
import { PincTheme } from "../styles/theme";
import { CommentsDrawer } from "./CommentsDrawer";

const { height: windowHeight, width: windowWidth } = Dimensions.get("window");

interface ReelsFeedModalProps {
  visible: boolean;
  pins: Pin[];
  onClose: () => void;
  currentUserId: string;
  initialIndex?: number;
}

const FeedItem = ({ 
  item, 
  isVisible,
  onCommentPress
}: { 
  item: Pin; 
  isVisible: boolean;
  onCommentPress: () => void;
}) => {
  const [liked, setLiked] = useState(item.likes?.includes("currentUserId") || false);
  const [likesCount, setLikesCount] = useState(item.likesCount || 0);
  const [backgroundSound, setBackgroundSound] = useState<Audio.Sound | null>(null);

  useEffect(() => {
    let soundObj: Audio.Sound | null = null;
    let isActive = true;

    const startAudio = async () => {
      if (item.music_url && isVisible) {
        try {
          await Audio.setAudioModeAsync({
            playsInSilentModeIOS: true,
            staysActiveInBackground: false,
            playThroughEarpieceAndroid: false,
          });

          const { sound } = await Audio.Sound.createAsync(
            { uri: item.music_url },
            { shouldPlay: true, isLooping: true, volume: 1.0 }
          );
          soundObj = sound;
          if (isActive) {
            setBackgroundSound(sound);
          } else {
            await sound.unloadAsync();
          }
        } catch (error) {
          console.warn("Error playing background music in FeedItem:", error);
        }
      }
    };

    if (isVisible) {
      startAudio();
    }

    return () => {
      isActive = false;
      const cleanupAudio = async () => {
        if (soundObj) {
          try {
            await soundObj.stopAsync();
            await soundObj.unloadAsync();
          } catch (e) {
            console.warn("Unloading audio error in FeedItem cleanup:", e);
          }
        }
      };
      cleanupAudio();
      setBackgroundSound(null);
    };
  }, [isVisible, item.music_url]);

  const handleLike = () => {
    setLiked(!liked);
    setLikesCount(liked ? likesCount - 1 : likesCount + 1);
  };

  const handleShare = async () => {
    try {
      const shareMessage = item.text_content
        ? `"${item.text_content}" - Check out this live reality check from @${item.username} on Pinc!`
        : `Check out this live reality check from @${item.username} on Pinc!`;
        
      await Share.share({
        message: shareMessage,
        url: item.image_url
      });
    } catch (error) {
      console.warn("Failed to share:", error);
    }
  };

  return (
    <View style={styles.itemContainer}>
      {/* Media Background */}
      {item.media_type === "video" ? (
        <View style={[styles.media, { backgroundColor: '#000', justifyContent: 'center', alignItems: 'center' }]}>
          {isVisible ? (
            <Video
              source={{ uri: item.image_url }}
              style={[styles.media, { position: 'absolute' }]}
              resizeMode={ResizeMode.CONTAIN}
              shouldPlay={isVisible}
              isLooping
              useNativeControls={false}
            />
          ) : (
            <>
              {item.thumbnail_url ? (
                <Image
                  source={{ uri: item.thumbnail_url }}
                  style={[styles.media, { position: 'absolute' }]}
                  resizeMode="contain"
                />
              ) : null}
              <View style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', zIndex: 2 }}>
                <Ionicons name="play" size={40} color="#FFF" style={{ marginLeft: 6 }} />
              </View>
            </>
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
            <Text style={styles.liveNewsText}>LIVE NEWS</Text>
          </View>
        </View>
      )}

      {/* Bottom Left: User Info & Caption */}
      <View style={styles.bottomOverlay}>
        <View style={styles.userInfoRow}>
          <Image source={{ uri: item.user_profile_pic }} style={styles.avatar} />
          <Text style={styles.username}>{item.username}</Text>
          <TouchableOpacity style={styles.followButton}>
            <Text style={styles.followText}>Follow</Text>
          </TouchableOpacity>
        </View>
        
        {item.text_content ? (
          <Text style={styles.caption} numberOfLines={2}>
            {item.text_content}
          </Text>
        ) : null}
        
        <View style={styles.musicRow}>
          <Ionicons name="musical-note" size={12} color="#FFF" />
          <Text style={styles.musicText}>{item.music_title || "pinc. original audio"}</Text>
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
          <Text style={styles.actionText}>{item.commentsCount || 0}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.actionButton} onPress={handleShare}>
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
  initialIndex = 0
}) => {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [activeCommentPinId, setActiveCommentPinId] = useState<string | null>(null);
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
  const currentUserProfile = {
    userId: currentUserId || auth.currentUser?.uid || "cafe_hopper",
    username: auth.currentUser?.displayName || "cafe_hopper",
    profile_pic: auth.currentUser?.photoURL || "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&q=80",
    bio: "Pinc member",
    created_at: new Date()
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={false}
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        <FlatList
          ref={flatListRef}
          data={pins}
          keyExtractor={(item) => item.pinId || Math.random().toString()}
          renderItem={({ item, index }) => (
            <FeedItem 
              item={item} 
              isVisible={index === currentIndex} 
              onCommentPress={() => setActiveCommentPinId(item.pinId || null)}
            />
          )}
          pagingEnabled
          showsVerticalScrollIndicator={false}
          onViewableItemsChanged={handleViewableItemsChanged}
          viewabilityConfig={viewabilityConfig}
          snapToAlignment="start"
          decelerationRate="fast"
          initialScrollIndex={initialIndex}
          getItemLayout={(data, index) => ({
            length: windowHeight,
            offset: windowHeight * index,
            index,
          })}
        />

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
          locale="en"
        />
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
});
