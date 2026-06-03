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
  Dimensions
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
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
  subscribeToActiveChats
} from "../services/firebase";
import { t } from "../services/localization";
import * as ImagePicker from "expo-image-picker";
import { BusinessPackagesModal } from "./BusinessPackagesModal";
import { UserListModal } from "./UserListModal";
import { ChatModal } from "./ChatModal";
import { WatermarkShare } from "./WatermarkShare";
import { ChatInboxModal } from "./ChatInboxModal";

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
  onUpdateProfile
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
  const [isSaving, setIsSaving] = useState(false);
  const [showBusinessPackages, setShowBusinessPackages] = useState(false);
  const [isChatVisible, setIsChatVisible] = useState(false);
  const [sharePin, setSharePin] = useState<Pin | null>(null);
  
  // New States for Follower Lists and Chat
  const [userListType, setUserListType] = useState<"followers" | "following" | null>(null);
  const [isInboxVisible, setIsInboxVisible] = useState(false);
  const [unreadInboxCount, setUnreadInboxCount] = useState(0);
  const myShops = (venues || []).filter((v) => 
    v.ownerId === currentUserId && 
    (v.is_sponsored || (v.sponsor_tier && v.sponsor_tier >= 1))
  );

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

  const handleOpenEditModal = () => {
    if (!profile) return;
    setEditDisplayName(profile.username);
    setEditBio(profile.bio || "");
    setEditPreviewPic(null);
    setShowEditModal(true);
  };

  const handleSaveProfile = async () => {
    if (!userId || !profile) return;
    setIsSaving(true);
    try {
      const updates: Partial<UserProfile> = {
        username: editDisplayName.trim(),
        bio: editBio.trim()
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
              quality: 0.85
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
              quality: 0.85
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

  return (
    <Modal
      animationType="slide"
      transparent={true}
      visible={visible}
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <SafeAreaView style={styles.modalContent}>
          <View style={[styles.modalHeader, { justifyContent: 'space-between' }]}>
            <TouchableOpacity 
              onPress={() => setLocale && setLocale(locale === 'en' ? 'th' : 'en')} 
              style={[styles.closeButton, { backgroundColor: '#F0F0F0', borderRadius: 16, paddingHorizontal: 12, paddingVertical: 4 }]}
            >
              <Text style={[styles.closeButtonText, { fontSize: 14 }]}>{locale === 'en' ? 'TH' : 'EN'}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Text style={styles.closeButtonText}>✕</Text>
            </TouchableOpacity>
          </View>

          {isLoadingProfile ? (
            <View style={styles.loaderContainer}>
              <ActivityIndicator size="small" color={PincTheme.colors.primary} />
            </View>
          ) : !profile ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyTitle}>User Not Found</Text>
            </View>
          ) : (
            <FlatList
              data={pins}
              keyExtractor={(item, index) => item.pinId || index.toString()}
              numColumns={2}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: 20 }}
              ListHeaderComponent={
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
                              backgroundColor: "#F0F0F0", 
                              borderColor: "#E0E0E0",
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
                              borderColor: "#FFF"
                            }}>
                              <Text style={{ color: "#FFF", fontSize: 9, fontWeight: "bold" }}>{unreadInboxCount}</Text>
                            </View>
                          )}
                        </TouchableOpacity>
                      </View>

                      <TouchableOpacity
                        style={[styles.editProfileBtn, { backgroundColor: "#FFF0F4", borderColor: "#FF4B72", marginTop: 10, width: "100%", minWidth: 0 }]}
                        onPress={() => setShowBusinessPackages(true)}
                        activeOpacity={0.8}
                      >
                        <Text style={[styles.editProfileBtnText, { color: "#FF4B72" }]}>🏪 สำหรับร้านค้า</Text>
                      </TouchableOpacity>

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
                            <TouchableOpacity
                              key={shop.venueId}
                              style={{
                                flexDirection: "row",
                                alignItems: "center",
                                justifyContent: "space-between",
                                backgroundColor: "#FFF8F9",
                                borderWidth: 1,
                                borderColor: "#FFE0E6",
                                borderRadius: PincTheme.borderRadius.md,
                                paddingVertical: 10,
                                paddingHorizontal: 12,
                                marginBottom: 8,
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
                                  <Text style={{ fontSize: 13, fontWeight: "bold", color: PincTheme.colors.textPrimary, fontFamily: PincTheme.fonts.heading }} numberOfLines={1}>
                                    {shop.name}
                                  </Text>
                                  <Text style={{ fontSize: 10, color: PincTheme.colors.textTertiary, fontFamily: PincTheme.fonts.body }}>
                                    ★ {shop.aesthetic_rating.toFixed(1)} • {shop.category.toUpperCase()}
                                  </Text>
                                </View>
                              </View>
                              <Ionicons name="create-outline" size={18} color="#FF4B72" />
                            </TouchableOpacity>
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
                        style={[styles.followBtn, { marginTop: 0, minWidth: 100, backgroundColor: '#F0F0F0', borderWidth: 1, borderColor: '#E0E0E0' }]} 
                        onPress={() => setIsChatVisible(true)}
                      >
                        <Text style={[styles.followBtnText, { color: PincTheme.colors.textPrimary }]}>Message</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                  
                  <View style={styles.gridHeader}>
                    <Text style={styles.gridHeaderTitle}>
                      📸 {locale === "th" ? "พิกัดความทรงจำของคุณ" : "My Pinc. Memories"}
                    </Text>
                  </View>
                </View>
              }
              ListEmptyComponent={
                <View style={styles.emptyGridContainer}>
                  <Text style={styles.emptyGridText}>Start your first Reality Check!</Text>
                </View>
              }
              renderItem={({ item: pin }) => {
                const pinDate = pin.timestamp ? new Date(pin.timestamp).toLocaleString(locale === 'th' ? 'th-TH' : 'en-GB', {
                  day: 'numeric', month: 'short', year: 'numeric',
                  hour: '2-digit', minute: '2-digit'
                }) : '';
                return (
                  <TouchableOpacity 
                    style={styles.memoryCard} 
                    activeOpacity={0.85}
                    onPress={() => onSelectMemory && onSelectMemory(pin)}
                    onLongPress={() => {
                      if (userId === currentUserId) {
                        Alert.alert(
                          locale === "th" ? "ลบโพสต์" : "Delete Post",
                          locale === "th" ? "คุณแน่ใจหรือไม่ว่าต้องการลบโพสต์นี้?" : "Are you sure you want to delete this post?",
                          [
                            { text: locale === "th" ? "ยกเลิก" : "Cancel", style: "cancel" },
                            { 
                              text: locale === "th" ? "ลบ" : "Delete", 
                              style: "destructive",
                              onPress: () => {
                                if (onDeletePin) onDeletePin(pin);
                                setPins(prev => prev.filter(p => p.pinId !== pin.pinId));
                              }
                            }
                          ]
                        );
                      }
                    }}
                  >
                    <Image 
                      source={{ uri: pin.thumbnail_url || pin.image_url }} 
                      style={styles.memoryThumbnail} 
                      resizeMode="cover" 
                    />
                    <View style={styles.memoryInfo}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.memoryVenue} numberOfLines={1}>
                          {(pin.username || "Memory") || "Unknown Location"}
                        </Text>
                        <Text style={styles.memoryDate}>{pinDate}</Text>
                      </View>
                      <TouchableOpacity
                        style={styles.gridShareBtn}
                        onPress={() => setSharePin(pin)}
                        activeOpacity={0.8}
                      >
                        <Ionicons name="paper-plane-outline" size={20} color={PincTheme.colors.primary} />
                      </TouchableOpacity>
                    </View>
                  </TouchableOpacity>
                );
              }}
            />
          )}
        </SafeAreaView>
      </View>

      {/* ── Edit Profile Modal ── */}
      <Modal
        visible={showEditModal}
        animationType="slide"
        transparent
        onRequestClose={() => setShowEditModal(false)}
      >
        <View style={styles.editModalOverlay}>
          <View style={styles.editModalSheet}>
            {/* Handle bar */}
            <View style={styles.editModalHandle} />

            <Text style={styles.editModalTitle}>Edit Profile</Text>

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
            <Text style={styles.editFieldLabel}>Display Name</Text>
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
            <Text style={styles.editFieldLabel}>Bio</Text>
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

            {/* Actions */}
            <View style={styles.editModalActions}>
              <TouchableOpacity
                style={styles.editCancelBtn}
                onPress={() => setShowEditModal(false)}
                disabled={isSaving}
              >
                <Text style={styles.editCancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.editSaveBtn, isSaving && { opacity: 0.6 }]}
                onPress={handleSaveProfile}
                disabled={isSaving}
              >
                {isSaving
                  ? <ActivityIndicator size="small" color="#FFF" />
                  : <Text style={styles.editSaveBtnText}>Save Changes</Text>
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
    </Modal>
  );
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
    backgroundColor: "#FFFFFF",
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
    backgroundColor: "#FFFFFF",
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
    borderColor: "#FFFFFF",
    backgroundColor: PincTheme.colors.border,
    shadowColor: "#000000",
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
    borderColor: "#FFF",
    shadowColor: "#000",
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
    backgroundColor: "#FFFFFF",
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
    marginBottom: 24,
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
    marginBottom: 8,
    marginTop: 4
  },
  editFieldInput: {
    backgroundColor: PincTheme.colors.background,
    borderWidth: 1.5,
    borderColor: PincTheme.colors.border,
    borderRadius: PincTheme.borderRadius.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    fontFamily: PincTheme.fonts.body,
    color: PincTheme.colors.textPrimary,
    marginBottom: 16
  },
  editFieldInputMulti: {
    height: 80,
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
    backgroundColor: '#FFF',
    overflow: 'hidden',
    elevation: 3,
    shadowColor: '#000',
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
    color: '#333',
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
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  }
});
