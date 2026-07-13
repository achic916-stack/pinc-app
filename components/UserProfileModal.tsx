import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  FlatList,
  Modal,
  ActivityIndicator,
  SafeAreaView,
  Alert,
  TextInput,
  Dimensions,
  Switch,
  ScrollView,
  Linking
} from "react-native";
import { Ionicons, MaterialIcons, Feather, FontAwesome5 } from "@expo/vector-icons";
import { LinearGradient } from 'expo-linear-gradient';
import { PincTheme } from "../styles/theme";
import {
  UserProfile,
  Pin,
  Venue,
  fetchUserProfile,
  subscribeToUserPins,
  toggleFollow,
  checkIsFollowing,
  getUserStats,
  updateUserProfile,
  uploadProfileImage,
  subscribeToActiveChats,
  fetchSavedPins,
  blockUser
} from "../services/firebase";
import { t } from "../services/localization";
import * as ImagePicker from "expo-image-picker";
import { BusinessPackagesModal } from "./BusinessPackagesModal";
import { UserListModal } from "./UserListModal";
import { ChatModal } from "./ChatModal";
import { WatermarkShare } from "./WatermarkShare";
import { ChatInboxModal } from "./ChatInboxModal";
import { AdminStatsModal } from "./AdminStatsModal";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

interface UserProfileModalProps {
  visible: boolean;
  userId: string | null;
  currentUserId: string;
  onClose: () => void;
  onSelectMemory?: (pin: Pin) => void;
  locale?: "en" | "th";
  setLocale?: (locale: "en" | "th") => void;
  onDeletePin?: (pin: Pin) => void;
  setUserId?: (userId: string) => void;
  currentUserProfile?: UserProfile | null;
  venues?: Venue[];
  onSelectEditVenue?: (venue: Venue) => void;
  onUpdateProfile?: (updatedProfile: UserProfile) => void;
  onSetCrewBase?: (venue: Venue) => void;
  locationTrackingEnabled?: boolean;
  setLocationTrackingEnabled?: (enabled: boolean) => void;
  onSignOut?: () => void;
  onDeleteAccount?: () => void;
  isModal?: boolean;
}

export const UserProfileModal: React.FC<UserProfileModalProps> = ({
  visible,
  userId,
  currentUserId,
  onClose,
  onSelectMemory,
  locale = "en",
  setLocale,
  onDeletePin,
  setUserId,
  currentUserProfile,
  venues = [],
  onSelectEditVenue,
  onUpdateProfile,
  onSetCrewBase,
  locationTrackingEnabled = true,
  setLocationTrackingEnabled,
  onSignOut,
  onDeleteAccount,
  isModal = true
}) => {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [pins, setPins] = useState<Pin[]>([]);
  const [isLoadingProfile, setIsLoadingProfile] = useState(false);
  const [isFollowing, setIsFollowing] = useState(false);
  const [isFollowedBy, setIsFollowedBy] = useState(false);
  const [isTogglingFollow, setIsTogglingFollow] = useState(false);
  
  // States
  const [stats, setStats] = useState({ followersCount: 0, followingCount: 0 });
  const [showEditModal, setShowEditModal] = useState(false);
  const [editDisplayName, setEditDisplayName] = useState("");
  const [editBio, setEditBio] = useState("");
  const [editPreviewPic, setEditPreviewPic] = useState<string | null>(null);
  const [editPinColor, setEditPinColor] = useState<string>("#FF69B4");
  const [isSaving, setIsSaving] = useState(false);
  const [showBusinessPackages, setShowBusinessPackages] = useState(false);
  const [isChatVisible, setIsChatVisible] = useState(false);
  const [sharePin, setSharePin] = useState<Pin | null>(null);
  const [showAdminStats, setShowAdminStats] = useState(false);
  
  // New States for Follower Lists and Chat
  const [userListType, setUserListType] = useState<"followers" | "following" | null>(null);
  const [isInboxVisible, setIsInboxVisible] = useState(false);
  const [unreadInboxCount, setUnreadInboxCount] = useState(0);
  const myShops = (venues || []).filter((v) => 
    v.ownerId === currentUserId && 
    (v.is_sponsored || (v.sponsor_tier && v.sponsor_tier >= 1))
  );

  const [activeTab, setActiveTab] = useState<"posts" | "saved">("posts");
  const [savedPinsData, setSavedPinsData] = useState<Pin[]>([]);
  const [isLoadingSaved, setIsLoadingSaved] = useState(false);

  useEffect(() => {
    if (!profile?.savedPins || activeTab !== "saved") return;
    let isActive = true;
    const loadSavedPins = async () => {
      setIsLoadingSaved(true);
      try {
        const data = await fetchSavedPins(profile.savedPins!);
        if (isActive) setSavedPinsData(data);
      } catch (e) {
        console.warn("Failed to load saved pins", e);
      } finally {
        if (isActive) setIsLoadingSaved(false);
      }
    };
    loadSavedPins();
    return () => { isActive = false; };
  }, [profile?.savedPins, activeTab]);

  useEffect(() => {
    if (!visible || !userId) {
      setProfile(null);
      setPins([]);
      setIsFollowing(false);
      setIsFollowedBy(false);
      setShowEditModal(false);
      return;
    }

    const loadData = async () => {
      setIsLoadingProfile(true);
      
      // Optimistic load to prevent "User Not Found" if network fails
      if (userId === currentUserId && currentUserProfile) {
        setProfile(currentUserProfile);
      }

      try {
        const userProfile = await fetchUserProfile(userId);
        if (userProfile) {
          setProfile(userProfile);
        } else if (userId === currentUserId && currentUserProfile) {
          setProfile(currentUserProfile);
        } else {
          setProfile(null);
        }

        const effectiveProfile = userProfile || (userId === currentUserId ? currentUserProfile : null);

        if (effectiveProfile && userId !== currentUserId) {
          const followStatus = await checkIsFollowing(currentUserId, userId);
          setIsFollowing(followStatus);

          const followedByStatus = await checkIsFollowing(userId, currentUserId);
          setIsFollowedBy(followedByStatus);
        }

        if (effectiveProfile) {
          const userStats = await getUserStats(userId);
          setStats(userStats);
        }
      } catch (err) {
        console.warn("Failed to load user profile:", err);
      } finally {
        setIsLoadingProfile(false);
      }
    };

    loadData();

    const unsubscribe = subscribeToUserPins(
      userId,
      (updatedPins) => {
        setPins(updatedPins);
      },
      (err) => {
        console.warn("Failed to subscribe to user pins:", err);
      }
    );

    return () => unsubscribe();
  }, [visible, userId, currentUserId]);

  useEffect(() => {
    if (!visible || userId !== currentUserId || !currentUserId) {
      setUnreadInboxCount(0);
      return;
    }

    const unsubscribe = subscribeToActiveChats(currentUserId, (activeChats) => {
      let count = 0;
      activeChats.forEach(chat => {
        count += (chat[`unreadCount_${currentUserId}`] || 0);
      });
      setUnreadInboxCount(count);
    });

    return () => unsubscribe();
  }, [visible, userId, currentUserId]);

  const handleToggleFollow = async () => {
    if (!profile || !userId || userId === currentUserId || isTogglingFollow) return;

    const previousFollowingState = isFollowing;
    setIsFollowing(!previousFollowingState);
    setIsTogglingFollow(true);

    try {
      const nowFollowing = await toggleFollow(currentUserId, userId);
      setIsFollowing(nowFollowing);
      // Update local stats optimistically
      setStats(prev => ({
        ...prev,
        followersCount: nowFollowing ? prev.followersCount + 1 : Math.max(0, prev.followersCount - 1)
      }));
    } catch (err) {
      console.warn("Failed to toggle follow status:", err);
      setIsFollowing(previousFollowingState);
      Alert.alert(
          locale === "th" ? "เกิดข้อผิดพลาด" : "Error",
          locale === "th"
              ? "ไม่สามารถดำเนินการติดตามได้ในขณะนี้ กรุณาลองใหม่อีกครั้ง"
              : "Failed to update follow status. Please check your connection and try again."
      );
    } finally {
      setIsTogglingFollow(false);
    }
  };

  const handleBlockUser = () => {
    if (!userId || userId === currentUserId) return;
    Alert.alert(
      locale === "th" ? "บล็อกผู้ใช้" : "Block User",
      locale === "th" 
        ? "คุณแน่ใจหรือไม่ว่าต้องการบล็อกผู้ใช้นี้? โพสต์ของพวกเขาจะถูกซ่อนจากคุณ" 
        : "Are you sure you want to block this user? Their posts will be hidden from you.",
      [
        { text: locale === "th" ? "ยกเลิก" : "Cancel", style: "cancel" },
        { 
          text: locale === "th" ? "บล็อก" : "Block", 
          style: "destructive", 
          onPress: async () => {
            try {
              await blockUser(currentUserId, userId);
              Alert.alert(
                locale === "th" ? "บล็อกสำเร็จ" : "Blocked", 
                locale === "th" ? "ผู้ใช้ถูกบล็อกแล้ว" : "User has been blocked."
              );
              onClose(); // Close profile modal immediately after blocking
            } catch (error) {
              console.error("Error blocking user:", error);
              Alert.alert("Error", "Could not block user.");
            }
          } 
        }
      ]
    );
  };

  const handleOpenEditModal = () => {
    if (!profile) return;
    setEditDisplayName(profile.username);
    setEditBio(profile.bio || "");
    setEditPinColor(profile.pinColor || "#FF69B4");
    setEditPreviewPic(null);
    setShowEditModal(true);
  };

  const handleSaveProfile = async () => {
    if (!userId || !profile) return;
    setIsSaving(true);
    try {
      const updates: Partial<UserProfile> = {
        username: editDisplayName.trim(),
        bio: editBio.trim(),
        pinColor: editPinColor
      };
      // If user selected a new photo, upload it first
      if (editPreviewPic) {
        const newUrl = await uploadProfileImage(editPreviewPic, userId);
        updates.profile_pic = newUrl;
      }
      await updateUserProfile(userId, updates);
      
      const nextProfile = { ...profile, ...updates } as UserProfile;
      setProfile(nextProfile);
      
      if (onUpdateProfile) {
        onUpdateProfile(nextProfile);
      }
      
      setShowEditModal(false);
    } catch (err) {
      Alert.alert("Error", "Failed to save profile. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  const handlePickImage = () => {
    Alert.alert(
      "Change Profile Photo",
      "Choose a source",
      [
        {
          text: "📷 Take Photo",
          onPress: async () => {
            const { status } = await ImagePicker.requestCameraPermissionsAsync();
            if (status !== "granted") {
              Alert.alert("Permission Denied", "Camera access is required.");
              return;
            }
            const result = await ImagePicker.launchCameraAsync({
              allowsEditing: true,
              aspect: [1, 1],
              quality: 1.0
            });
            if (!result.canceled && result.assets?.length > 0) {
              setEditPreviewPic(result.assets[0].uri);
            }
          }
        },
        {
          text: "🖼️ Choose from Library",
          onPress: async () => {
            const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
            if (status !== "granted") {
              Alert.alert("Permission Denied", "Photo library access is required.");
              return;
            }
            const result = await ImagePicker.launchImageLibraryAsync({
              mediaTypes: ImagePicker.MediaTypeOptions.Images,
              allowsEditing: true,
              aspect: [1, 1],
              quality: 1.0
            });
            if (!result.canceled && result.assets?.length > 0) {
              setEditPreviewPic(result.assets[0].uri);
            }
          }
        },
        { text: "Cancel", style: "cancel" }
      ]
    );
  };

  if (!visible || !userId) return null;

  const content = (
    <>
    <View style={[styles.modalOverlay, !isModal && { backgroundColor: PincTheme.colors.background }]}>
      <SafeAreaView style={[styles.modalContent, !isModal && { height: "100%", borderTopLeftRadius: 0, borderTopRightRadius: 0 }]}>
        <View style={[styles.modalHeader, { justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 8 }]}>
          {isModal ? (
            <TouchableOpacity 
              style={styles.localeToggle} 
              onPress={() => setLocale && setLocale(locale === "en" ? "th" : "en")}
            >
              <Text style={styles.localeText}>{locale === "en" ? "TH" : "EN"}</Text>
            </TouchableOpacity>
          ) : (
            <View /> 
          )}
          {isModal && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              {userId !== currentUserId && userId && (
                <TouchableOpacity onPress={handleBlockUser} style={styles.closeButton}>
                  <Ionicons name="ban" size={24} color="#FF4B72" />
                </TouchableOpacity>
              )}
              <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                <Ionicons name="close" size={28} color={PincTheme.colors.textSecondary} />
              </TouchableOpacity>
            </View>
          )}
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          {isLoadingProfile ? (
            <View style={styles.loaderContainer}>
              <ActivityIndicator size="large" color={PincTheme.colors.primary} style={{ marginTop: 40 }} />
            </View>
          ) : !profile ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyTitle}>User Not Found</Text>
            </View>
          ) : (
            <View style={{ paddingBottom: 20 }}>
              <View style={styles.profileHeaderContainer}>
                  <View style={styles.avatarContainer}>
                    <Image
                      source={{ uri: profile.profile_pic }}
                      style={styles.avatarLarge}
                    />
                    {userId === currentUserId && (
                      <TouchableOpacity
                        style={styles.avatarCameraBtn}
                        onPress={() => {
                          handleOpenEditModal();
                          // small delay so modal opens first, then trigger pick
                        }}
                        activeOpacity={0.8}
                      >
                        <Text style={styles.avatarCameraBtnText}>✏️</Text>
                      </TouchableOpacity>
                    )}
                  </View>

                  <Text style={styles.username}>@{profile.username}</Text>
                  {profile.bio ? <Text style={styles.bio}>{profile.bio}</Text> : null}

                  <View style={styles.statsRow}>
                    <View style={styles.statItem}>
                      <Text style={styles.statNumber}>{pins.length}</Text>
                      <Text style={styles.statLabel}>Posts</Text>
                    </View>
                    <TouchableOpacity style={styles.statItem} onPress={() => setUserListType("followers")} activeOpacity={0.7}>
                      <Text style={styles.statNumber}>{stats.followersCount}</Text>
                      <Text style={styles.statLabel}>Followers</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.statItem} onPress={() => setUserListType("following")} activeOpacity={0.7}>
                      <Text style={styles.statNumber}>{stats.followingCount}</Text>
                      <Text style={styles.statLabel}>Following</Text>
                    </TouchableOpacity>
                  </View>

                  {userId === currentUserId ? (
                    <View style={{ alignItems: "center", width: "100%", paddingHorizontal: 16 }}>
                      <View style={{ flexDirection: "row", gap: 10, marginTop: 16, width: "100%" }}>
                        <TouchableOpacity
                          style={[styles.editProfileBtn, { marginTop: 0, flex: 1, minWidth: 0 }]}
                          onPress={handleOpenEditModal}
                          activeOpacity={0.8}
                        >
                          <Text style={styles.editProfileBtnText}>✏️ Edit Profile</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={[
                            styles.editProfileBtn,
                            { 
                              marginTop: 0, 
                              flex: 1, 
                              minWidth: 0,
                              position: "relative"
                            }
                          ]}
                          onPress={() => setIsInboxVisible(true)}
                          activeOpacity={0.8}
                        >
                          <Ionicons name="chatbubble-ellipses-outline" size={16} color={PincTheme.colors.textPrimary} style={{ marginRight: 6 }} />
                          <Text style={styles.editProfileBtnText}>{locale === "th" ? "ข้อความ" : "Messages"}</Text>
                          {unreadInboxCount > 0 && (
                            <View style={{
                              position: "absolute",
                              top: -6,
                              right: -6,
                              backgroundColor: PincTheme.colors.primary,
                              borderRadius: 10,
                              minWidth: 20,
                              height: 20,
                              justifyContent: "center",
                              alignItems: "center",
                              paddingHorizontal: 5,
                              borderWidth: 1.5,
                              borderColor: PincTheme.colors.border
                            }}>
                              <Text style={{ color: "#FFF", fontSize: 9, fontWeight: "bold" }}>{unreadInboxCount}</Text>
                            </View>
                          )}
                        </TouchableOpacity>
                      </View>

                      {/* Early Bird Pending Banner */}
                      {profile.subscriptionStatus === "EARLY_BIRD_PENDING" && (
                        <View style={{ backgroundColor: "#FFF8E1", borderColor: "#FFCA28", borderWidth: 1, padding: 12, borderRadius: 8, marginTop: 12, width: "100%" }}>
                          <Text style={{ color: "#FF8F00", fontWeight: "bold", fontSize: 13, textAlign: 'center' }}>
                            {locale === "th" ? "⏳ รอแอดมินอนุมัติสิทธิ์ใช้งาน Premium ฟรี 3 เดือน" : "⏳ Pending Admin Approval for 3 Months Free Premium"}
                          </Text>
                        </View>
                      )}

                      {/* Expiration Warning Banner */}
                      {profile.subscriptionStatus === "EARLY_BIRD_ACTIVE" && profile.subscriptionExpiry && (
                        (() => {
                          const daysLeft = Math.ceil((profile.subscriptionExpiry.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
                          if (daysLeft <= 7 && daysLeft > 0) {
                            return (
                              <View style={{ backgroundColor: "#FFF0F4", borderColor: "#FF4B72", borderWidth: 1, padding: 12, borderRadius: 8, marginTop: 12, width: "100%" }}>
                                <Text style={{ color: "#FF4B72", fontWeight: "bold", fontSize: 13, textAlign: 'center' }}>
                                  {locale === "th" 
                                    ? `⚠️ สิทธิ์ Premium ฟรีจะหมดอายุใน ${daysLeft} วัน\nกรุณาต่ออายุแพ็กเกจด้านล่างเพื่อคงสิทธิ์การมองเห็นพิเศษ` 
                                    : `⚠️ Free Premium expires in ${daysLeft} days\nPlease renew your package below to keep your benefits.`}
                                </Text>
                              </View>
                            );
                          }
                          return null;
                        })()
                      )}

                      <TouchableOpacity
                        style={[styles.editProfileBtn, { backgroundColor: PincTheme.colors.primary, borderColor: "#000", marginTop: 10, width: "100%", minWidth: 0 }]}
                        onPress={() => setShowBusinessPackages(true)}
                        activeOpacity={0.8}
                      >
                        <Text style={[styles.editProfileBtnText, { color: "#FFF" }]}>{locale === "th" ? "สำหรับร้านค้า" : "For Business"}</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[styles.editProfileBtn, { backgroundColor: "#F5F5F5", borderColor: PincTheme.colors.border, marginTop: 10, width: "100%", minWidth: 0 }]}
                        onPress={() => Linking.openURL('mailto:ashitastudio.pinc@gmail.com')}
                        activeOpacity={0.8}
                      >
                        <Text style={[styles.editProfileBtnText, { color: PincTheme.colors.textSecondary }]}>{locale === "th" ? "🎧 ติดต่อช่วยเหลือ (Email Support)" : "🎧 Email Support"}</Text>
                      </TouchableOpacity>

                      {profile.role === "ADMIN" && (
                        <TouchableOpacity
                          style={[styles.editProfileBtn, { backgroundColor: "#E6F0FA", borderColor: "#007AFF", marginTop: 10, width: "100%", minWidth: 0 }]}
                          onPress={() => setShowAdminStats(true)}
                          activeOpacity={0.8}
                        >
                          <Text style={[styles.editProfileBtnText, { color: "#007AFF" }]}>{locale === "th" ? "📊 สถิติระบบ (สำหรับแอดมิน)" : "📊 Admin Dashboard"}</Text>
                        </TouchableOpacity>
                      )}

                      {/* My Shops list */}
                      {myShops.length > 0 && (
                        <View style={{ marginTop: 16, width: "100%", paddingHorizontal: 12 }}>
                          <Text style={{
                            fontSize: 12,
                            fontWeight: "bold",
                            color: PincTheme.colors.textSecondary,
                            alignSelf: "flex-start",
                            marginBottom: 8,
                            textTransform: "uppercase",
                            letterSpacing: 0.5,
                            fontFamily: PincTheme.fonts.heading
                          }}>
                            {locale === "th" ? "ร้านของฉัน" : "My Shops"}
                          </Text>
                          {myShops.map((shop) => (
                            <View key={shop.venueId} style={{ marginBottom: 8 }}>
                              <TouchableOpacity
                                style={{
                                  flexDirection: "row",
                                  alignItems: "center",
                                  justifyContent: "space-between",
                                  backgroundColor: "#FFF8F9",
                                  borderWidth: 1,
                                  borderColor: "#FFE0E6",
                                  borderTopLeftRadius: PincTheme.borderRadius.md,
                                  borderTopRightRadius: PincTheme.borderRadius.md,
                                  borderBottomLeftRadius: (shop.category === 'community' || shop.sponsor_tier === 4) ? 0 : PincTheme.borderRadius.md,
                                  borderBottomRightRadius: (shop.category === 'community' || shop.sponsor_tier === 4) ? 0 : PincTheme.borderRadius.md,
                                  paddingVertical: 10,
                                  paddingHorizontal: 12,
                                  width: "100%",
                                  ...PincTheme.shadows.sm
                                }}
                                onPress={() => {
                                  onClose(); // Close profile modal
                                  if (onSelectEditVenue) {
                                    onSelectEditVenue(shop);
                                  }
                                }}
                                activeOpacity={0.8}
                              >
                                <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                                  <Image
                                    source={{ uri: shop.cover_image }}
                                    style={{ width: 36, height: 36, borderRadius: 6, backgroundColor: PincTheme.colors.border }}
                                  />
                                  <View style={{ alignItems: "flex-start" }}>
                                    <Text style={{ fontSize: 13, fontWeight: "bold", color: "#1A1A1A", fontFamily: PincTheme.fonts.heading }} numberOfLines={1}>
                                      {shop.name}
                                    </Text>
                                    <Text style={{ fontSize: 10, color: "#666666", fontFamily: PincTheme.fonts.body }}>
                                      {shop.category.toUpperCase()}
                                    </Text>
                                  </View>
                                </View>
                                <Ionicons name="create-outline" size={18} color="#FF4B72" />
                              </TouchableOpacity>
                              
                              {(shop.category === 'community' || shop.sponsor_tier === 4) && (
                                <TouchableOpacity
                                  style={{
                                    flexDirection: 'row',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    backgroundColor: '#B366FF',
                                    paddingVertical: 10,
                                    borderBottomLeftRadius: PincTheme.borderRadius.md,
                                    borderBottomRightRadius: PincTheme.borderRadius.md,
                                    marginTop: -1,
                                    ...PincTheme.shadows.sm,
                                    borderWidth: 1,
                                    borderColor: '#B366FF'
                                  }}
                                  onPress={() => {
                                    onClose();
                                    if (onSetCrewBase) onSetCrewBase(shop);
                                  }}
                                  activeOpacity={0.9}
                                >
                                  <Text style={{ color: '#FFF', fontWeight: 'bold', fontSize: 12, fontFamily: PincTheme.fonts.heading }}>📍 {locale === 'th' ? 'ตั้งพิกัดฐานทัพ / จุดรวมพล' : 'Set Club Base Location'}</Text>
                                </TouchableOpacity>
                              )}
                            </View>
                          ))}
                        </View>
                      )}

                    </View>
                  ) : (
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, marginTop: 16 }}>
                      <TouchableOpacity
                        style={[
                          styles.followBtn,
                          { marginTop: 0, minWidth: 120 },
                          isFollowing && styles.followingBtnActive,
                          (!isFollowing && isFollowedBy) && styles.followBackBtn
                        ]}
                        onPress={handleToggleFollow}
                        disabled={isTogglingFollow}
                      >
                        {isTogglingFollow ? (
                          <ActivityIndicator size="small" color={isFollowing ? PincTheme.colors.primary : "#FFF"} />
                        ) : (
                          <Text
                            style={[
                              styles.followBtnText,
                              isFollowing && styles.followingBtnTextActive,
                              (!isFollowing && isFollowedBy) && styles.followBackBtnText
                            ]}
                          >
                            {isFollowing 
                              ? t(locale, "following") 
                              : isFollowedBy 
                                ? t(locale, "followBack") 
                                : t(locale, "follow")}
                          </Text>
                        )}
                      </TouchableOpacity>

                      <TouchableOpacity 
                        style={[styles.followBtn, { marginTop: 0, minWidth: 100, backgroundColor: PincTheme.colors.primary, borderWidth: 1, borderColor: PincTheme.colors.primary }]} 
                        onPress={() => setIsChatVisible(true)}
                      >
                        <Text style={[styles.followBtnText, { color: '#FFFFFF' }]}>Message</Text>
                      </TouchableOpacity>
                    </View>
                  )}

                  {/* Tabs: Posts | Saved */}
                  <View style={{ flexDirection: "row", marginTop: 24, borderBottomWidth: 1, borderColor: PincTheme.colors.border, width: "100%" }}>
                    <TouchableOpacity
                      style={{ flex: 1, paddingVertical: 12, alignItems: "center", borderBottomWidth: activeTab === "posts" ? 2 : 0, borderColor: PincTheme.colors.primary }}
                      onPress={() => setActiveTab("posts")}
                    >
                      <Text style={{ fontFamily: PincTheme.fonts.heading, fontWeight: "700", color: activeTab === "posts" ? PincTheme.colors.primary : PincTheme.colors.textSecondary }}>
                        {locale === "th" ? "โพสต์" : "Posts"}
                      </Text>
                    </TouchableOpacity>
                    {userId === currentUserId && (
                      <TouchableOpacity
                        style={{ flex: 1, paddingVertical: 12, alignItems: "center", borderBottomWidth: activeTab === "saved" ? 2 : 0, borderColor: PincTheme.colors.primary }}
                        onPress={() => setActiveTab("saved")}
                      >
                        <Text style={{ fontFamily: PincTheme.fonts.heading, fontWeight: "700", color: activeTab === "saved" ? PincTheme.colors.primary : PincTheme.colors.textSecondary }}>
                          {locale === "th" ? "ที่บันทึกไว้" : "Saved"}
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>

                  {/* Grid Content */}
                  <View style={{ width: "100%", flexDirection: "row", flexWrap: "wrap", paddingHorizontal: 8, paddingBottom: 16, marginTop: 12 }}>
                    {activeTab === "posts" && pins.map((pin) => (
                      <TouchableOpacity
                        key={`post-${pin.pinId}`}
                        style={{ width: "50%", padding: 8 }}
                        onPress={() => {
                          onClose();
                          if (onSelectMemory) onSelectMemory(pin);
                        }}
                      >
                        <View style={styles.memoryCard}>
                          <Image source={{ uri: pin.image_url }} style={styles.memoryThumbnail} />
                        </View>
                      </TouchableOpacity>
                    ))}
                    
                    {activeTab === "saved" && isLoadingSaved && (
                      <View style={{ width: "100%", padding: 40, alignItems: "center" }}>
                        <ActivityIndicator color={PincTheme.colors.primary} />
                      </View>
                    )}

                    {activeTab === "saved" && !isLoadingSaved && savedPinsData.map((pin) => (
                      <TouchableOpacity
                        key={`saved-${pin.pinId}`}
                        style={{ width: "50%", padding: 8 }}
                        onPress={() => {
                          onClose();
                          if (onSelectMemory) onSelectMemory(pin);
                        }}
                      >
                        <View style={styles.memoryCard}>
                          <Image source={{ uri: pin.image_url }} style={styles.memoryThumbnail} />
                        </View>
                      </TouchableOpacity>
                    ))}
                    
                    {activeTab === "posts" && pins.length === 0 && (
                      <View style={{ width: "100%", padding: 40, alignItems: "center" }}>
                        <Text style={{ color: PincTheme.colors.textSecondary }}>{locale === "th" ? "ยังไม่มีโพสต์" : "No posts yet"}</Text>
                      </View>
                    )}

                    {activeTab === "saved" && !isLoadingSaved && savedPinsData.length === 0 && (
                      <View style={{ width: "100%", padding: 40, alignItems: "center" }}>
                        <Text style={{ color: PincTheme.colors.textSecondary }}>{locale === "th" ? "ยังไม่มีโพสต์ที่บันทึกไว้" : "No saved posts"}</Text>
                      </View>
                    )}
                  </View>

                </View>
            </View>
          )}
        </ScrollView>
        </SafeAreaView>
      </View>

      {/* ── Edit Profile & Settings Modal ── */}
      <Modal
        visible={showEditModal}
        animationType="slide"
        transparent
        onRequestClose={() => setShowEditModal(false)}
      >
        <View style={styles.editModalOverlay}>
          <View style={[styles.editModalSheet, { maxHeight: '90%' }]}>
            {/* Handle bar */}
            <View style={styles.editModalHandle} />

            <Text style={styles.editModalTitle}>
              {locale === 'th' ? '✏️ แก้ไขโปรไฟล์ & ตั้งค่า' : '✏️ Edit Profile & Settings'}
            </Text>

            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              {/* Avatar picker */}
              <TouchableOpacity style={styles.editAvatarWrapper} onPress={handlePickImage} activeOpacity={0.85}>
                <Image
                  source={{ uri: editPreviewPic || profile?.profile_pic }}
                  style={styles.editAvatar}
                />
                <View style={styles.editAvatarOverlay}>
                  <Text style={styles.editAvatarOverlayText}>📸{"\n"}Change Photo</Text>
                </View>
              </TouchableOpacity>

              {/* Display name */}
              <Text style={styles.editFieldLabel}>{locale === 'th' ? 'ชื่อที่แสดง' : 'Display Name'}</Text>
              <TextInput
                style={styles.editFieldInput}
                value={editDisplayName}
                onChangeText={setEditDisplayName}
                placeholder="Your name"
                placeholderTextColor={PincTheme.colors.textTertiary}
                maxLength={30}
                autoCapitalize="none"
              />

              {/* Bio */}
              <Text style={styles.editFieldLabel}>{locale === 'th' ? 'คำอธิบายตัวเอง' : 'Bio'}</Text>
              <TextInput
                style={[styles.editFieldInput, styles.editFieldInputMulti]}
                value={editBio}
                onChangeText={setEditBio}
                placeholder="Tell people about yourself..."
                placeholderTextColor={PincTheme.colors.textTertiary}
                multiline
                maxLength={100}
                textAlignVertical="top"
              />

              {/* Map Pin Color Picker */}
              <Text style={[styles.editFieldLabel, { marginTop: 8 }]}>{locale === 'th' ? 'สีหมุดบนแผนที่ (Pin Color)' : 'Map Pin Color'}</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 10, paddingVertical: 8, gap: 15 }}>
                {['#FF69B4', '#00FFFF', '#39FF14', '#BF00FF', '#FF5F1F', '#FFFF00', 'rainbow'].map(color => (
                  <TouchableOpacity
                    key={color}
                    onPress={() => setEditPinColor(color)}
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 20,
                      backgroundColor: color !== 'rainbow' ? color : 'transparent',
                      borderWidth: editPinColor === color ? 3 : 0,
                      borderColor: PincTheme.colors.textPrimary,
                      shadowColor: color !== 'rainbow' ? color : '#FFFFFF',
                      shadowOffset: { width: 0, height: 0 },
                      shadowOpacity: 0.8,
                      shadowRadius: editPinColor === color ? 10 : 4,
                      elevation: editPinColor === color ? 10 : 4,
                      overflow: 'hidden',
                      justifyContent: 'center',
                      alignItems: 'center'
                    }}
                  >
                    {color === 'rainbow' && (
                      <LinearGradient
                        colors={['#FF0000', '#FF7F00', '#FFFF00', '#00FF00', '#0000FF', '#4B0082', '#9400D3']}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={{ width: '100%', height: '100%', position: 'absolute' }}
                      />
                    )}
                    {/* Glossy 3D Highlight Overlay */}
                    <LinearGradient
                      colors={['rgba(255,255,255,0.95)', 'rgba(255,255,255,0.1)', 'rgba(0,0,0,0.4)']}
                      locations={[0, 0.35, 1]}
                      start={{ x: 0.2, y: 0 }}
                      end={{ x: 0.8, y: 1 }}
                      style={{ position: 'absolute', width: '100%', height: '100%', borderRadius: 20 }}
                    />
                  </TouchableOpacity>
                ))}
              </ScrollView>

              {/* ─── Divider ─── */}
              <View style={{ flexDirection: 'row', alignItems: 'center', marginVertical: 20 }}>
                <View style={{ flex: 1, height: 1, backgroundColor: PincTheme.colors.border }} />
                <Text style={{ marginHorizontal: 12, fontSize: 11, fontWeight: '700', color: PincTheme.colors.textTertiary, letterSpacing: 1, textTransform: 'uppercase' }}>
                  {locale === 'th' ? 'ตั้งค่าและความเป็นส่วนตัว' : 'Settings & Privacy'}
                </Text>
                <View style={{ flex: 1, height: 1, backgroundColor: PincTheme.colors.border }} />
              </View>

              {/* Language Toggle */}
              <View style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                backgroundColor: "#FFFFFF",
                borderWidth: 1.5,
                borderColor: PincTheme.colors.primary,
                borderRadius: PincTheme.borderRadius.md,
                paddingVertical: 12,
                paddingHorizontal: 14,
                marginBottom: 12
              }}>
                <View style={{ flex: 1, marginRight: 16 }}>
                  <Text style={{ fontSize: 13, fontWeight: "bold", color: PincTheme.colors.primary, fontFamily: PincTheme.fonts.heading, marginBottom: 2 }}>
                    🌐 {locale === 'th' ? 'ภาษา / Language' : 'Language / ภาษา'}
                  </Text>
                  <Text style={{ fontSize: 10, color: PincTheme.colors.primary, opacity: 0.8, fontFamily: PincTheme.fonts.body }}>
                    {locale === 'th' ? 'สลับภาษาแอป' : 'Switch app language'}
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() => setLocale && setLocale(locale === 'en' ? 'th' : 'en')}
                  style={{
                    backgroundColor: PincTheme.colors.primary,
                    borderRadius: 16,
                    paddingHorizontal: 16,
                    paddingVertical: 6
                  }}
                >
                  <Text style={{ color: "#FFFFFF", fontWeight: '800', fontSize: 13 }}>
                    {locale === 'en' ? 'TH' : 'EN'}
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Location Proximity Tracking Toggle */}
              <View style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                backgroundColor: "#FFFFFF",
                borderWidth: 1.5,
                borderColor: PincTheme.colors.primary,
                borderRadius: PincTheme.borderRadius.md,
                paddingVertical: 12,
                paddingHorizontal: 14,
                marginBottom: 12
              }}>
                <View style={{ flex: 1, marginRight: 16, alignItems: 'flex-start' }}>
                  <Text style={{ fontSize: 13, fontWeight: "bold", color: PincTheme.colors.primary, fontFamily: PincTheme.fonts.heading, marginBottom: 2 }}>
                    {t(locale, "locationTrackingLabel")}
                  </Text>
                  <Text style={{ fontSize: 10, color: PincTheme.colors.primary, opacity: 0.8, fontFamily: PincTheme.fonts.body, textAlign: 'left' }}>
                    {t(locale, "locationTrackingDesc")}
                  </Text>
                </View>
                <Switch
                  value={locationTrackingEnabled}
                  onValueChange={setLocationTrackingEnabled}
                  trackColor={{ false: "rgba(0,0,0,0.2)", true: "#34C759" }}
                  thumbColor="#FFFFFF"
                />
              </View>

              {/* Sign Out */}
              <TouchableOpacity
                style={[
                  styles.editProfileBtn,
                  { backgroundColor: "#FFFFFF", borderColor: PincTheme.colors.primary, borderWidth: 1.5, marginTop: 0, marginBottom: 10, width: "100%", minWidth: 0, flexDirection: 'row', justifyContent: 'center', alignItems: 'center' }
                ]}
                onPress={() => {
                  setShowEditModal(false);
                  if (onSignOut) setTimeout(onSignOut, 350);
                }}
                activeOpacity={0.8}
              >
                <Ionicons name="log-out-outline" size={16} color={PincTheme.colors.primary} style={{ marginRight: 6 }} />
                <Text style={[styles.editProfileBtnText, { color: PincTheme.colors.primary }]}>
                  {t(locale, "signOut")}
                </Text>
              </TouchableOpacity>

              {/* Delete Account */}
              <TouchableOpacity
                style={[
                  styles.editProfileBtn,
                  { backgroundColor: PincTheme.colors.primary, borderColor: 'rgba(0,0,0,0.1)', marginTop: 0, marginBottom: 24, width: "100%", minWidth: 0, flexDirection: 'row', justifyContent: 'center', alignItems: 'center' }
                ]}
                onPress={() => {
                  setShowEditModal(false);
                  if (onDeleteAccount) setTimeout(onDeleteAccount, 350);
                }}
                activeOpacity={0.8}
              >
                <Ionicons name="trash-outline" size={16} color="#FFFFFF" style={{ marginRight: 6 }} />
                <Text style={[styles.editProfileBtnText, { color: "#FFFFFF" }]}>
                  {t(locale, "deleteAccountBtn")}
                </Text>
              </TouchableOpacity>
            </ScrollView>

            {/* Save / Cancel Actions */}
            <View style={[styles.editModalActions, { marginTop: 0 }]}>
              <TouchableOpacity
                style={styles.editCancelBtn}
                onPress={() => setShowEditModal(false)}
                disabled={isSaving}
              >
                <Text style={styles.editCancelBtnText}>{locale === 'th' ? 'ยกเลิก' : 'Cancel'}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.editSaveBtn, { backgroundColor: "#FFFFFF", borderWidth: 1.5, borderColor: PincTheme.colors.primary }, isSaving && { opacity: 0.6 }]}
                onPress={handleSaveProfile}
                disabled={isSaving}
              >
                {isSaving
                  ? <ActivityIndicator size="small" color={PincTheme.colors.primary} />
                  : <Text style={[styles.editSaveBtnText, { color: PincTheme.colors.primary }]}>{locale === 'th' ? 'บันทึก' : 'Save Changes'}</Text>
                }
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Business Packages Modal */}
      <BusinessPackagesModal 
        visible={showBusinessPackages} 
        onClose={() => setShowBusinessPackages(false)} 
        locale={locale}
      />

      {/* User List Modal (Followers / Following) */}
      <UserListModal
        visible={userListType !== null}
        userId={userId!}
        type={userListType}
        onClose={() => setUserListType(null)}
        onSelectUser={(newUserId) => {
          if (setUserId) setUserId(newUserId);
        }}
        locale={locale}
      />

      {/* Chat / DM Modal */}
      {profile && (
        <ChatModal
          visible={isChatVisible}
          currentUserId={currentUserId}
          targetUserId={userId!}
          targetUsername={profile.username}
          targetProfilePic={profile.profile_pic}
          onClose={() => setIsChatVisible(false)}
        />
      )}

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

      {/* Chat Inbox Modal */}
      <ChatInboxModal
        visible={isInboxVisible}
        currentUserId={currentUserId}
        onClose={() => setIsInboxVisible(false)}
        locale={locale}
      />

      {/* Admin Stats Modal */}
      <AdminStatsModal
        visible={showAdminStats}
        onClose={() => setShowAdminStats(false)}
      />
    </>
  );

  return isModal ? (
    <Modal
      animationType="slide"
      transparent={true}
      visible={visible}
      onRequestClose={onClose}
    >
      {content}
    </Modal>
  ) : content;
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: PincTheme.colors.backdrop,
    justifyContent: "flex-end"
  },
  modalContent: {
    backgroundColor: PincTheme.colors.background,
    borderTopLeftRadius: PincTheme.borderRadius.lg,
    borderTopRightRadius: PincTheme.borderRadius.lg,
    height: "90%",
    paddingBottom: 16
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: PincTheme.colors.card,
    borderTopLeftRadius: PincTheme.borderRadius.lg,
    borderTopRightRadius: PincTheme.borderRadius.lg,
  },
  closeButton: {
    padding: 6
  },
  closeButtonText: {
    fontSize: 18,
    color: PincTheme.colors.textSecondary,
    fontWeight: "bold"
  },
  loaderContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center"
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center"
  },
  emptyTitle: {
    fontSize: 16,
    color: PincTheme.colors.textPrimary,
    fontWeight: "bold"
  },
  profileHeaderContainer: {
    alignItems: "center",
    paddingHorizontal: 24,
    paddingBottom: 16,
    backgroundColor: PincTheme.colors.card,
    borderBottomWidth: 1,
    borderBottomColor: PincTheme.colors.border
  },
  avatarContainer: {
    position: "relative",
    marginBottom: 12,
    marginTop: 8
  },
  avatarLarge: {
    width: 90,
    height: 90,
    borderRadius: 45,
    borderWidth: 3,
    borderColor: PincTheme.colors.border,
    backgroundColor: PincTheme.colors.border,
    shadowColor: PincTheme.colors.textPrimary,
    shadowOffset: { width: 3, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 5
  },
  avatarCameraBtn: {
    position: "absolute",
    bottom: 0,
    right: 0,
    backgroundColor: PincTheme.colors.primary,
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2.5,
    borderColor: PincTheme.colors.border,
    shadowColor: PincTheme.colors.textPrimary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 4
  },
  avatarCameraBtnText: {
    fontSize: 13,
    lineHeight: 16
  },
  editProfileBtn: {
    backgroundColor: PincTheme.colors.background,
    borderWidth: 1.5,
    borderColor: PincTheme.colors.border,
    paddingHorizontal: 28,
    paddingVertical: 9,
    borderRadius: PincTheme.borderRadius.md,
    marginTop: 16,
    ...PincTheme.shadows.sm,
    minWidth: 150,
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "center"
  },
  editProfileBtnText: {
    color: PincTheme.colors.textPrimary,
    fontFamily: PincTheme.fonts.heading,
    fontWeight: "700",
    fontSize: 13
  },
  // Edit Profile Modal styles
  editModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end"
  },
  editModalSheet: {
    backgroundColor: PincTheme.colors.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 24,
    paddingBottom: 40,
    paddingTop: 16
  },
  editModalHandle: {
    width: 44,
    height: 5,
    borderRadius: 3,
    backgroundColor: PincTheme.colors.border,
    alignSelf: "center",
    marginBottom: 20
  },
  editModalTitle: {
    fontSize: 20,
    fontFamily: PincTheme.fonts.heading,
    fontWeight: "800",
    color: PincTheme.colors.textPrimary,
    textAlign: "center",
    marginBottom: 24
  },
  editAvatarWrapper: {
    alignSelf: "center",
    marginBottom: 16,
    borderRadius: 60,
    overflow: "hidden",
    position: "relative"
  },
  editAvatar: {
    width: 110,
    height: 110,
    borderRadius: 55,
    borderWidth: 3,
    borderColor: PincTheme.colors.primary
  },
  editAvatarOverlay: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "rgba(0,0,0,0.5)",
    paddingVertical: 8,
    alignItems: "center",
    justifyContent: "center",
    borderBottomLeftRadius: 55,
    borderBottomRightRadius: 55
  },
  editAvatarOverlayText: {
    color: "#FFF",
    fontSize: 10,
    fontWeight: "700",
    textAlign: "center",
    lineHeight: 16
  },
  editFieldLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: PincTheme.colors.textSecondary,
    fontFamily: PincTheme.fonts.body,
    letterSpacing: 0.5,
    marginBottom: 4,
    marginTop: 0
  },
  editFieldInput: {
    backgroundColor: PincTheme.colors.background,
    borderWidth: 1.5,
    borderColor: PincTheme.colors.border,
    borderRadius: PincTheme.borderRadius.md,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    fontFamily: PincTheme.fonts.body,
    color: PincTheme.colors.textPrimary,
    marginBottom: 10
  },
  editFieldInputMulti: {
    height: 60,
    textAlignVertical: "top"
  },
  editModalActions: {
    flexDirection: "row",
    gap: 12,
    marginTop: 8
  },
  editCancelBtn: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: PincTheme.colors.border,
    paddingVertical: 14,
    borderRadius: PincTheme.borderRadius.md,
    alignItems: "center"
  },
  editCancelBtnText: {
    color: PincTheme.colors.textSecondary,
    fontFamily: PincTheme.fonts.heading,
    fontWeight: "700",
    fontSize: 14
  },
  editSaveBtn: {
    flex: 2,
    backgroundColor: PincTheme.colors.primary,
    paddingVertical: 14,
    borderRadius: PincTheme.borderRadius.md,
    alignItems: "center",
    ...PincTheme.shadows.md
  },
  editSaveBtnText: {
    color: "#FFF",
    fontFamily: PincTheme.fonts.heading,
    fontWeight: "800",
    fontSize: 14
  },
  username: {
    fontSize: 18,
    fontFamily: PincTheme.fonts.heading,
    fontWeight: "700",
    color: PincTheme.colors.textPrimary
  },
  bio: {
    fontSize: 13,
    fontFamily: PincTheme.fonts.body,
    color: PincTheme.colors.textSecondary,
    textAlign: "center",
    marginTop: 6,
    lineHeight: 18,
    maxWidth: "85%"
  },
  localeToggle: {
    padding: 8,
  },
  localeText: {
    color: PincTheme.colors.textPrimary,
    fontWeight: "bold",
    fontSize: 16,
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: 350,
  },
  statsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-evenly",
    width: "100%",
    marginTop: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: PincTheme.colors.border
  },
  statItem: {
    alignItems: "center"
  },
  statNumber: {
    fontSize: 16,
    fontFamily: PincTheme.fonts.heading,
    fontWeight: "800",
    color: PincTheme.colors.textPrimary
  },
  statLabel: {
    fontSize: 11,
    fontFamily: PincTheme.fonts.body,
    color: PincTheme.colors.textTertiary,
    marginTop: 2
  },

  editForm: {
    width: "100%",
    marginTop: 12
  },
  editInput: {
    backgroundColor: PincTheme.colors.border,
    borderRadius: PincTheme.borderRadius.sm,
    padding: 12,
    marginBottom: 8,
    fontFamily: PincTheme.fonts.body,
    color: PincTheme.colors.textPrimary
  },
  editActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 8,
    marginTop: 4
  },
  cancelBtn: {
    padding: 10
  },
  cancelBtnText: {
    color: PincTheme.colors.textSecondary,
    fontWeight: "600"
  },
  saveBtn: {
    backgroundColor: PincTheme.colors.primary,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: PincTheme.borderRadius.sm,
    alignItems: "center",
    minWidth: 80
  },
  saveBtnText: {
    color: "#FFF",
    fontWeight: "bold"
  },
  followBtn: {
    backgroundColor: PincTheme.colors.primary,
    paddingHorizontal: 32,
    paddingVertical: 10,
    borderRadius: PincTheme.borderRadius.md,
    marginTop: 16,
    ...PincTheme.shadows.sm,
    minWidth: 140,
    alignItems: "center"
  },
  followingBtnActive: {
    backgroundColor: "transparent",
    borderWidth: 1.5,
    borderColor: PincTheme.colors.primary
  },
  followBtnText: {
    color: "#FFF",
    fontFamily: PincTheme.fonts.heading,
    fontWeight: "700",
    fontSize: 13,
    letterSpacing: 0.5
  },
  followingBtnTextActive: {
    color: PincTheme.colors.primary
  },
  followBackBtn: {
    backgroundColor: "#FFA726",
    borderColor: "#FB8C00",
    borderWidth: 1
  },
  followBackBtnText: {
    color: "#FFF"
  },
  gridHeader: {
    width: "100%",
    marginTop: 16,
    paddingTop: 16,
    alignItems: "center"
  },
  gridHeaderTitle: {
    fontSize: 12,
    fontFamily: PincTheme.fonts.heading,
    fontWeight: "800",
    color: PincTheme.colors.textSecondary,
    letterSpacing: 1,
    textTransform: "uppercase"
  },
  emptyGridContainer: {
    padding: 40,
    alignItems: "center"
  },
  emptyGridText: {
    fontSize: 16,
    fontFamily: PincTheme.fonts.heading,
    fontWeight: "700",
    color: PincTheme.colors.primary,
    textAlign: "center"
  },
  memoryCard: {
    flex: 1,
    margin: 8,
    borderRadius: 12,
    backgroundColor: PincTheme.colors.card,
    overflow: 'hidden',
    elevation: 3,
    shadowColor: PincTheme.colors.textPrimary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  memoryThumbnail: {
    width: '100%',
    height: 180,
  },
  memoryInfo: {
    padding: 10,
    flexDirection: 'row',
    alignItems: 'center'
  },
  memoryVenue: {
    fontSize: 14,
    fontWeight: '700',
    color: PincTheme.colors.textSecondary,
    fontFamily: PincTheme.fonts.heading,
  },
  memoryDate: {
    fontSize: 11,
    color: '#888',
    marginTop: 4,
    fontFamily: PincTheme.fonts.body,
  },
  gridShareBtn: {
    padding: 8,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: PincTheme.colors.background,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: PincTheme.colors.border,
    shadowColor: PincTheme.colors.textPrimary,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  }
});
