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
import { PincTheme } from "../styles/theme";
import {
  UserProfile,
  Pin,
  fetchUserProfile,
  subscribeToUserPins,
  toggleFollow,
  checkIsFollowing,
  getUserStats,
  updateUserProfile,
  uploadProfileImage
} from "../services/firebase";
import { t } from "../services/localization";
import * as ImagePicker from "expo-image-picker";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

interface UserProfileModalProps {
  visible: boolean;
  userId: string | null;
  currentUserId: string;
  onClose: () => void;
  locale?: "en" | "th";
}

export const UserProfileModal: React.FC<UserProfileModalProps> = ({
  visible,
  userId,
  currentUserId,
  onClose,
  locale = "en"
}) => {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [pins, setPins] = useState<Pin[]>([]);
  const [isLoadingProfile, setIsLoadingProfile] = useState(false);
  const [isFollowing, setIsFollowing] = useState(false);
  const [isFollowedBy, setIsFollowedBy] = useState(false);
  const [isTogglingFollow, setIsTogglingFollow] = useState(false);
  
  // New States
  const [stats, setStats] = useState({ followersCount: 0, followingCount: 0 });
  const [isEditing, setIsEditing] = useState(false);
  const [editUsername, setEditUsername] = useState("");
  const [editBio, setEditBio] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!visible || !userId) {
      setProfile(null);
      setPins([]);
      setIsFollowing(false);
      setIsFollowedBy(false);
      setIsEditing(false);
      return;
    }

    const loadData = async () => {
      setIsLoadingProfile(true);
      try {
        const userProfile = await fetchUserProfile(userId);
        setProfile(userProfile);

        if (userProfile && userId !== currentUserId) {
          const followStatus = await checkIsFollowing(currentUserId, userId);
          setIsFollowing(followStatus);

          const followedByStatus = await checkIsFollowing(userId, currentUserId);
          setIsFollowedBy(followedByStatus);
        }

        if (userProfile) {
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

  const handleSaveProfile = async () => {
    if (!userId || !profile) return;
    setIsSaving(true);
    try {
      await updateUserProfile(userId, {
        username: editUsername,
        bio: editBio
      });
      setProfile(prev => prev ? { ...prev, username: editUsername, bio: editBio } : null);
      setIsEditing(false);
    } catch (err) {
      Alert.alert("Error", "Failed to save profile.");
    } finally {
      setIsSaving(false);
    }
  };

  const handlePickImage = async () => {
    if (!isEditing || !userId) return;
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Denied', 'Sorry, we need camera roll permissions to make this work!');
      return;
    }

    let result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (!result.canceled && result.assets && result.assets.length > 0) {
      setIsSaving(true);
      try {
        const newUrl = await uploadProfileImage(result.assets[0].uri, userId);
        await updateUserProfile(userId, { profile_pic: newUrl });
        setProfile(prev => prev ? { ...prev, profile_pic: newUrl } : null);
      } catch (err) {
        Alert.alert("Error", "Failed to update profile picture.");
      } finally {
        setIsSaving(false);
      }
    }
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
          <View style={styles.modalHeader}>
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
              numColumns={3}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: 20 }}
              ListHeaderComponent={
                <View style={styles.profileHeaderContainer}>
                  <TouchableOpacity 
                    style={styles.avatarContainer}
                    onPress={handlePickImage}
                    disabled={!isEditing}
                    activeOpacity={0.8}
                  >
                    <Image source={{ uri: profile.profile_pic }} style={styles.avatarLarge} />
                    {isEditing && (
                      <View style={styles.avatarEditOverlay}>
                        <Text style={styles.avatarEditText}>📸</Text>
                      </View>
                    )}
                  </TouchableOpacity>

                  {isEditing ? (
                    <View style={styles.editForm}>
                      <TextInput 
                        style={styles.editInput} 
                        value={editUsername} 
                        onChangeText={setEditUsername} 
                        placeholder="Username" 
                        placeholderTextColor={PincTheme.colors.textTertiary}
                      />
                      <TextInput 
                        style={[styles.editInput, { height: 60, textAlignVertical: 'top' }]} 
                        value={editBio} 
                        onChangeText={setEditBio} 
                        placeholder="Bio" 
                        multiline 
                        placeholderTextColor={PincTheme.colors.textTertiary}
                      />
                      <View style={styles.editActions}>
                        <TouchableOpacity style={styles.cancelBtn} onPress={() => setIsEditing(false)}>
                          <Text style={styles.cancelBtnText}>Cancel</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.saveBtn} onPress={handleSaveProfile} disabled={isSaving}>
                          {isSaving ? <ActivityIndicator size="small" color="#FFF" /> : <Text style={styles.saveBtnText}>Save</Text>}
                        </TouchableOpacity>
                      </View>
                    </View>
                  ) : (
                    <>
                      <Text style={styles.username}>@{profile.username}</Text>
                      <Text style={styles.bio}>{profile.bio}</Text>

                      <View style={styles.statsRow}>
                        <View style={styles.statItem}>
                          <Text style={styles.statNumber}>{pins.length}</Text>
                          <Text style={styles.statLabel}>Posts</Text>
                        </View>
                        <View style={styles.statItem}>
                          <Text style={styles.statNumber}>{stats.followersCount}</Text>
                          <Text style={styles.statLabel}>Followers</Text>
                        </View>
                        <View style={styles.statItem}>
                          <Text style={styles.statNumber}>{stats.followingCount}</Text>
                          <Text style={styles.statLabel}>Following</Text>
                        </View>
                      </View>

                      {userId === currentUserId ? (
                        <TouchableOpacity 
                          style={styles.editProfileBtn} 
                          onPress={() => {
                            setEditUsername(profile.username);
                            setEditBio(profile.bio);
                            setIsEditing(true);
                          }}
                        >
                          <Text style={styles.editProfileBtnText}>Edit Profile</Text>
                        </TouchableOpacity>
                      ) : (
                        <TouchableOpacity
                          style={[
                            styles.followBtn,
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
                      )}
                    </>
                  )}
                  
                  <View style={styles.gridHeader}>
                    <Text style={styles.gridHeaderTitle}>
                      📸 {locale === "th" ? "พิกัด Reality Check" : "Reality Checks"}
                    </Text>
                  </View>
                </View>
              }
              ListEmptyComponent={
                <View style={styles.emptyGridContainer}>
                  <Text style={styles.emptyGridText}>Start your first Reality Check!</Text>
                </View>
              }
              renderItem={({ item: pin }) => (
                <View style={styles.gridItem}>
                  {pin.image_url ? (
                    <Image source={{ uri: pin.image_url }} style={styles.gridImage} resizeMode="cover" />
                  ) : (
                    <View style={styles.gridImagePlaceholder}>
                      <Text style={{ fontSize: 24 }}>☕</Text>
                    </View>
                  )}
                </View>
              )}
            />
          )}
        </SafeAreaView>
      </View>
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
    marginBottom: 12
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
  avatarEditOverlay: {
    position: "absolute",
    bottom: 0,
    right: 0,
    backgroundColor: PincTheme.colors.primary,
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#FFF"
  },
  avatarEditText: {
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
  editProfileBtn: {
    backgroundColor: PincTheme.colors.background,
    borderWidth: 1,
    borderColor: PincTheme.colors.border,
    paddingHorizontal: 32,
    paddingVertical: 8,
    borderRadius: PincTheme.borderRadius.md,
    marginTop: 16,
    ...PincTheme.shadows.sm,
    minWidth: 140,
    alignItems: "center"
  },
  editProfileBtnText: {
    color: PincTheme.colors.textPrimary,
    fontFamily: PincTheme.fonts.heading,
    fontWeight: "700",
    fontSize: 12
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
  gridItem: {
    width: SCREEN_WIDTH / 3,
    height: SCREEN_WIDTH / 3,
    padding: 1
  },
  gridImage: {
    width: "100%",
    height: "100%",
    backgroundColor: PincTheme.colors.border
  },
  gridImagePlaceholder: {
    width: "100%",
    height: "100%",
    backgroundColor: PincTheme.colors.border,
    alignItems: "center",
    justifyContent: "center"
  }
});
