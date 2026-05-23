// @ts-nocheck
import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Dimensions,
  ActivityIndicator,
  Alert
} from "react-native";
import { Image } from "expo-image";
import { PincTheme } from "../styles/theme";
import { Venue, Pin, UserProfile, toggleLikePin, subscribeToComments, deletePin } from "../services/firebase";
import { t } from "../services/localization";
import { Ionicons } from "@expo/vector-icons";
import { CommentsDrawer } from "./CommentsDrawer";
import { CachedVideo } from "./CachedVideo";
const Audio = { Sound: { createAsync: async () => ({ sound: { playAsync: async () => {}, stopAsync: async () => {}, unloadAsync: async () => {} } }) }, setAudioModeAsync: async () => {} }; const Video = () => null; const ResizeMode = { COVER: 'cover', CONTAIN: 'contain' };


const getSafeVideoUrl = (url: string | null | undefined) => {
  if (!url) return undefined;
  if (url.toLowerCase().includes('.mp4') || url.toLowerCase().includes('.mov')) return url;
  return `${url}#.mp4`;
};

const isVideoUrl = (url: string | null | undefined): boolean => {
  if (!url) return false;
  const urlLower = url.toLowerCase();
  if (urlLower.includes('.mp4') || urlLower.includes('.mov') || urlLower.includes('.webm')) return true;
  return false;
};

const isActuallyVideo = (pin: Pin) => {
  if (!pin.image_url) return false;
  const urlLower = pin.image_url.toLowerCase();
  if (urlLower.includes('.jpg') || urlLower.includes('.jpeg') || urlLower.includes('.png')) return false;
  return pin.media_type === "video" || isVideoUrl(pin.image_url);
};

interface VenueDetailsSheetProps {
  venue: Venue | null;
  pins: Pin[];
  isLoadingPins: boolean;
  onClose: () => void;
  locale?: "en" | "th";
  followingIds?: string[];
  onOpenUserProfile?: (userId: string) => void;
  currentUser: UserProfile;
}

const { height: SCREEN_HEIGHT } = Dimensions.get("window");

export const VenueDetailsSheet: React.FC<VenueDetailsSheetProps> = ({
  venue,
  pins,
  isLoadingPins,
  onClose,
  locale = "en",
  followingIds = [],
  onOpenUserProfile,
  currentUser
}) => {
  const [activeTab, setActiveTab] = useState<"aesthetic" | "reality">("aesthetic");
  const [localLikes, setLocalLikes] = useState<{ [pinId: string]: { liked: boolean; count: number } }>({});
  const [activeCommentsPinId, setActiveCommentsPinId] = useState<string | null>(null);
  const [commentsCounts, setCommentsCounts] = useState<{ [pinId: string]: number }>({});
  const [activeVideoId, setActiveVideoId] = useState<string | null>(null);

  // Subscribe to comments count for each pin reactively
  useEffect(() => {
    const cleanups: (() => void)[] = [];
    pins.forEach((pin) => {
      if (pin.pinId) {
        const cleanup = subscribeToComments(pin.pinId, (commentsList) => {
          setCommentsCounts(prev => ({
            ...prev,
            [pin.pinId!]: commentsList.length
          }));
        });
        cleanups.push(cleanup);
      }
    });
    return () => {
      cleanups.forEach(c => c());
    };
  }, [pins]);

  const getPinLikeState = (pin: Pin) => {
    const pinId = pin.pinId || "";
    if (localLikes[pinId] !== undefined) {
      return localLikes[pinId];
    }
    const likesArray = pin.likes || [];
    const liked = likesArray.includes(currentUser.userId);
    const count = likesArray.length;
    return { liked, count };
  };

  const handleLikeToggle = async (pin: Pin) => {
    const pinId = pin.pinId;
    if (!pinId) return;

    const currentState = getPinLikeState(pin);
    const nextLiked = !currentState.liked;
    const nextCount = currentState.count + (nextLiked ? 1 : -1);

    // Optimistic update
    setLocalLikes(prev => ({
      ...prev,
      [pinId]: { liked: nextLiked, count: nextCount }
    }));

    try {
      await toggleLikePin(pinId, currentUser.userId);
    } catch (err) {
      console.warn("Failed to toggle like on Firestore:", err);
      // Revert on error
      setLocalLikes(prev => ({
        ...prev,
        [pinId]: currentState
      }));
    }
  };

  const handleDeletePin = (pinId: string | undefined) => {
    if (!pinId) return;
    Alert.alert(
      t(locale, "deletePost") || "ลบโพสต์",
      t(locale, "confirmDeletePost") || "คุณแน่ใจหรือไม่ที่จะลบโพสต์นี้?",
      [
        { text: t(locale, "cancel") || "ยกเลิก", style: "cancel" },
        { 
          text: t(locale, "delete") || "ลบ", 
          style: "destructive",
          onPress: async () => {
            try {
              await deletePin(pinId);
              Alert.alert(t(locale, "success") || "สำเร็จ", "ลบโพสต์เรียบร้อยแล้ว");
            } catch (error) {
              console.error("Delete pin failed:", error);
              Alert.alert(t(locale, "error") || "ข้อผิดพลาด", "ไม่สามารถลบโพสต์ได้");
            }
          }
        }
      ]
    );
  };

  if (!venue) return null;

  const currentStatus = venue.crowd_status?.toLowerCase();

  // Helper to check if a post is from today (UTC timezone independent)
  const isToday = (dateInput: any) => {
    const date = dateInput instanceof Date ? dateInput : new Date(dateInput);
    const today = new Date();
    return (
      date.getUTCDate() === today.getUTCDate() &&
      date.getUTCMonth() === today.getUTCMonth() &&
      date.getUTCFullYear() === today.getUTCFullYear()
    );
  };

  // Helper to check if a post is from yesterday (UTC timezone independent)
  const isYesterday = (dateInput: any) => {
    const date = dateInput instanceof Date ? dateInput : new Date(dateInput);
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    return (
      date.getUTCDate() === yesterday.getUTCDate() &&
      date.getUTCMonth() === yesterday.getUTCMonth() &&
      date.getUTCFullYear() === yesterday.getUTCFullYear()
    );
  };

  // Filter pins based on report type
  const aestheticPins = pins.filter(pin => pin.report_type === "aesthetic");
  const realityPins = pins.filter(pin => pin.report_type === "live_status");

  // Default fallback aesthetic images if no user aesthetic pins are available
  const fallbackAestheticImages = [
    venue.cover_image,
    "https://images.unsplash.com/photo-1554118811-1e0d58224f24?auto=format&fit=crop&w=600&q=80",
    "https://images.unsplash.com/photo-1498804103079-a6351b050096?auto=format&fit=crop&w=600&q=80",
    "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=600&q=80",
    "https://images.unsplash.com/photo-1559925393-8be0ec4767c8?auto=format&fit=crop&w=600&q=80",
    "https://images.unsplash.com/photo-1521017432531-fbd92d768814?auto=format&fit=crop&w=600&q=80"
  ];

  // Dynamic calculations for real-time status summary widget
  const getWidgetSummary = () => {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
    
    // Filter reports from verified users within the last 2 hours
    const verifiedRecent = realityPins.filter(pin => {
      const pinTime = pin.timestamp instanceof Date ? pin.timestamp : new Date(pin.timestamp);
      return pin.is_live_verified && pinTime.getTime() >= twoHoursAgo.getTime();
    });

    const targetList = verifiedRecent.length > 0 ? verifiedRecent : realityPins.filter(pin => pin.is_live_verified);

    if (targetList.length === 0) {
      return {
        text: t(locale, "noVerifiedReports"),
        subtext: t(locale, "firstCheckInPrompt"),
        hasData: false
      };
    }

    // Count votes
    let chillCount = 0;
    let moderateCount = 0;
    let packedCount = 0;

    targetList.forEach(pin => {
      if (pin.live_crowd_vote === "chill") chillCount++;
      else if (pin.live_crowd_vote === "moderate") moderateCount++;
      else if (pin.live_crowd_vote === "packed") packedCount++;
    });

    const total = targetList.length;
    let majorityVote = "chill";
    let majorityCount = chillCount;
    let label = t(locale, "chillBadge");
    let badgeColor = PincTheme.colors.crowdGreen;

    if (moderateCount > majorityCount) {
      majorityVote = "moderate";
      majorityCount = moderateCount;
      label = t(locale, "moderateBadge");
      badgeColor = PincTheme.colors.crowdYellow;
    }
    if (packedCount > majorityCount) {
      majorityVote = "packed";
      majorityCount = packedCount;
      label = t(locale, "packedBadge");
      badgeColor = PincTheme.colors.crowdRed;
    }

    const percentage = Math.round((majorityCount / total) * 100);
    const timeFrameKey = verifiedRecent.length > 0 ? "peopleLiveLast2h" : "peopleOnSiteOverall";

    return {
      text: `${percentage}% ${t(locale, timeFrameKey)}`,
      highlightText: label,
      badgeColor,
      hasData: true
    };
  };

  const widget = getWidgetSummary();

  return (
    <View style={styles.sheetContainer}>
      {/* Drag Indicator / Header */}
      <View style={styles.header}>
        <View style={styles.dragIndicator} />
        <TouchableOpacity style={styles.closeButton} onPress={onClose}>
          <Text style={styles.closeText}>✕</Text>
        </TouchableOpacity>
      </View>

      {/* Venue Header Info */}
      <View style={styles.venueInfo}>
        <View style={styles.titleRow}>
          <Text style={styles.venueName}>{venue.name}</Text>
          <View style={styles.ratingBadge}>
            <Text style={styles.ratingText}>★ {venue.aesthetic_rating.toFixed(1)}</Text>
          </View>
        </View>

        <View style={styles.metaRow}>
          <Text style={styles.categoryText}>{venue.category.toUpperCase()}</Text>
          <View style={styles.bulletSeparator} />
          
          {/* Dynamic Crowd Status Badge */}
          <View
            style={[
              styles.crowdBadge,
              (currentStatus === "green" || currentStatus === "chill") && styles.badgeGreen,
              (currentStatus === "yellow" || currentStatus === "moderate") && styles.badgeYellow,
              (currentStatus === "red" || currentStatus === "packed") && styles.badgeRed
            ]}
          >
            <View
              style={[
                styles.crowdIndicatorDot,
                (currentStatus === "green" || currentStatus === "chill") && { backgroundColor: PincTheme.colors.crowdGreen },
                (currentStatus === "yellow" || currentStatus === "moderate") && { backgroundColor: PincTheme.colors.crowdYellow },
                (currentStatus === "red" || currentStatus === "packed") && { backgroundColor: PincTheme.colors.crowdRed }
              ]}
            />
            <Text
              style={[
                styles.crowdText,
                (currentStatus === "green" || currentStatus === "chill") && { color: PincTheme.colors.crowdGreen },
                (currentStatus === "yellow" || currentStatus === "moderate") && { color: PincTheme.colors.crowdYellow },
                (currentStatus === "red" || currentStatus === "packed") && { color: PincTheme.colors.crowdRed }
              ]}
            >
              {currentStatus === "green" || currentStatus === "chill" ? t(locale, "emptyChill") : ""}
              {currentStatus === "yellow" || currentStatus === "moderate" ? t(locale, "moderateQueue") : ""}
              {currentStatus === "red" || currentStatus === "packed" ? t(locale, "crowdedLongLine") : ""}
            </Text>
          </View>
        </View>
      </View>
 
      {/* Premium Sliding Navigation Tabs */}
      <View style={styles.tabsContainer}>
        <TouchableOpacity
          style={[styles.tabButton, activeTab === "aesthetic" && styles.activeTabButton]}
          onPress={() => setActiveTab("aesthetic")}
        >
          <Text style={[styles.tabLabel, activeTab === "aesthetic" && styles.activeTabLabel]}>
            {t(locale, "aestheticTab")}
          </Text>
          <Text style={styles.tabSubLabel}>{t(locale, "aestheticSub")}</Text>
          {activeTab === "aesthetic" && <View style={styles.tabIndicator} />}
        </TouchableOpacity>
 
        <TouchableOpacity
          style={[styles.tabButton, activeTab === "reality" && styles.activeTabButton]}
          onPress={() => setActiveTab("reality")}
        >
          <Text style={[styles.tabLabel, activeTab === "reality" && styles.activeTabLabel]}>
            {t(locale, "realityTab")}
          </Text>
          <Text style={styles.tabSubLabel}>{t(locale, "realitySub")}</Text>
          {activeTab === "reality" && <View style={styles.tabIndicator} />}
        </TouchableOpacity>
      </View>
 
      {/* Tab View Contents */}
      <View style={styles.contentContainer}>
        {activeTab === "aesthetic" ? (
          /* Tab 1: Aesthetic (Polished IG Grid) */
          <ScrollView contentContainerStyle={styles.gridContainer} showsVerticalScrollIndicator={false}>
            {aestheticPins.length > 0 ? (
              aestheticPins.map((pin) => (
                <View key={pin.pinId} style={styles.gridImageWrapper}>
                  {pin.image_url ? (
                    isActuallyVideo(pin) ? (
                      activeVideoId === pin.pinId ? (
                        <CachedVideo 
                          source={{ uri: pin.image_url }} 
                          style={styles.gridImage} 
                          resizeMode={ResizeMode.COVER} 
                          shouldPlay 
                          useNativeControls
                        />
                      ) : (
                        <TouchableOpacity 
                          style={{ width: '100%', height: '100%' }} 
                          onPress={() => setActiveVideoId(pin.pinId || null)}
                          activeOpacity={0.8}
                        >
                          <Image source={{ uri: getSafeVideoUrl(pin.image_url) }} style={styles.gridImage} contentFit="cover" />
                          <View style={[StyleSheet.absoluteFill, { justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.3)' }]}>
                            <Text style={{ fontSize: 32 }}>▶️</Text>
                          </View>
                        </TouchableOpacity>
                      )
                    ) : (
                      <Image source={{ uri: pin.image_url }} style={styles.gridImage} contentFit="cover" />
                    )
                  ) : (
                    <View style={[styles.gridImage, { backgroundColor: PincTheme.colors.border, justifyContent: "center", alignItems: "center" }]}>
                      <Text style={{ fontSize: 24 }}>☕</Text>
                    </View>
                  )}
                  <View style={styles.gridOverlay}>
                    <Text style={styles.gridRatingText}>★ {pin.user_aesthetic_rating || 5}</Text>
                  </View>
                </View>
              ))
            ) : (
              // Fallback default curated images
              fallbackAestheticImages.map((uri, index) => (
                <View key={index} style={styles.gridImageWrapper}>
                  <Image source={{ uri }} style={styles.gridImage} resizeMode="cover" />
                </View>
              ))
            )}
          </ScrollView>
        ) : (
          /* Tab 2: The Reality (Real-time X Chronological Feed) */
          <View style={{ flex: 1 }}>
            {/* Real-time Status Summary Widget */}
            <View style={styles.summaryWidget}>
              {widget.hasData ? (
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryText}>{widget.text}</Text>
                  <View style={[styles.summaryBadge, { backgroundColor: widget.badgeColor + "22", borderColor: widget.badgeColor }]}>
                    <Text style={[styles.summaryBadgeText, { color: widget.badgeColor }]}>{widget.highlightText}</Text>
                  </View>
                </View>
              ) : (
                <View>
                  <Text style={styles.summaryTextBold}>{widget.text}</Text>
                  <Text style={styles.summarySubtext}>{widget.subtext}</Text>
                </View>
              )}
            </View>
 
            {isLoadingPins ? (
              <View style={styles.loaderContainer}>
                <ActivityIndicator size="small" color={PincTheme.colors.primary} />
                <Text style={styles.loaderText}>{locale === "th" ? "กำลังโหลดข้อมูลสด..." : "Fetching live reports..."}</Text>
              </View>
            ) : realityPins.length === 0 ? (
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyTitle}>{t(locale, "noLiveChecksToday")}</Text>
                <Text style={styles.emptySubtitle}>
                  {t(locale, "postFirstCheckIn")}
                </Text>
              </View>
            ) : (
              <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }}>
                {realityPins.map((pin) => {
                  const pinDate = pin.timestamp instanceof Date ? pin.timestamp : new Date(pin.timestamp);
                  const isPostToday = isToday(pinDate);
                  const isPostYesterday = isYesterday(pinDate);
                  const isFriend = followingIds.includes(pin.userId);
                  
                  // Interaction activity cue checks
                  const isOwnPost = pin.userId === currentUser.userId;
                  const likeState = getPinLikeState(pin);
                  const commentCount = commentsCounts[pin.pinId || ""] || 0;
                  const hasInteractions = likeState.count > 0 || commentCount > 0;
                  const showActivityCue = isOwnPost && hasInteractions;

                  return (
                    <View 
                      key={pin.pinId} 
                      style={[
                        styles.feedCard, 
                        isFriend && styles.feedCardFriend,
                        showActivityCue && styles.feedCardOwnActive
                      ]}
                    >
                      <View style={styles.feedHeader}>
                        <TouchableOpacity
                          style={{ flexDirection: "row", alignItems: "center", flex: 1 }}
                          onPress={() => onOpenUserProfile && onOpenUserProfile(pin.userId)}
                          activeOpacity={0.7}
                        >
                          <Image source={{ uri: pin.user_profile_pic }} style={styles.avatar} />
                          <View style={styles.userMeta}>
                            <Text style={styles.username}>@{pin.username}</Text>
                            <Text style={styles.timestamp}>
                              {isPostToday 
                                ? t(locale, "today") 
                                : isPostYesterday 
                                  ? t(locale, "yesterday") 
                                  : pinDate.toLocaleDateString()
                              } {" "}
                              {t(locale, "at")} {" "}
                              {pinDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                            </Text>
                          </View>
                        </TouchableOpacity>
                        
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                          {showActivityCue && (
                            <View style={styles.activityBadge}>
                              <Text style={styles.activityBadgeText}>✨ {t(locale, "ownPostActivity")}</Text>
                            </View>
                          )}

                          {isFriend && !showActivityCue && (
                            <View style={styles.friendBadge}>
                              <Text style={styles.friendBadgeText}>{t(locale, "friendPost")}</Text>
                            </View>
                          )}
                          
                          {/* Live Location verification Badge */}
                          {pin.is_live_verified && (
                            <View style={styles.liveBadge}>
                              <Text style={styles.liveBadgeText}>{t(locale, "verifiedLive")}</Text>
                            </View>
                          )}
                        </View>
                      </View>
                      
                      <Text style={styles.feedText}>{pin.text_content}</Text>
                      
                      {pin.image_url && (
                        isActuallyVideo(pin) ? (
                          activeVideoId === pin.pinId ? (
                            <CachedVideo 
                              source={{ uri: pin.image_url }} 
                              style={styles.feedImage} 
                              resizeMode={ResizeMode.COVER} 
                              shouldPlay 
                              useNativeControls
                            />
                          ) : (
                            <TouchableOpacity 
                              style={{ width: '100%', height: 250, borderRadius: 12, overflow: 'hidden', marginTop: 12 }} 
                              onPress={() => setActiveVideoId(pin.pinId || null)}
                              activeOpacity={0.8}
                            >
                              <Image source={{ uri: getSafeVideoUrl(pin.image_url) }} style={styles.feedImage} contentFit="cover" />
                              <View style={[StyleSheet.absoluteFill, { justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.3)' }]}>
                                <Text style={{ fontSize: 48 }}>▶️</Text>
                              </View>
                            </TouchableOpacity>
                          )
                        ) : (
                          <Image source={{ uri: pin.image_url }} style={styles.feedImage} contentFit="cover" />
                        )
                      )}

                      {/* Social Action Row */}
                      <View style={styles.socialActionRow}>
                        {/* Like Button */}
                        <TouchableOpacity 
                          style={styles.actionButton} 
                          onPress={() => handleLikeToggle(pin)}
                          activeOpacity={0.7}
                        >
                          <Text style={[styles.actionIcon, likeState.liked && styles.actionIconLiked]}>
                            {likeState.liked ? "❤️" : "🤍"}
                          </Text>
                          <Text style={[styles.actionCount, likeState.liked && styles.actionCountLiked]}>
                            {likeState.count}
                          </Text>
                        </TouchableOpacity>

                        {/* Comment Button */}
                        <TouchableOpacity 
                          style={styles.actionButton} 
                          onPress={() => setActiveCommentsPinId(pin.pinId || null)}
                          activeOpacity={0.7}
                        >
                          <Text style={styles.actionIcon}>💬</Text>
                          <Text style={styles.actionCount}>
                            {commentCount}
                          </Text>
                        </TouchableOpacity>
                        
                        {/* Delete Button (Only for own posts) */}
                        {pin.userId === currentUser.userId && (
                          <TouchableOpacity 
                            style={[styles.actionButton, { marginLeft: "auto" }]} 
                            onPress={() => handleDeletePin(pin.pinId)}
                            activeOpacity={0.7}
                          >
                            <Text style={styles.actionIcon}>🗑️</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    </View>
                  );
                })}
              </ScrollView>
            )}
          </View>
        )}
      </View>

      {/* Comments Drawer Modal */}
      <CommentsDrawer
        visible={activeCommentsPinId !== null}
        pinId={activeCommentsPinId}
        currentUser={currentUser}
        onClose={() => setActiveCommentsPinId(null)}
        locale={locale}
        onOpenUserProfile={onOpenUserProfile}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  sheetContainer: {
    height: SCREEN_HEIGHT * 0.78,
    backgroundColor: PincTheme.colors.background,
    borderTopLeftRadius: PincTheme.borderRadius.lg,
    borderTopRightRadius: PincTheme.borderRadius.lg,
    ...PincTheme.shadows.lg,
    display: "flex",
    flexDirection: "column",
    elevation: 100
  },
  header: {
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: PincTheme.colors.border,
    position: "relative"
  },
  dragIndicator: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: PincTheme.colors.divider
  },
  closeButton: {
    position: "absolute",
    right: 16,
    top: 6,
    padding: 8
  },
  closeText: {
    fontSize: 16,
    color: PincTheme.colors.textSecondary,
    fontWeight: "600"
  },
  venueInfo: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
    backgroundColor: PincTheme.colors.card
  },
  titleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center"
  },
  venueName: {
    fontSize: 22,
    fontFamily: PincTheme.fonts.heading,
    color: PincTheme.colors.textPrimary,
    fontWeight: "bold",
    flex: 1,
    paddingRight: 12
  },
  ratingBadge: {
    backgroundColor: PincTheme.colors.primaryLight,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: PincTheme.borderRadius.sm
  },
  ratingText: {
    color: PincTheme.colors.primary,
    fontFamily: PincTheme.fonts.body,
    fontWeight: "bold",
    fontSize: 14
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 8
  },
  categoryText: {
    fontSize: 11,
    fontFamily: PincTheme.fonts.body,
    letterSpacing: 0.8,
    fontWeight: "bold",
    color: PincTheme.colors.textSecondary
  },
  bulletSeparator: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: PincTheme.colors.textTertiary,
    marginHorizontal: 8
  },
  crowdBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: PincTheme.borderRadius.round
  },
  badgeGreen: {
    backgroundColor: PincTheme.colors.crowdGreenLight
  },
  badgeYellow: {
    backgroundColor: PincTheme.colors.crowdYellowLight
  },
  badgeRed: {
    backgroundColor: PincTheme.colors.crowdRedLight
  },
  crowdIndicatorDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 6
  },
  crowdText: {
    fontSize: 11,
    fontFamily: PincTheme.fonts.body,
    fontWeight: "bold"
  },
  tabsContainer: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: PincTheme.colors.border,
    backgroundColor: PincTheme.colors.card
  },
  tabButton: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 12,
    position: "relative"
  },
  activeTabButton: {
    backgroundColor: "#FAF9F5"
  },
  tabLabel: {
    fontSize: 14,
    fontFamily: PincTheme.fonts.heading,
    fontWeight: "600",
    color: PincTheme.colors.textSecondary
  },
  activeTabLabel: {
    color: PincTheme.colors.primary
  },
  tabSubLabel: {
    fontSize: 10,
    fontFamily: PincTheme.fonts.body,
    color: PincTheme.colors.textTertiary,
    marginTop: 2
  },
  tabIndicator: {
    position: "absolute",
    bottom: 0,
    width: "40%",
    height: 3,
    backgroundColor: PincTheme.colors.primary,
    borderTopLeftRadius: 2,
    borderTopRightRadius: 2
  },
  contentContainer: {
    flex: 1,
    backgroundColor: PincTheme.colors.background
  },
  gridContainer: {
    padding: 12,
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between"
  },
  gridImageWrapper: {
    width: "48%",
    aspectRatio: 1,
    borderRadius: PincTheme.borderRadius.md,
    overflow: "hidden",
    marginBottom: 12,
    ...PincTheme.shadows.sm,
    position: "relative"
  },
  gridImage: {
    width: "100%",
    height: "100%"
  },
  gridOverlay: {
    position: "absolute",
    bottom: 6,
    right: 6,
    backgroundColor: "rgba(26, 26, 26, 0.7)",
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 4
  },
  gridRatingText: {
    color: "#FFC107",
    fontSize: 9,
    fontWeight: "bold"
  },
  loaderContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center"
  },
  loaderText: {
    marginTop: 8,
    color: PincTheme.colors.textSecondary,
    fontFamily: PincTheme.fonts.body
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 32
  },
  emptyTitle: {
    fontSize: 16,
    fontFamily: PincTheme.fonts.heading,
    fontWeight: "bold",
    color: PincTheme.colors.textPrimary,
    marginBottom: 8
  },
  emptySubtitle: {
    fontSize: 12,
    fontFamily: PincTheme.fonts.body,
    color: PincTheme.colors.textSecondary,
    textAlign: "center",
    lineHeight: 18
  },
  summaryWidget: {
    backgroundColor: "#FDFBF7",
    borderWidth: 1,
    borderColor: PincTheme.colors.border,
    borderRadius: PincTheme.borderRadius.md,
    padding: 14,
    marginHorizontal: 16,
    marginTop: 12,
    ...PincTheme.shadows.sm
  },
  summaryRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: 8
  },
  summaryText: {
    fontSize: 12,
    fontFamily: PincTheme.fonts.body,
    color: PincTheme.colors.textSecondary,
    fontWeight: "500"
  },
  summaryTextBold: {
    fontSize: 12,
    fontFamily: PincTheme.fonts.heading,
    color: PincTheme.colors.textPrimary,
    fontWeight: "700"
  },
  summarySubtext: {
    fontSize: 10,
    fontFamily: PincTheme.fonts.body,
    color: PincTheme.colors.textTertiary,
    marginTop: 2
  },
  summaryBadge: {
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4
  },
  summaryBadgeText: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.5
  },
  feedCard: {
    backgroundColor: PincTheme.colors.card,
    borderRadius: PincTheme.borderRadius.md,
    padding: 16,
    marginHorizontal: 16,
    marginTop: 12,
    borderWidth: 1,
    borderColor: PincTheme.colors.border,
    ...PincTheme.shadows.sm
  },
  feedHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    marginRight: 10
  },
  userMeta: {
    flex: 1
  },
  username: {
    fontSize: 13,
    fontFamily: PincTheme.fonts.body,
    fontWeight: "bold",
    color: PincTheme.colors.textPrimary
  },
  timestamp: {
    fontSize: 10,
    fontFamily: PincTheme.fonts.body,
    color: PincTheme.colors.textTertiary,
    marginTop: 1
  },
  liveBadge: {
    backgroundColor: "rgba(46, 125, 50, 0.1)",
    borderColor: PincTheme.colors.crowdGreen,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4
  },
  liveBadgeText: {
    fontSize: 9,
    fontFamily: PincTheme.fonts.body,
    fontWeight: "bold",
    color: PincTheme.colors.crowdGreen
  },
  feedText: {
    fontSize: 13,
    fontFamily: PincTheme.fonts.body,
    color: PincTheme.colors.textPrimary,
    lineHeight: 18,
    marginBottom: 10
  },
  feedImage: {
    width: "100%",
    height: 180,
    borderRadius: PincTheme.borderRadius.sm,
    overflow: "hidden"
  },
  feedCardFriend: {
    borderColor: "#FFD70088", // Soft gold border for friend discovery highlight
    backgroundColor: "#FFFDF9", // Extremely soft warm cream background
    borderWidth: 1.5
  },
  feedCardOwnActive: {
    borderColor: PincTheme.colors.primary,
    borderWidth: 1.5,
    backgroundColor: "#FFF9FA", // Soft glowing peach/rose tint
    shadowColor: PincTheme.colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4
  },
  activityBadge: {
    backgroundColor: "#FFEBF0",
    borderColor: "#FF4B72",
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4
  },
  activityBadgeText: {
    fontSize: 9,
    fontFamily: PincTheme.fonts.body,
    fontWeight: "bold",
    color: "#FF4B72"
  },
  friendBadge: {
    backgroundColor: "rgba(255, 75, 114, 0.1)",
    borderColor: PincTheme.colors.primary,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4
  },
  friendBadgeText: {
    fontSize: 9,
    fontFamily: PincTheme.fonts.body,
    fontWeight: "bold",
    color: PincTheme.colors.primary
  },
  socialActionRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 12,
    borderTopWidth: 1,
    borderTopColor: PincTheme.colors.border,
    paddingTop: 10,
    gap: 20
  },
  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 4,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: "#FAF9F5",
    borderWidth: 1,
    borderColor: PincTheme.colors.border
  },
  actionIcon: {
    fontSize: 14,
    color: PincTheme.colors.textSecondary
  },
  actionIconLiked: {
    transform: [{ scale: 1.1 }]
  },
  actionCount: {
    fontSize: 12,
    fontWeight: "600",
    color: PincTheme.colors.textSecondary,
    marginLeft: 6
  },
  actionCountLiked: {
    color: "#FF4B72"
  }
});
