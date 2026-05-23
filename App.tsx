import React, { useState, useEffect } from "react";
import { 
  StyleSheet, 
  View, 
  StatusBar, 
  ActivityIndicator, 
  Text,
  Modal,
  Switch,
  TouchableOpacity,
  Alert,
  SafeAreaView,
  ScrollView,
  BackHandler,
  Platform
} from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { MapScreen } from "./screens/MapScreen";
import { VenueDetailsSheet } from "./components/VenueDetailsSheet";
import { UserProfileModal } from "./components/UserProfileModal";
import { PincButton } from "./components/PincButton";
import { LoginScreen } from "./screens/LoginScreen";
import { PincTheme } from "./styles/theme";
import { ReelsFeedModal } from "./components/ReelsFeedModal";
import { CachedVideo } from "./components/CachedVideo";


const getSafeVideoUrl = (url: string | null | undefined) => {
  if (!url) return undefined;
  if (url.toLowerCase().includes('.mp4') || url.toLowerCase().includes('.mov')) return url;
  return `${url}#.mp4`;
};

import { 
  Venue, 
  Pin, 
  UserProfile,
  auth,
  db,
  fetchUserProfile,
  subscribeToVenues, 
  subscribeToVenuePins,
  subscribeToAllPins,
  seedInitialVenues,
  signOutUser,
  deleteUserAccount,
  withTimeout,
  subscribeToFollowingIds,
  getFollowingList,
  unfollowUser
} from "./services/firebase";
import { doc, setDoc, query, collection, where, onSnapshot, deleteDoc } from "firebase/firestore";
import './i18n';
import { useTranslation } from 'react-i18next';

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

export default function App() {
  const { t, i18n } = useTranslation();
  // Session States
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [isAuthChecking, setIsAuthChecking] = useState(true);

  // Active Navigation & Shelf States
  const [activeTab, setActiveTab] = useState<"home" | "photo" | "video" | "search" | "profile">("home");
  const [photoShelfVisible, setPhotoShelfVisible] = useState(false);
  const [cameraTarget, setCameraTarget] = useState<{ latitude: number; longitude: number; timestamp: number } | null>(null);
  const [focusSearchTrigger, setFocusSearchTrigger] = useState(0);
  const [appReelsPins, setAppReelsPins] = useState<Pin[]>([]);
  const [deleteModePinId, setDeleteModePinId] = useState<string | null>(null);
  const [expandedPin, setExpandedPin] = useState<string | null>(null);
  const [activeVideoId, setActiveVideoId] = useState<string | null>(null);

  // Settings & GDPR States
  const [locale, setLocale] = useState<"en" | "th">("en");
  const [locationTrackingEnabled, setLocationTrackingEnabled] = useState(true);
  const [settingsModalVisible, setSettingsModalVisible] = useState(false);

  // Social Follow & Filter States
  const [followingIds, setFollowingIds] = useState<string[]>([]);
  const [followingList, setFollowingList] = useState<UserProfile[]>([]);
  const [followingVenueIds, setFollowingVenueIds] = useState<Set<string>>(new Set());
  const [selectedUserProfileId, setSelectedUserProfileId] = useState<string | null>(null);

  // Map & DB States
  const [venues, setVenues] = useState<Venue[]>([]);
  const [selectedVenue, setSelectedVenue] = useState<Venue | null>(null);
  const [activePins, setActivePins] = useState<Pin[]>([]);
  const [allPins, setAllPins] = useState<Pin[]>([]);
  
  const [isLoadingVenues, setIsLoadingVenues] = useState(true);
  const [isLoadingPins, setIsLoadingPins] = useState(false);
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);

  // Thumbnail click handler to pan map and close details
  const handleSelectShelfPin = (pin: Pin) => {
    setCameraTarget({
      latitude: pin.latitude,
      longitude: pin.longitude,
      timestamp: Date.now()
    });

    // Just zoom into the location, disable selecting the venue
    setSelectedVenue(null);
  };

  const handleDeletePin = (pin: Pin) => {
    Alert.alert(
      locale === "th" ? "ลบโพสต์" : "Delete Upload",
      locale === "th" ? "คุณแน่ใจหรือไม่ว่าต้องการลบภาพ/วิดีโอนี้?" : "Are you sure you want to delete this photo/video?",
      [
        { text: locale === "th" ? "ยกเลิก" : "Cancel", style: "cancel", onPress: () => setDeleteModePinId(null) },
        { 
          text: locale === "th" ? "ลบ" : "Delete", 
          style: "destructive",
          onPress: async () => {
            try {
               if (pin.pinId) {
                 await deleteDoc(doc(db, "pins", pin.pinId));
                 setDeleteModePinId(null);
               }
            } catch (err) {
               Alert.alert(locale === "th" ? "เกิดข้อผิดพลาด" : "Error", locale === "th" ? "ไม่สามารถลบโพสต์ได้" : "Could not delete pin.");
            }
          }
        }
      ]
    );
  };

  const handleHomeTabPress = () => {
    setActiveTab("home");
    setPhotoShelfVisible(false);
    setSelectedVenue(null);
    if (userLocation) {
      setCameraTarget({
        latitude: userLocation.latitude,
        longitude: userLocation.longitude,
        timestamp: Date.now()
      });
    }
  };

  const handlePhotoTabPress = () => {
    if (activeTab === "photo") {
      setPhotoShelfVisible(prev => !prev);
    } else {
      setActiveTab("photo");
      setPhotoShelfVisible(true);
    }
  };

  const handleVideoTabPress = () => {
    setActiveTab("video");
    const videoPins = allPins.filter(pin => isActuallyVideo(pin));
    if (videoPins.length > 0) {
      setAppReelsPins(videoPins);
    } else {
      Alert.alert(
        locale === "th" ? "ไม่มีวิดีโอ" : "No Videos Available",
        locale === "th" ? "ยังไม่มีการอัปโหลดไฟล์วิดีโอในขณะนี้" : "There are no uploaded videos at the moment."
      );
      setActiveTab("home");
    }
  };

  const handleSearchTabPress = () => {
    setActiveTab("search");
    setFocusSearchTrigger(prev => prev + 1);
  };

  const handleProfileTabPress = () => {
    setActiveTab("profile");
    setSettingsModalVisible(true);
  };

  // Filter current user's uploaded pins, newest first
  const currentUserPins = allPins
    .filter(pin => pin.userId === currentUser?.userId)
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  // 1. Check Auth Status & Auto-Seed Database on mount
  useEffect(() => {
    // A: Database is ready. Removed auto-seed logic as per user request.
    const prepareApp = async () => {
      // (Reserved for future initialization if needed)
    };
    prepareApp();

    // B: Listen to Firebase Auth state changes
    const unsubscribeAuth = auth.onAuthStateChanged(async (user) => {
      setIsAuthChecking(true);
      if (user) {
        try {
          let profile: UserProfile | null = null;
          try {
            profile = await fetchUserProfile(user.uid);
          } catch (fetchErr) {
            console.warn("Failed to fetch Firestore user profile, proceeding to resilient fallback.", fetchErr);
            profile = null;
          }
          
          if (!profile) {
            // RESILIENT FALLBACK: If Auth exists but Firestore user document is missing
            const fallbackUsername = user.email ? user.email.split("@")[0].toLowerCase().trim() : "cafe_hopper";
            const fallbackProfile: UserProfile = {
              userId: user.uid,
              username: fallbackUsername,
              bio: "Cafe hopper & travel enthusiast ☕✨",
              profile_pic: "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&q=80",
              created_at: new Date()
            };
            
            try {
              // Try to write to Firestore
              await withTimeout(
                setDoc(doc(db, "users", user.uid), {
                  userId: user.uid,
                  username: fallbackUsername,
                  bio: fallbackProfile.bio,
                  profile_pic: fallbackProfile.profile_pic,
                  created_at: new Date()
                }),
                3000,
                "Firestore database write timed out during fallback profile generation."
              );
              profile = fallbackProfile;
            } catch (dbErr: any) {
              console.warn("Firestore database write failed. Check if Firestore is enabled in Firebase Console.", dbErr);
              
              // If it fails because Firestore is not created in the Firebase console, alert the user!
              Alert.alert(
                "Database Setup Required",
                "Your account is registered in Firebase Auth, but Firestore Database has not been initialized yet.\n\n" +
                "Please go to your Firebase Console -> Firestore Database and click 'Create database' to enable it.",
                [{ text: "OK" }]
              );
              
              // We still set a temporary memory profile so they don't get stuck on a blank screen
              profile = fallbackProfile;
            }
          }
          
          setCurrentUser(profile);
        } catch (err: any) {
          console.error("Failed to load user profile.", err);
          Alert.alert("Database Error", "Failed to load database. Ensure Firestore is created in your Firebase Console.");
        }
      } else {
        setCurrentUser(null);
      }
      setIsAuthChecking(false);
    });

    return () => unsubscribeAuth();
  }, []);

  // 2. Fetch User GPS Location
  useEffect(() => {
    // Bangkok Thonglor area location (Café district) as default starting position
    setUserLocation({
      latitude: 13.736717,
      longitude: 100.560481
    });
  }, []);

  // 3. Subscribe to Venues list real-time (Only when logged in!)
  useEffect(() => {
    if (!currentUser) return;

    setIsLoadingVenues(true);
    const unsubscribe = subscribeToVenues(
      (updatedVenues) => {
        setVenues(updatedVenues);
        setIsLoadingVenues(false);
      },
      (error) => {
        setIsLoadingVenues(false);
      }
    );

    return () => unsubscribe();
  }, [currentUser]);

  // 4. Subscribe to Venue Pins when a venue marker is tapped
  useEffect(() => {
    if (!selectedVenue) {
      setActivePins([]);
      return;
    }

    setIsLoadingPins(true);
    const unsubscribe = subscribeToVenuePins(
      selectedVenue.venueId,
      (updatedPins) => {
        setActivePins(updatedPins);
        setIsLoadingPins(false);
      },
      (error) => {
        setIsLoadingPins(false);
      }
    );

    return () => unsubscribe();
  }, [selectedVenue]);

  // Handle Android Hardware Back Button to dismiss modals instead of exiting app
  useEffect(() => {
    const backAction = () => {
      if (selectedUserProfileId) {
        setSelectedUserProfileId(null);
        return true; // Prevent default behavior
      }
      if (selectedVenue) {
        setSelectedVenue(null);
        return true;
      }
      if (settingsModalVisible) {
        setSettingsModalVisible(false);
        return true;
      }
      return false; // Allow default behavior (exit app)
    };

    const backHandler = BackHandler.addEventListener(
      "hardwareBackPress",
      backAction
    );

    return () => backHandler.remove();
  }, [selectedUserProfileId, selectedVenue, settingsModalVisible]);

  // 5. Subscribe to real-time Following user IDs
  useEffect(() => {
    if (!currentUser) {
      setFollowingIds([]);
      setFollowingList([]);
      return;
    }

    const unsubscribe = subscribeToFollowingIds(
      currentUser.userId,
      (ids) => {
        setFollowingIds(ids);
      },
      (error) => {
        console.warn("Real-time follow subscription failed:", error);
      }
    );

    return () => unsubscribe();
  }, [currentUser]);

  // 6. Load full following list profiles when followingIds change
  useEffect(() => {
    if (!currentUser || followingIds.length === 0) {
      setFollowingList([]);
      return;
    }

    const fetchProfiles = async () => {
      try {
        const profiles = await getFollowingList(currentUser.userId);
        setFollowingList(profiles);
      } catch (err) {
        console.warn("Failed to fetch full following profiles:", err);
      }
    };
    fetchProfiles();
  }, [currentUser, followingIds]);

  // 7. Subscribe to all pins of followed users to identify follow-related venues
  useEffect(() => {
    if (!currentUser || followingIds.length === 0) {
      setFollowingVenueIds(new Set());
      return;
    }

    // Comply with Firestore "in" array capped at 30 items
    const targetIds = followingIds.slice(0, 30);

    // Query pins posted by followed users
    const q = query(
      collection(db, "pins"),
      where("userId", "in", targetIds)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const venueIds = new Set<string>();
      snapshot.forEach((doc) => {
        const data = doc.data();
        if (data.venueId) {
          venueIds.add(data.venueId);
        }
      });
      setFollowingVenueIds(venueIds);
    }, (error) => {
      console.warn("Realtime pins from following users fetch failed:", error);
    });

    return () => unsubscribe();
  }, [currentUser, followingIds]);

  // 8. Subscribe to all pins in real-time to extract latest reality photo thumbnails
  useEffect(() => {
    if (!currentUser) {
      setAllPins([]);
      return;
    }

    const unsubscribe = subscribeToAllPins(
      (pins) => {
        setAllPins(pins);
      },
      (error) => {
        console.warn("Real-time pins subscription failed:", error);
      }
    );

    return () => unsubscribe();
  }, [currentUser]);

  const handleUnfollowUser = async (userId: string) => {
    if (!currentUser) return;
    try {
      await unfollowUser(currentUser.userId, userId);
      // Immediately filter local state for instant feedback
      setFollowingIds(prev => prev.filter(id => id !== userId));
      setFollowingList(prev => prev.filter(p => p.userId !== userId));
    } catch (err) {
      console.warn("Failed to unfollow user from settings list:", err);
    }
  };

  const handleSelectVenue = (venue: Venue) => {
    setSelectedVenue(venue);
  };

  const handleCloseBottomSheet = () => {
    setSelectedVenue(null);
  };

  const handlePinCreated = () => {
    if (selectedVenue) {
      // Force refresh pins trigger
      setSelectedVenue({ ...selectedVenue });
    }
  };

  const handleAuthSuccess = (profile: UserProfile) => {
    setCurrentUser(profile);
  };

  const handleSignOut = async () => {
    try {
      await signOutUser();
      setCurrentUser(null);
      setSettingsModalVisible(false);
    } catch (err: any) {
      Alert.alert("Sign Out Failed", err.message || "Something went wrong.");
    }
  };

  const handleDeleteAccount = async () => {
    if (!currentUser) return;
    
    Alert.alert(
      t("deleteAccountConfirmTitle"),
      t("deleteAccountConfirmMsg"),
      [
        { text: t("cancel"), style: "cancel" },
        {
          text: t("delete"),
          style: "destructive",
          onPress: async () => {
            try {
              await deleteUserAccount(currentUser.userId);
              setCurrentUser(null);
              setSettingsModalVisible(false);
              Alert.alert("Success", t("accountDeleted"));
            } catch (err: any) {
              console.error(err);
              Alert.alert("Deletion Failed", err.message || "Failed to permanently erase profile.");
            }
          }
        }
      ]
    );
  };
  // Auth Loading Overlay Screen (Mimics Native Splash Screen for seamless transition)
  if (isAuthChecking) {
    return (
      <View style={[styles.loaderContainer, { backgroundColor: PincTheme.colors.background }]}>
        <Text style={{ fontSize: 40, fontWeight: "900", color: PincTheme.colors.primary, marginBottom: 20 }}>pinc.</Text>
        <ActivityIndicator size="large" color={PincTheme.colors.primary} />
      </View>
    );
  }
  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={PincTheme.colors.background} />

      {!currentUser ? (
        /* If NOT logged in, show Sleek Sand Login Screen */
        <LoginScreen onAuthSuccess={handleAuthSuccess} />
      ) : (
        /* If logged in, show Main Map Dashboard */
        <>
          {/* Main Fullscreen Styled Map */}
          <MapScreen
            venues={venues}
            allPins={allPins}
            userLocation={userLocation}
            isLoadingVenues={isLoadingVenues}
            onSelectVenue={handleSelectVenue}
            onOpenSettings={() => setSettingsModalVisible(true)}
            followingVenueIds={followingVenueIds}
            locale={locale}
            cameraTarget={cameraTarget}
            focusSearchTrigger={focusSearchTrigger}
          />

          {/* Floating Action Button "The Pinc Button" */}
          <PincButton
            venues={venues}
            userLocation={userLocation}
            onPinCreated={handlePinCreated}
            currentUser={currentUser}
            locationTrackingEnabled={locationTrackingEnabled}
          />

          {/* Reality Check Sliding Sheet */}
          {selectedVenue && (
            <View style={styles.sheetOverlay}>
              <VenueDetailsSheet
                venue={selectedVenue}
                pins={activePins}
                isLoadingPins={isLoadingPins}
                onClose={handleCloseBottomSheet}
                locale={locale}
                followingIds={followingIds}
                onOpenUserProfile={(userId) => {
                  setSelectedUserProfileId(userId);
                }}
                currentUser={currentUser}
              />
            </View>
          )}

          {/* User Profile Modal */}
          <UserProfileModal
            visible={selectedUserProfileId !== null}
            userId={selectedUserProfileId}
            currentUserId={currentUser.userId}
            onClose={() => setSelectedUserProfileId(null)}
            locale={locale}
          />

          {/* Reality Check Sliding Shelf (User Pins Photo Drawer) */}
          {photoShelfVisible && (
            <View style={[styles.photoShelfContainer, { bottom: Platform.OS === 'ios' ? 110 : 132 }]}>
              <View style={styles.shelfHeader}>
                <Text style={styles.shelfTitle}>
                  {locale === "th" ? "ภาพและวิดีโอของคุณ" : "Your Uploads"} ({currentUserPins.length})
                </Text>
                <TouchableOpacity onPress={() => setPhotoShelfVisible(false)} style={styles.shelfCloseBtn}>
                  <Text style={styles.shelfCloseText}>✕</Text>
                </TouchableOpacity>
              </View>
              {currentUserPins.length === 0 ? (
                <View style={styles.shelfEmpty}>
                  <Text style={styles.shelfEmptyText}>
                    {locale === "th" ? "ยังไม่มีภาพหรือวิดีโอที่คุณถ่ายไว้" : "No posted media yet."}
                  </Text>
                </View>
              ) : (
                <ScrollView 
                  horizontal 
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.shelfScrollContent}
                >
                  {currentUserPins.map((pin) => {
                    const isVideo = isActuallyVideo(pin);
                    return (
                      <TouchableOpacity 
                        key={pin.pinId || pin.timestamp.toString()} 
                        style={styles.shelfItem}
                        onPress={() => {
                          if (deleteModePinId) {
                            setDeleteModePinId(null);
                          } else {
                            handleSelectShelfPin(pin);
                          }
                        }}
                        onLongPress={() => setDeleteModePinId(pin.pinId || null)}
                        activeOpacity={0.8}
                      >
                        {isVideo ? (
                          activeVideoId === pin.pinId ? (
                            <CachedVideo 
                              source={{ uri: pin.image_url }} 
                              style={styles.shelfImage} 
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
                              <Image source={{ uri: getSafeVideoUrl(pin.image_url) }} style={styles.shelfImage} contentFit="cover" />
                              <View style={[StyleSheet.absoluteFill, { justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.3)' }]}>
                                <Ionicons name="play" size={24} color="#FFFFFF" />
                              </View>
                            </TouchableOpacity>
                          )
                        ) : (
                          <Image source={{ uri: pin.image_url }} style={styles.shelfImage} contentFit="cover" />
                        )}
                        {isVideo && (
                          <View style={styles.videoOverlayBadge}>
                            <Ionicons name="play" size={14} color="#FFFFFF" />
                          </View>
                        )}
                        {deleteModePinId === pin.pinId && (
                          <TouchableOpacity 
                            style={styles.deleteBadgeBtn} 
                            onPress={() => handleDeletePin(pin)}
                          >
                            <Ionicons name="remove-circle" size={24} color="#FF3B30" />
                          </TouchableOpacity>
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              )}
            </View>
          )}

          {/* Premium Instagram-Style User Bottom Toolbar */}
          <View style={[styles.bottomTabBar, { bottom: Platform.OS === 'ios' ? 16 : 24 }]}>
            {/* Tab 1: Home */}
            <TouchableOpacity 
              style={styles.tabBtn} 
              onPress={handleHomeTabPress}
              activeOpacity={0.7}
            >
              <Ionicons name={activeTab === "home" ? "home" : "home-outline"} size={26} color={activeTab === "home" ? "#E4007F" : "#A0A0A0"} />
            </TouchableOpacity>

            {/* Tab 2: Photo/Video Shelf */}
            <TouchableOpacity 
              style={styles.tabBtn} 
              onPress={handlePhotoTabPress}
              activeOpacity={0.7}
            >
              <Ionicons name={activeTab === "photo" ? "images" : "images-outline"} size={26} color={activeTab === "photo" ? "#E4007F" : "#A0A0A0"} />
            </TouchableOpacity>

            {/* Tab 3: Video (Reels) */}
            <TouchableOpacity 
              style={styles.tabBtn} 
              onPress={handleVideoTabPress}
              activeOpacity={0.7}
            >
              <Ionicons name={activeTab === "video" ? "film" : "film-outline"} size={26} color={activeTab === "video" ? "#E4007F" : "#A0A0A0"} />
            </TouchableOpacity>

            {/* Tab 4: Search/Magnifier */}
            <TouchableOpacity 
              style={styles.tabBtn} 
              onPress={handleSearchTabPress}
              activeOpacity={0.7}
            >
              <Ionicons name={activeTab === "search" ? "search" : "search-outline"} size={26} color={activeTab === "search" ? "#E4007F" : "#A0A0A0"} />
            </TouchableOpacity>

            {/* Tab 5: Profile (IG-Style Avatar) */}
            <TouchableOpacity 
              style={styles.tabBtn} 
              onPress={handleProfileTabPress}
              activeOpacity={0.7}
            >
              <View style={[
                styles.tabProfileWrapper, 
                activeTab === "profile" && { borderColor: "#E4007F" }
              ]}>
                <Image 
                  source={{ uri: currentUser.profile_pic }} 
                  style={styles.tabProfileImg} 
                />
              </View>
            </TouchableOpacity>
          </View>

          {/* Full Screen Reels Feed Modal from Tab 3 */}
          <ReelsFeedModal 
            visible={appReelsPins.length > 0}
            pins={appReelsPins}
            onClose={() => {
              setAppReelsPins([]);
              setActiveTab("home");
            }}
            currentUserId={currentUser.userId}
          />

          {/* GDPR & Settings Modal */}
          <Modal
            animationType="slide"
            transparent={true}
            visible={settingsModalVisible}
            onRequestClose={() => { setSettingsModalVisible(false); setActiveTab("home"); }}
          >
            <View style={styles.modalOverlay}>
              <SafeAreaView style={styles.modalContent}>
                {/* Modal Header */}
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>{t("settingsTitle")}</Text>
                  <TouchableOpacity 
                    onPress={() => { setSettingsModalVisible(false); setActiveTab("home"); }} 
                    style={styles.closeButton}
                  >
                    <Text style={styles.closeButtonText}>✕</Text>
                  </TouchableOpacity>
                </View>

                <ScrollView 
                  style={styles.modalScrollView} 
                  contentContainerStyle={styles.modalScrollContent}
                  showsVerticalScrollIndicator={false}
                >
                  {/* Current User Profile Summary */}
                  <View style={styles.profileHeaderSection}>
                    <Image source={{ uri: currentUser.profile_pic }} style={styles.profileAvatar} />
                    <View style={styles.profileMeta}>
                      <Text style={styles.profileUsername}>@{currentUser.username}</Text>
                      <Text style={styles.profileBio}>{currentUser.bio}</Text>
                      
                      <TouchableOpacity 
                        style={styles.editProfileBtnApp} 
                        onPress={() => {
                          setSettingsModalVisible(false);
                          setSelectedUserProfileId(currentUser.userId);
                          setActiveTab("home");
                        }}
                      >
                        <Text style={styles.editProfileBtnAppText}>✏️ {t("editProfile")}</Text>
                      </TouchableOpacity>
                    </View>
                  </View>

                  {/* Social Following List */}
                  <View style={styles.settingSection}>
                    <Text style={styles.settingHeading}>{t("followingListTitle")} ({followingList.length})</Text>
                    {followingList.length === 0 ? (
                      <Text style={styles.noFollowingText}>{t("followingNoUsers")}</Text>
                    ) : (
                      <View style={styles.followingList}>
                        {followingList.map((friend) => (
                          <View key={friend.userId} style={styles.friendRow}>
                            <TouchableOpacity 
                              style={{ flexDirection: "row", alignItems: "center", flex: 1 }}
                              onPress={() => {
                                setSettingsModalVisible(false);
                                setSelectedUserProfileId(friend.userId);
                              }}
                              activeOpacity={0.7}
                            >
                              <Image source={{ uri: friend.profile_pic }} style={styles.friendAvatar} />
                              <Text style={styles.friendUsername}>@{friend.username}</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={styles.unfollowBtn}
                              onPress={() => handleUnfollowUser(friend.userId)}
                            >
                              <Text style={styles.unfollowBtnText}>{t("unfollow")}</Text>
                            </TouchableOpacity>
                          </View>
                        ))}
                      </View>
                    )}
                  </View>

                  {/* Language Section */}
                  <View style={styles.settingSection}>
                    <Text style={styles.settingHeading}>{t("languageLabel")}</Text>
                    <View style={styles.languageOptions}>
                      <TouchableOpacity
                        style={[styles.langBtn, locale === "en" && styles.langBtnActive]}
                        onPress={() => { setLocale("en"); i18n.changeLanguage("en"); }}
                      >
                        <Text style={[styles.langText, locale === "en" && styles.langTextActive]}>English</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.langBtn, locale === "th" && styles.langBtnActive]}
                        onPress={() => { setLocale("th"); i18n.changeLanguage("th"); }}
                      >
                        <Text style={[styles.langText, locale === "th" && styles.langTextActive]}>ภาษาไทย</Text>
                      </TouchableOpacity>
                    </View>
                  </View>

                  {/* Location Privacy Toggle */}
                  <View style={styles.settingSection}>
                    <View style={styles.settingRow}>
                      <View style={styles.settingTextContainer}>
                        <Text style={styles.settingLabel}>{t("locationTrackingLabel")}</Text>
                        <Text style={styles.settingDesc}>{t("locationTrackingDesc")}</Text>
                      </View>
                      <Switch
                        value={locationTrackingEnabled}
                        onValueChange={setLocationTrackingEnabled}
                        trackColor={{ false: PincTheme.colors.divider, true: PincTheme.colors.primary }}
                        thumbColor={locationTrackingEnabled ? "#FFF" : PincTheme.colors.textTertiary}
                      />
                    </View>
                  </View>

                  {/* Danger Zone */}
                  <View style={[styles.settingSection, { borderBottomWidth: 0, marginTop: 20 }]}>
                    <TouchableOpacity style={styles.signOutBtn} onPress={handleSignOut}>
                      <Text style={styles.signOutBtnText}>{t("signOut")}</Text>
                    </TouchableOpacity>

                    <TouchableOpacity style={styles.deleteBtn} onPress={handleDeleteAccount}>
                      <Text style={styles.deleteBtnText}>{t("deleteAccountBtn")}</Text>
                    </TouchableOpacity>
                  </View>
                </ScrollView>
              </SafeAreaView>
            </View>
          </Modal>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: PincTheme.colors.background
  },
  sheetOverlay: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 999,
    elevation: 100
  },
  loaderContainer: {
    flex: 1,
    backgroundColor: PincTheme.colors.background,
    justifyContent: "center",
    alignItems: "center"
  },
  loaderText: {
    fontFamily: PincTheme.fonts.heading,
    color: PincTheme.colors.textSecondary,
    fontSize: 14,
    fontWeight: "600",
    marginTop: 12
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: PincTheme.colors.backdrop,
    justifyContent: "flex-end"
  },
  modalContent: {
    backgroundColor: PincTheme.colors.background,
    borderTopLeftRadius: PincTheme.borderRadius.lg,
    borderTopRightRadius: PincTheme.borderRadius.lg,
    maxHeight: "85%",
    paddingBottom: 24
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: PincTheme.colors.border
  },
  modalTitle: {
    fontFamily: PincTheme.fonts.heading,
    fontSize: 18,
    fontWeight: "700",
    color: PincTheme.colors.textPrimary
  },
  closeButton: {
    padding: 6
  },
  closeButtonText: {
    fontSize: 18,
    color: PincTheme.colors.textSecondary,
    fontWeight: "bold"
  },
  modalScrollView: {
    maxHeight: "100%"
  },
  modalScrollContent: {
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 48 // Give extra bottom padding to clear the Android bottom navigation bar
  },
  editProfileBtnApp: {
    backgroundColor: PincTheme.colors.background,
    borderWidth: 1,
    borderColor: PincTheme.colors.border,
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: PincTheme.borderRadius.sm,
    marginTop: 8,
    alignSelf: "center",
    ...PincTheme.shadows.sm
  },
  editProfileBtnAppText: {
    color: PincTheme.colors.textPrimary,
    fontFamily: PincTheme.fonts.heading,
    fontWeight: "600",
    fontSize: 12
  },
  settingSection: {
    marginBottom: 24,
    backgroundColor: PincTheme.colors.card,
    borderRadius: PincTheme.borderRadius.md,
    padding: 16,
    borderWidth: 1,
    borderColor: PincTheme.colors.border,
    ...PincTheme.shadows.sm
  },
  settingHeading: {
    fontFamily: PincTheme.fonts.heading,
    fontSize: 14,
    fontWeight: "700",
    color: PincTheme.colors.textSecondary,
    marginBottom: 12,
    textTransform: "uppercase",
    letterSpacing: 0.5
  },
  languageOptions: {
    flexDirection: "row",
    gap: 12
  },
  langBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: "center",
    borderRadius: PincTheme.borderRadius.sm,
    borderWidth: 1,
    borderColor: PincTheme.colors.divider,
    backgroundColor: PincTheme.colors.background
  },
  langBtnActive: {
    borderColor: PincTheme.colors.primary,
    backgroundColor: PincTheme.colors.primaryLight
  },
  langText: {
    fontFamily: PincTheme.fonts.body,
    fontSize: 14,
    color: PincTheme.colors.textSecondary,
    fontWeight: "600"
  },
  langTextActive: {
    color: PincTheme.colors.primary,
    fontWeight: "700"
  },
  settingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between"
  },
  settingTextContainer: {
    flex: 1,
    marginRight: 16
  },
  settingLabel: {
    fontFamily: PincTheme.fonts.heading,
    fontSize: 15,
    fontWeight: "700",
    color: PincTheme.colors.textPrimary
  },
  settingDesc: {
    fontFamily: PincTheme.fonts.body,
    fontSize: 12,
    color: PincTheme.colors.textSecondary,
    marginTop: 4,
    lineHeight: 16
  },
  flexSpacer: {
    height: 40
  },
  actionsContainer: {
    gap: 12
  },
  signOutBtn: {
    paddingVertical: 14,
    alignItems: "center",
    borderRadius: PincTheme.borderRadius.md,
    borderWidth: 1.5,
    borderColor: PincTheme.colors.textSecondary,
    backgroundColor: "transparent",
    marginBottom: 12
  },
  signOutBtnText: {
    fontFamily: PincTheme.fonts.heading,
    fontSize: 14,
    fontWeight: "700",
    color: PincTheme.colors.textSecondary,
    letterSpacing: 0.5
  },
  deleteBtn: {
    paddingVertical: 14,
    alignItems: "center",
    borderRadius: PincTheme.borderRadius.md,
    backgroundColor: PincTheme.colors.primaryLight,
    borderWidth: 1,
    borderColor: PincTheme.colors.primary
  },
  deleteBtnText: {
    fontFamily: PincTheme.fonts.heading,
    fontSize: 14,
    fontWeight: "700",
    color: PincTheme.colors.primary,
    letterSpacing: 0.5
  },
  profileHeaderSection: {
    alignItems: "center",
    backgroundColor: PincTheme.colors.card,
    borderRadius: PincTheme.borderRadius.md,
    padding: 20,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: PincTheme.colors.border,
    ...PincTheme.shadows.sm
  },
  profileAvatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 2,
    borderColor: PincTheme.colors.divider,
    backgroundColor: PincTheme.colors.border
  },
  profileMeta: {
    alignItems: "center",
    marginTop: 10
  },
  profileUsername: {
    fontSize: 16,
    fontFamily: PincTheme.fonts.heading,
    fontWeight: "700",
    color: PincTheme.colors.textPrimary
  },
  profileBio: {
    fontSize: 12,
    fontFamily: PincTheme.fonts.body,
    color: PincTheme.colors.textSecondary,
    textAlign: "center",
    marginTop: 6,
    lineHeight: 16
  },
  noFollowingText: {
    fontSize: 12,
    fontFamily: PincTheme.fonts.body,
    color: PincTheme.colors.textTertiary,
    textAlign: "center",
    paddingVertical: 12
  },
  followingList: {
    marginTop: 6
  },
  friendRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    borderBottomWidth: 0.5,
    borderBottomColor: PincTheme.colors.border
  },
  friendAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: PincTheme.colors.border
  },
  friendUsername: {
    fontSize: 13,
    fontFamily: PincTheme.fonts.body,
    fontWeight: "600",
    color: PincTheme.colors.textPrimary,
    marginLeft: 10
  },
  unfollowBtn: {
    backgroundColor: PincTheme.colors.primaryLight,
    borderWidth: 1,
    borderColor: PincTheme.colors.primary,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6
  },
  unfollowBtnText: {
    fontSize: 11,
    fontFamily: PincTheme.fonts.heading,
    fontWeight: "700",
    color: PincTheme.colors.primary
  },

  // Photo Shelf Styles
  photoShelfContainer: {
    position: "absolute",
    left: 16,
    right: 16,
    backgroundColor: "#FDFBF7F5", // Semi-transparent warm cream bone-white to match theme
    borderRadius: PincTheme.borderRadius.md,
    borderWidth: 1.5,
    borderColor: PincTheme.colors.border,
    padding: 12,
    zIndex: 998,
    ...PincTheme.shadows.lg
  },
  shelfHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10
  },
  shelfTitle: {
    fontSize: 12,
    fontWeight: "bold",
    color: PincTheme.colors.textPrimary,
    fontFamily: PincTheme.fonts.heading,
    letterSpacing: 0.5
  },
  shelfCloseBtn: {
    padding: 4
  },
  shelfCloseText: {
    fontSize: 12,
    fontWeight: "bold",
    color: PincTheme.colors.textSecondary
  },
  shelfEmpty: {
    height: 72,
    justifyContent: "center",
    alignItems: "center"
  },
  shelfEmptyText: {
    fontSize: 11,
    color: PincTheme.colors.textTertiary,
    fontFamily: PincTheme.fonts.body
  },
  shelfScrollContent: {
    flexDirection: "row",
    gap: 8,
    paddingRight: 10
  },
  shelfItem: {
    width: 64,
    height: 64,
    borderRadius: 8,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: PincTheme.colors.border,
    position: "relative"
  },
  shelfImage: {
    width: "100%",
    height: "100%",
    resizeMode: "cover"
  },
  deleteBadgeBtn: {
    position: "absolute",
    top: "50%",
    left: "50%",
    transform: [{ translateX: -12 }, { translateY: -12 }],
    backgroundColor: "#FFF",
    borderRadius: 12,
    zIndex: 10
  },
  videoOverlayBadge: {
    position: "absolute",
    bottom: 2,
    right: 2,
    backgroundColor: "rgba(0,0,0,0.6)",
    borderRadius: 4,
    padding: 2
  },
  videoOverlayText: {
    fontSize: 8,
    color: "#FFF"
  },

  // Bottom Tab Bar Styles (Floating IG Capsule)
  bottomTabBar: {
    position: "absolute",
    left: 16,
    right: 16,
    height: 62,
    backgroundColor: "rgba(26, 26, 26, 0.75)", // 10% more transparent from 0.85
    borderRadius: 31,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 15,
    zIndex: 1000
  },
  tabBtn: {
    alignItems: "center",
    justifyContent: "center",
    flex: 1,
    height: "100%"
  },
  tabIconText: {
    fontSize: 20,
    color: "#8E8E93",
    opacity: 0.8
  },
  tabIconTextActive: {
    color: PincTheme.colors.primary,
    opacity: 1,
    transform: [{ scale: 1.1 }]
  },
  tabLabel: {
    fontSize: 9,
    fontWeight: "600",
    color: "#8E8E93",
    fontFamily: PincTheme.fonts.body,
    marginTop: 2
  },
  tabLabelActive: {
    color: "#FFFFFF",
    fontWeight: "700"
  },
  reelsIconWrapper: {
    width: 26,
    height: 26,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 6,
    backgroundColor: "rgba(255,255,255,0.08)"
  },
  reelsIconWrapperActive: {
    backgroundColor: PincTheme.colors.primary,
    transform: [{ scale: 1.1 }]
  },
  tabProfileWrapper: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1.5,
    borderColor: "#8E8E93",
    padding: 1,
    overflow: "hidden"
  },
  tabProfileWrapperActive: {
    borderColor: PincTheme.colors.primary,
    borderWidth: 2,
    transform: [{ scale: 1.1 }]
  },
  tabProfileImg: {
    width: "100%",
    height: "100%",
    borderRadius: 12
  }
});
