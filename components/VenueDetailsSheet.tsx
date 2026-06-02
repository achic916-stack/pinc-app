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
  Alert,
  Linking,
  Platform,
  TextInput
} from "react-native";
import { Image } from "expo-image";
import { PincTheme } from "../styles/theme";
import { Venue, Pin, UserProfile, toggleLikePin, subscribeToComments, deletePin, db, uploadPinImage } from "../services/firebase";
import { doc, updateDoc, deleteDoc } from "firebase/firestore";
import { t } from "../services/localization";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { compressImage } from "../services/imageCompressor";
import { CommentsDrawer } from "./CommentsDrawer";
import { CachedVideo } from "./CachedVideo";
import { SocialLinksDisplay } from "./SocialLinks";
import { WatermarkShare } from "./WatermarkShare";
import { Modal } from "react-native";
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
  isFullScreen?: boolean;
  isEditing?: boolean;
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
  currentUser,
  isFullScreen = false,
  isEditing = false
}) => {
  const [activeTab, setActiveTab] = useState<"aesthetic" | "reality">("reality");
  const [activeVideoId, setActiveVideoId] = useState<string | null>(null);
  const [activeCommentsPinId, setActiveCommentsPinId] = useState<string | null>(null);
  const [sharePin, setSharePin] = useState<Pin | null>(null);
  const [localLikes, setLocalLikes] = useState<{ [pinId: string]: { liked: boolean; count: number } }>({});
  const [commentsCounts, setCommentsCounts] = useState<{ [pinId: string]: number }>({});
  const [selectedFullScreenImage, setSelectedFullScreenImage] = useState<string | null>(null);

  // Owner checking & sponsored checks
  const isOwner = venue ? (venue.ownerId === currentUser.userId || !venue.ownerId) : false;
  const isShopPackage = venue ? (venue.is_sponsored === true || (venue.sponsor_tier && venue.sponsor_tier >= 1)) : false;
  const showEditPanel = isEditing && isShopPackage && isOwner;

  // Local editing states
  const [editedRating, setEditedRating] = useState<number>(venue ? (venue.aesthetic_rating || 5.0) : 5.0);
  const [editedCategory, setEditedCategory] = useState<string>(venue ? (venue.category || "café") : "café");
  const [editedCrowdStatus, setEditedCrowdStatus] = useState<string>(venue ? (venue.crowd_status || "Green") : "Green");
  const [editedDescription, setEditedDescription] = useState<string>(venue ? (venue.description || "") : "");
  const [editedImages, setEditedImages] = useState<string[]>(venue ? (venue.images || []) : []);
  const [isUploading, setIsUploading] = useState(false);
  const [isCategoryStatusCollapsed, setIsCategoryStatusCollapsed] = useState(true);

  useEffect(() => {
    if (venue) {
      setEditedRating(venue.aesthetic_rating || 5.0);
      setEditedCategory(venue.category || "café");
      setEditedCrowdStatus(venue.crowd_status || "Green");
      setEditedDescription(venue.description || "");
      setEditedImages(venue.images || []);
    }
  }, [venue]);

  const handleLongPressImage = (imageUri: string) => {
    if (!showEditPanel) return; // Only owner can delete in edit mode!
    Alert.alert(
      locale === "th" ? "ลบรูปภาพร้านค้า" : "Delete Shop Image",
      locale === "th" 
        ? "คุณแน่ใจหรือไม่ว่าต้องการเอารูปภาพนี้ออกจากร้านค้าชั่วคราว? (กรุณากดปุ่มบันทึกด้านล่างเพื่อยืนยัน)" 
        : "Are you sure you want to remove this image temporarily? (Please press save below to commit)",
      [
        { text: locale === "th" ? "ยกเลิก" : "Cancel", style: "cancel" },
        { 
          text: locale === "th" ? "ลบ" : "Delete", 
          style: "destructive",
          onPress: () => {
            setEditedImages(prev => prev.filter(img => img !== imageUri));
          }
        }
      ]
    );
  };

  const handlePickImage = async () => {
    const maxImages = venue.sponsor_tier === 2 ? 5 : venue.sponsor_tier === 3 ? 10 : 3;
    if (editedImages.length >= maxImages) {
      Alert.alert(
        locale === "th" ? "ครบตามกำหนด" : "Limit reached", 
        locale === "th" 
          ? `อัปโหลดได้สูงสุด ${maxImages} รูปสำหรับแพ็กเกจนี้` 
          : `You can upload up to ${maxImages} photos for this package.`
      );
      return;
    }

    Alert.alert(
      locale === "th" ? "เลือกรูปภาพ" : "Choose Image",
      locale === "th" ? "เลือกแหล่งที่มาของรูปภาพ" : "Select image source",
      [
        {
          text: locale === "th" ? "📷 ถ่ายรูป" : "📷 Camera",
          onPress: async () => {
            const { status } = await ImagePicker.requestCameraPermissionsAsync();
            if (status !== "granted") {
              Alert.alert(locale === "th" ? "ไม่ได้รับอนุญาต" : "Permission Denied", locale === "th" ? "กรุณาอนุญาตการเข้าถึงกล้อง" : "Please grant camera permission");
              return;
            }
            const result = await ImagePicker.launchCameraAsync({
              allowsEditing: true,
              quality: 0.85,
            });
            if (!result.canceled && result.assets?.length > 0) {
              uploadSingleImage(result.assets[0].uri);
            }
          },
        },
        {
          text: locale === "th" ? "🖼️ เลือกจากคลัง" : "🖼️ Gallery",
          onPress: async () => {
            const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
            if (status !== "granted") {
              Alert.alert(locale === "th" ? "ไม่ได้รับอนุญาต" : "Permission Denied", locale === "th" ? "กรุณาอนุญาตการเข้าถึงคลังรูปภาพ" : "Please grant photo library permission");
              return;
            }
            const result = await ImagePicker.launchImageLibraryAsync({
              mediaTypes: ImagePicker.MediaTypeOptions.Images,
              allowsEditing: true,
              quality: 0.85,
            });
            if (!result.canceled && result.assets?.length > 0) {
              uploadSingleImage(result.assets[0].uri);
            }
          },
        },
        { text: locale === "th" ? "ยกเลิก" : "Cancel", style: "cancel" },
      ]
    );
  };

  const uploadSingleImage = async (localUri: string) => {
    setIsUploading(true);
    try {
      const compressedUri = await compressImage(localUri);
      const downloadUrl = await uploadPinImage(compressedUri, currentUser.userId);
      setEditedImages(prev => [...prev, downloadUrl]);
    } catch (err: any) {
      console.error("Failed to upload image:", err);
      Alert.alert(locale === "th" ? "เกิดข้อผิดพลาด" : "Error", err.message || "Could not upload image");
    } finally {
      setIsUploading(false);
    }
  };

  const handleSaveShopDetails = async () => {
    if (editedImages.length === 0) {
      Alert.alert(
        locale === "th" ? "ข้อผิดพลาด" : "Error", 
        locale === "th" ? "จำเป็นต้องอัปโหลดรูปภาพอย่างน้อย 1 รูป" : "At least one image is required"
      );
      return;
    }

    setIsUploading(true);
    try {
      const venueDocRef = doc(db, "venues", venue.venueId);
      const updatedCoverImage = editedImages[0];

      const updateData = {
        aesthetic_rating: editedRating,
        category: editedCategory,
        crowd_status: editedCrowdStatus,
        description: editedDescription,
        images: editedImages,
        cover_image: updatedCoverImage,
        custom_icon_url: updatedCoverImage
      };

      await updateDoc(venueDocRef, updateData);

      venue.aesthetic_rating = editedRating;
      venue.category = editedCategory;
      venue.crowd_status = editedCrowdStatus;
      venue.description = editedDescription;
      venue.images = editedImages;
      venue.cover_image = updatedCoverImage;
      venue.custom_icon_url = updatedCoverImage;

      Alert.alert(
        locale === "th" ? "สำเร็จ" : "Success", 
        locale === "th" ? "บันทึกข้อมูลร้านค้าเรียบร้อยแล้ว" : "Shop details saved successfully"
      );
    } catch (err: any) {
      console.error("Failed to save shop details:", err);
      Alert.alert(
        locale === "th" ? "เกิดข้อผิดพลาด" : "Error", 
        err.message || "Could not save details"
      );
    } finally {
      setIsUploading(false);
    }
  };

  const handleDeleteVenue = () => {
    Alert.alert(
      locale === "th" ? "ลบหมุดร้านค้า" : "Delete Shop Pin",
      locale === "th" 
        ? `คุณแน่ใจหรือไม่ว่าต้องการลบหมุดร้านค้า "${venue.name}" นี้ออกจากแผนที่อย่างถาวร?` 
        : `Are you sure you want to permanently delete the shop pin "${venue.name}" from the map?`,
      [
        { text: locale === "th" ? "ยกเลิก" : "Cancel", style: "cancel" },
        { 
          text: locale === "th" ? "ลบ" : "Delete", 
          style: "destructive",
          onPress: async () => {
            try {
              const venueDocRef = doc(db, "venues", venue.venueId);
              await deleteDoc(venueDocRef);

              Alert.alert(
                locale === "th" ? "สำเร็จ" : "Success", 
                locale === "th" ? "ลบหมุดร้านค้าเรียบร้อยแล้ว" : "Shop pin deleted successfully",
                [
                  {
                    text: locale === "th" ? "ตกลง" : "OK",
                    onPress: () => {
                      onClose();
                    }
                  }
                ]
              );
            } catch (err) {
              console.error("Failed to delete venue:", err);
              Alert.alert(
                locale === "th" ? "เกิดข้อผิดพลาด" : "Error", 
                locale === "th" ? "ไม่สามารถลบหมุดร้านค้าได้ในขณะนี้" : "Could not delete shop pin at this time"
              );
            }
          }
        }
      ]
    );
  };

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

  const shopImages = showEditPanel 
    ? editedImages 
    : (venue.images && venue.images.length > 0 
        ? venue.images 
        : [venue.cover_image].filter(Boolean));

  const widget = getWidgetSummary();

  return (
    <View style={[
      styles.sheetContainer, 
      isFullScreen && { 
        height: '100%', 
        borderTopLeftRadius: 0, 
        borderTopRightRadius: 0,
        paddingTop: Platform.OS === 'ios' ? 0 : 12
      }
    ]}>
      {/* Drag Indicator / Header */}
      <View style={[styles.header, isFullScreen && { borderBottomWidth: 0, paddingVertical: 16 }]}>
        {!isFullScreen && <View style={styles.dragIndicator} />}
        <TouchableOpacity 
          style={[styles.closeButton, isFullScreen && { left: 16, top: 12, right: undefined }]} 
          onPress={onClose}
        >
          {isFullScreen ? (
            <Ionicons name="arrow-back" size={24} color={PincTheme.colors.textPrimary} />
          ) : (
            <Text style={styles.closeText}>✕</Text>
          )}
        </TouchableOpacity>
        {isFullScreen && (
          <Text style={{ fontSize: 16, fontWeight: '700', fontFamily: PincTheme.fonts.heading, color: PincTheme.colors.textPrimary }}>
            {venue.name}
          </Text>
        )}
      </View>

      {/* Venue Header Info / Owner Edit Panel */}
      <View style={styles.venueInfo}>
        {showEditPanel ? (
          /* Owner Administration Panel */
          <View style={{ gap: 14 }}>
            {/* Header Row (Name & Delete & Rating Selector) */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <TextInput
                style={{
                  fontSize: 20,
                  fontFamily: PincTheme.fonts.heading,
                  fontWeight: 'bold',
                  color: PincTheme.colors.textPrimary,
                  flex: 1,
                  borderBottomWidth: 1,
                  borderBottomColor: PincTheme.colors.border,
                  paddingVertical: 4,
                  marginRight: 10
                }}
                value={venue.name}
                editable={false}
              />
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <TouchableOpacity 
                  style={{ padding: 6, backgroundColor: '#FFEBF0', borderRadius: 8 }}
                  onPress={handleDeleteVenue}
                  activeOpacity={0.7}
                >
                  <Ionicons name="trash-outline" size={20} color="#FF4B72" />
                </TouchableOpacity>
                {/* Rating Badge (Editable: Taps to trigger prompt/options) */}
                <TouchableOpacity 
                  style={[styles.ratingBadge, { backgroundColor: PincTheme.colors.primary }]}
                  activeOpacity={0.8}
                  onPress={() => {
                    Alert.alert(
                      locale === "th" ? "ปรับแต่งคะแนนรีวิว" : "Adjust Rating Review",
                      locale === "th" ? "กรุณาเลือกคะแนนสำหรับร้านค้าของคุณ" : "Please select a rating for your shop",
                      [4.7, 4.8, 4.9, 5.0].map((rate) => ({
                        text: `★ ${rate.toFixed(1)}`,
                        onPress: () => setEditedRating(rate)
                      })).concat([{ text: locale === "th" ? "ยกเลิก" : "Cancel", style: "cancel" }])
                    );
                  }}
                >
                  <Text style={[styles.ratingText, { color: '#FFF' }]}>★ {editedRating.toFixed(1)} ✏️</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Category/Status Collapsible Panel Header */}
            <TouchableOpacity
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingVertical: 12,
                borderBottomWidth: 1,
                borderBottomColor: PincTheme.colors.border,
                marginTop: 4,
              }}
              onPress={() => setIsCategoryStatusCollapsed(prev => !prev)}
              activeOpacity={0.7}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name="options-outline" size={18} color={PincTheme.colors.primary} />
                <Text style={{ fontSize: 13, fontWeight: '700', color: PincTheme.colors.textPrimary, fontFamily: PincTheme.fonts.heading }}>
                  Category / Status
                </Text>
              </View>
              <Ionicons
                name={isCategoryStatusCollapsed ? "chevron-down" : "chevron-up"}
                size={18}
                color={PincTheme.colors.textSecondary}
              />
            </TouchableOpacity>

            {!isCategoryStatusCollapsed && (
              <View style={{ gap: 12, marginTop: 8, paddingHorizontal: 4 }}>
                {/* Category Option ("CAFÉ", "FOOD", "BAR", "SHOP", "CLOTHES", "BEAUTY", "ART/BOOKS") */}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: PincTheme.colors.textSecondary }}>CATEGORY:</Text>
                  <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
                    {["café", "food", "bar", "shop", "clothes", "beauty", "art/books"].map((cat) => (
                      <TouchableOpacity
                        key={cat}
                        style={{
                          paddingHorizontal: 12,
                          paddingVertical: 6,
                          borderRadius: 12,
                          borderWidth: 1,
                          borderColor: editedCategory === cat ? PincTheme.colors.primary : PincTheme.colors.border,
                          backgroundColor: editedCategory === cat ? PincTheme.colors.primaryLight : '#FFF'
                        }}
                        onPress={() => setEditedCategory(cat)}
                      >
                        <Text style={{
                          fontSize: 10,
                          fontWeight: 'bold',
                          color: editedCategory === cat ? PincTheme.colors.primary : PincTheme.colors.textSecondary
                        }}>
                          {cat === "art/books" ? "ART / BOOKS" : cat.toUpperCase()}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>

                {/* Crowd Status Option ("Empty / Chill", "Moderate Queue", "Crowded / Long Line") */}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: PincTheme.colors.textSecondary }}>STATUS:</Text>
                  <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
                    {[
                      { key: "Green", label: locale === "th" ? "Empty / Chill (โล่ง)" : "Empty / Chill", color: PincTheme.colors.crowdGreen, bg: PincTheme.colors.crowdGreenLight },
                      { key: "Yellow", label: locale === "th" ? "Moderate Queue (ปานกลาง)" : "Moderate Queue", color: PincTheme.colors.crowdYellow, bg: PincTheme.colors.crowdYellowLight },
                      { key: "Red", label: locale === "th" ? "Crowded (หนาแน่น)" : "Crowded / Long Line", color: PincTheme.colors.crowdRed, bg: PincTheme.colors.crowdRedLight }
                    ].map((item) => (
                      <TouchableOpacity
                        key={item.key}
                        style={{
                          paddingHorizontal: 10,
                          paddingVertical: 6,
                          borderRadius: 14,
                          borderWidth: 1.5,
                          borderColor: editedCrowdStatus.toLowerCase() === item.key.toLowerCase() ? item.color : PincTheme.colors.border,
                          backgroundColor: editedCrowdStatus.toLowerCase() === item.key.toLowerCase() ? item.bg : '#FFF'
                        }}
                        onPress={() => setEditedCrowdStatus(item.key)}
                      >
                        <Text style={{
                          fontSize: 10,
                          fontWeight: 'bold',
                          color: editedCrowdStatus.toLowerCase() === item.key.toLowerCase() ? item.color : PincTheme.colors.textSecondary
                        }}>
                          {item.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              </View>
            )}

            {/* Description Text Input */}
            <View style={{ gap: 4 }}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: PincTheme.colors.textSecondary }}>
                {locale === "th" ? "รายละเอียดโพสต์ / ข้อมูลร้าน" : "Description / Details"}:
              </Text>
              <TextInput
                style={{
                  borderWidth: 1,
                  borderColor: PincTheme.colors.border,
                  borderRadius: 8,
                  padding: 10,
                  fontSize: 13,
                  color: PincTheme.colors.textPrimary,
                  backgroundColor: '#FFF',
                  minHeight: 64,
                  textAlignVertical: 'top'
                }}
                placeholder={locale === "th" ? "กรอกที่อยู่ เบอร์โทรติดต่อ รายละเอียด..." : "Enter address, phone, details..."}
                placeholderTextColor={PincTheme.colors.textTertiary}
                multiline
                numberOfLines={3}
                value={editedDescription}
                onChangeText={setEditedDescription}
              />
            </View>

            {/* Save Shop Details Button */}
            <TouchableOpacity 
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: '#FF4B72',
                paddingVertical: 12,
                borderRadius: 10,
                gap: 8,
                marginTop: 6,
                shadowColor: '#FF4B72',
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.25,
                shadowRadius: 4,
                elevation: 4
              }}
              onPress={handleSaveShopDetails}
              activeOpacity={0.8}
            >
              <Ionicons name="save" size={18} color="#FFF" />
              <Text style={{ color: '#FFF', fontWeight: 'bold', fontSize: 14 }}>
                {locale === "th" ? "💾 บันทึกข้อมูลโพสต์ร้านค้า" : "💾 Save Shop Details"}
              </Text>
            </TouchableOpacity>
          </View>
        ) : (
          /* General User Read-Only Panel */
          <>
            <View style={styles.titleRow}>
              <Text style={styles.venueName}>{venue.name}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={styles.ratingBadge}>
                  <Text style={styles.ratingText}>★ {venue.aesthetic_rating.toFixed(1)}</Text>
                </View>
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

            {venue.sponsor_tier === 3 && (
              <TouchableOpacity 
                style={styles.directionsButton}
                onPress={() => {
                  const url = `https://www.google.com/maps/dir/?api=1&destination=${venue.latitude},${venue.longitude}`;
                  Linking.openURL(url);
                }}
              >
                <Ionicons name="navigate" size={16} color="#FFF" />
                <Text style={styles.directionsText}>{locale === "th" ? "ขอเส้นทาง" : "Get Directions"}</Text>
              </TouchableOpacity>
            )}

            {!!venue.description && (
              <Text style={styles.venueDescription}>{venue.description}</Text>
            )}

            {!!venue.socialLinks && (
              <View style={styles.socialLinksWrapper}>
                <SocialLinksDisplay socialLinks={venue.socialLinks} size={32} />
              </View>
            )}
          </>
        )}
      </View>
 
      {/* Premium Sliding Navigation Tabs */}
      {!isShopPackage && (
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
      )}
 
      {/* Tab View Contents */}
      <View style={styles.contentContainer}>
        {isShopPackage ? (
          /* Shop Uploaded Images Grid */
          <ScrollView contentContainerStyle={styles.gridContainer} showsVerticalScrollIndicator={false}>
            {shopImages.map((uri, index) => (
              <TouchableOpacity 
                key={index} 
                style={styles.gridImageWrapper}
                activeOpacity={0.9}
                onPress={() => setSelectedFullScreenImage(uri)}
                onLongPress={() => handleLongPressImage(uri)}
              >
                <Image source={{ uri }} style={styles.gridImage} contentFit="cover" />
              </TouchableOpacity>
            ))}

            {/* Owner Add Photo Card */}
            {showEditPanel && (
              <TouchableOpacity 
                style={[
                  styles.gridImageWrapper, 
                  { 
                    backgroundColor: '#FFF9FA', 
                    borderWidth: 2, 
                    borderStyle: 'dashed', 
                    borderColor: '#FF4B72', 
                    justifyContent: 'center', 
                    alignItems: 'center' 
                  }
                ]}
                activeOpacity={0.7}
                onPress={handlePickImage}
              >
                <Ionicons name="add" size={36} color="#FF4B72" />
                <Text style={{ fontSize: 10, fontWeight: 'bold', color: '#FF4B72', marginTop: 4 }}>
                  {locale === "th" ? "เพิ่มรูปภาพ" : "Add Photo"}
                </Text>
              </TouchableOpacity>
            )}
          </ScrollView>
        ) : activeTab === "aesthetic" ? (
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
                        <View style={{ position: 'relative' }}>
                          {isActuallyVideo(pin) ? (
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
                          )}

                          {venue.sponsor_tier === 3 && (
                            <TouchableOpacity
                              style={{
                                position: 'absolute',
                                bottom: 12,
                                left: 12,
                                backgroundColor: 'rgba(255, 75, 114, 0.95)',
                                paddingHorizontal: 12,
                                paddingVertical: 8,
                                borderRadius: 20,
                                flexDirection: 'row',
                                alignItems: 'center',
                                shadowColor: '#000',
                                shadowOffset: { width: 0, height: 2 },
                                shadowOpacity: 0.25,
                                shadowRadius: 3.84,
                                elevation: 5,
                              }}
                              onPress={() => {
                                const url = `https://www.google.com/maps/dir/?api=1&destination=${venue.latitude},${venue.longitude}`;
                                Linking.openURL(url);
                              }}
                              activeOpacity={0.8}
                            >
                              <Ionicons name="navigate" size={16} color="#FFF" />
                              <Text style={{ color: '#FFF', fontSize: 13, fontWeight: 'bold', marginLeft: 6 }}>
                                {locale === "th" ? "ขอเส้นทางไปที่นี่" : "Get Directions"}
                              </Text>
                            </TouchableOpacity>
                          )}
                        </View>
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

                        {/* Share Button */}
                        {pin.image_url && (
                          <TouchableOpacity 
                            style={styles.actionButton} 
                            onPress={() => setSharePin(pin)}
                            activeOpacity={0.7}
                          >
                            <Text style={styles.actionIcon}>🔗</Text>
                            <Text style={styles.actionCount}>แชร์</Text>
                          </TouchableOpacity>
                        )}
                        
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
            locationName={venue.name} 
            onClose={() => setSharePin(null)} 
          />
        </Modal>
      )}

      {/* Full Screen Image Preview Modal */}
      {selectedFullScreenImage && (
        <Modal
          visible={true}
          transparent={true}
          animationType="fade"
          onRequestClose={() => setSelectedFullScreenImage(null)}
        >
          <View style={styles.fullScreenOverlay}>
            <TouchableOpacity 
              style={styles.fullScreenCloseBtn} 
              onPress={() => setSelectedFullScreenImage(null)}
              activeOpacity={0.7}
            >
              <Ionicons name="close" size={32} color="#FFF" />
            </TouchableOpacity>
            <Image 
              source={{ uri: selectedFullScreenImage }} 
              style={styles.fullScreenImage} 
              contentFit="contain" 
            />
          </View>
        </Modal>
      )}

      {/* Upload/Save Loader Overlay */}
      {isUploading && (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(255,255,255,0.75)', justifyContent: 'center', alignItems: 'center', zIndex: 99999 }]}>
          <ActivityIndicator size="large" color="#FF4B72" />
          <Text style={{ marginTop: 12, fontWeight: '700', color: '#FF4B72', fontSize: 13, fontFamily: PincTheme.fonts.heading }}>
            {locale === "th" ? "กำลังประมวลผลและบันทึกข้อมูล..." : "Processing and saving..."}
          </Text>
        </View>
      )}
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
  directionsButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: PincTheme.colors.primary,
    marginTop: 12,
    paddingVertical: 10,
    borderRadius: PincTheme.borderRadius.md,
    gap: 8
  },
  directionsText: {
    color: "#FFF",
    fontFamily: PincTheme.fonts.heading,
    fontWeight: "bold",
    fontSize: 14
  },
  venueDescription: {
    fontFamily: PincTheme.fonts.body,
    fontSize: 13,
    color: PincTheme.colors.textSecondary,
    marginTop: 12,
    lineHeight: 20,
  },
  socialLinksWrapper: {
    marginTop: 12,
    alignItems: 'flex-start',
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
  },
  fullScreenOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.95)",
    justifyContent: "center",
    alignItems: "center",
    position: "relative"
  },
  fullScreenCloseBtn: {
    position: "absolute",
    top: Platform.OS === 'ios' ? 44 : 24,
    right: 20,
    zIndex: 10,
    padding: 10,
    backgroundColor: "rgba(0, 0, 0, 0.4)",
    borderRadius: 22
  },
  fullScreenImage: {
    width: "100%",
    height: "100%"
  }
});
