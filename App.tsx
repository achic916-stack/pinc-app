import React, { useState, useEffect, useRef } from "react";
import Purchases from "react-native-purchases";
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
import * as Location from "expo-location";
import { Ionicons } from "@expo/vector-icons";
import { MapScreen } from "./screens/MapScreen";
import { VenueDetailsSheet } from "./components/VenueDetailsSheet";
import { UserProfileModal } from "./components/UserProfileModal";
import { PincButton, PincButtonRef } from './components/PincButton';
import { WatermarkShare } from './components/WatermarkShare';
import { LoginScreen } from "./screens/LoginScreen";
import { PincTheme } from "./styles/theme";
import { ReelsFeedModal } from "./components/ReelsFeedModal";
import { CachedVideo } from "./components/CachedVideo";
import { HomeFeedScreen } from "./screens/HomeFeedScreen";


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
  deletePin,
  withTimeout,
  subscribeToFollowingIds,
  getFollowingList,
  unfollowUser,
  subscribeToActiveChats
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
  const [unreadCount, setUnreadCount] = useState(0);

  // Active Navigation & Shelf States
  const [activeTab, setActiveTab] = useState<"home" | "map" | "photo" | "video" | "search" | "profile">("home");
  const [photoShelfVisible, setPhotoShelfVisible] = useState(false);
  const [cameraTarget, setCameraTarget] = useState<{ latitude: number; longitude: number; timestamp: number } | null>(null);
  const [focusSearchTrigger, setFocusSearchTrigger] = useState(0);
  const [appReelsPins, setAppReelsPins] = useState<Pin[]>([]);
  const [appReelsInitialIndex, setAppReelsInitialIndex] = useState<number>(0);
  const [deleteModePinId, setDeleteModePinId] = useState<string | null>(null);
  const [expandedPin, setExpandedPin] = useState<string | null>(null);
  const [activeVideoId, setActiveVideoId] = useState<string | null>(null);
  const [selectedPin, setSelectedPin] = useState<Pin | null>(null);
  const pincButtonRef = useRef<PincButtonRef>(null);

  // Settings & GDPR States
  const [locale, setLocale] = useState<"en" | "th">("en");
  const [locationTrackingEnabled, setLocationTrackingEnabled] = useState(true);

  // Social Follow & Filter States
  const [followingIds, setFollowingIds] = useState<string[]>([]);
  const [followingList, setFollowingList] = useState<UserProfile[]>([]);
  const [followingVenueIds, setFollowingVenueIds] = useState<Set<string>>(new Set());
  const [selectedUserProfileId, setSelectedUserProfileId] = useState<string | null>(null);

  // Map & DB States
  const [venues, setVenues] = useState<Venue[]>([]);
  const [selectedVenue, setSelectedVenue] = useState<Venue | null>(null);
  const [isEditingVenue, setIsEditingVenue] = useState(false);
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
        { text: locale === "th" ? "ยกเลิก" : "Cancel", style: "cancel" },
        { 
          text: locale === "th" ? "ลบ" : "Delete", 
          style: "destructive",
          onPress: async () => {
            try {
               if (pin.pinId) {
                 await deletePin(pin.pinId);
               }
            } catch (err) {
               Alert.alert(locale === "th" ? "เกิดข้อผิดพลาด" : "Error", locale === "th" ? "ไม่สามารถลบโพสต์ได้" : "Could not delete pin.");
            }
          }
        }
      ]
    );
  };

  const handleMapTabPress = () => {
    setActiveTab("map");
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

  const handleHomeTabPress = () => {
    setActiveTab("home");
    setPhotoShelfVisible(false);
    setSelectedVenue(null);
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
  };

  // Filter current user's uploaded pins, newest first
  const currentUserPins = allPins
    .filter(pin => pin.userId === currentUser?.userId)
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  // 0. Initialize RevenueCat SDK on mount
  useEffect(() => {
    const initRevenueCat = async () => {
      try {
        Purchases.setLogLevel(Purchases.LOG_LEVEL.DEBUG);
        if (Platform.OS === 'ios') {
          await Purchases.configure({ apiKey: "appl_THvfOyYaLtltSGzIoFZKJDHsoGr" });
        } else if (Platform.OS === 'android') {
          await Purchases.configure({ apiKey: "goog_LTqRNrPiXfbFEAvhSxXaHAyfYyU" });
        }
        console.log("RevenueCat: Initialized successfully.");
      } catch (rcErr) {
        console.warn("RevenueCat: Initialization failed:", rcErr);
      }
    };
    initRevenueCat();
  }, []);

  // 0.5. Synchronize app language translation whenever locale state changes
  useEffect(() => {
    i18n.changeLanguage(locale);
  }, [locale]);

  // 1. Check Auth Status & Auto-Seed Database on mount
  useEffect(() => {
    // A: Database is ready. Removed auto-seed logic as per user request.
    const prepareApp = async () => {
      // (Reserved for future initialization if needed)
    };
    prepareApp();

    let unsubscribeProfile: (() => void) | null = null;

    // B: Listen to Firebase Auth state changes
    const unsubscribeAuth = auth.onAuthStateChanged(async (user) => {
      setIsAuthChecking(true);
      if (user) {
        try {
          let profile: UserProfile | null = null;
          let fetchFailed = false;
          try {
            profile = await fetchUserProfile(user.uid);
          } catch (fetchErr) {
            console.warn("Failed to fetch Firestore user profile, proceeding to in-memory fallback.", fetchErr);
            fetchFailed = true;
          }
          
          if (!profile) {
            // RESILIENT FALLBACK: If Auth exists but Firestore user document is missing or fetch failed
            const fallbackUsername = user.email ? user.email.split("@")[0].toLowerCase().trim() : "cafe_hopper";
            const fallbackProfile: UserProfile = {
              userId: user.uid,
              username: fallbackUsername,
              bio: "Cafe hopper & travel enthusiast ☕✨",
              profile_pic: "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&q=80",
              created_at: new Date()
            };
            
            profile = fallbackProfile;

            // Only attempt to write the fallback to the database if we are SURE the document doesn't exist
            // (i.e. the fetch succeeded but returned null). If the fetch failed (e.g. offline), DO NOT overwrite.
            if (!fetchFailed) {
              try {
                // Try to write to Firestore with merge: true to avoid accidentally wiping other fields
                await withTimeout(
                  setDoc(doc(db, "users", user.uid), {
                    userId: user.uid,
                    username: fallbackUsername,
                    bio: fallbackProfile.bio,
                    profile_pic: fallbackProfile.profile_pic,
                    created_at: new Date()
                  }, { merge: true }),
                  3000,
                  "Firestore database write timed out during fallback profile generation."
                );
              } catch (dbErr: any) {
                console.warn("Firestore database write failed.", dbErr);
              }
            }
          }
          
          setCurrentUser(profile);

          // Listen for real-time updates to the profile (e.g., if changed from web app)
          if (unsubscribeProfile) unsubscribeProfile();
          unsubscribeProfile = onSnapshot(doc(db, "users", user.uid), (docSnap) => {
            if (docSnap.exists()) {
              setCurrentUser(docSnap.data() as UserProfile);
            }
          });

        } catch (err: any) {
          console.error("Failed to load user profile.", err);
          Alert.alert("Database Error", "Failed to load database. Ensure Firestore is created in your Firebase Console.");
        }
      } else {
        setCurrentUser(null);
        if (unsubscribeProfile) {
          unsubscribeProfile();
          unsubscribeProfile = null;
        }
      }
      setIsAuthChecking(false);
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribeProfile) unsubscribeProfile();
    };
  }, []);

  // 2. Fetch User GPS Location
  useEffect(() => {
    (async () => {
      // Set initial default (Bangkok Thonglor) in case permission fails
      setUserLocation({
        latitude: 13.736717,
        longitude: 100.560481
      });

      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;

      try {
        let location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        setUserLocation({
          latitude: location.coords.latitude,
          longitude: location.coords.longitude
        });

        // Track location in the background while app is active
        Location.watchPositionAsync({ accuracy: Location.Accuracy.Balanced, distanceInterval: 10 }, (loc) => {
          setUserLocation({
            latitude: loc.coords.latitude,
            longitude: loc.coords.longitude
          });
        });
      } catch (error) {
        console.warn("Could not fetch location in App.tsx", error);
      }
    })();
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

  // Subscribe to active chats for unread count badge
  useEffect(() => {
    if (!currentUser) {
      setUnreadCount(0);
      return;
    }

    const unsubscribe = subscribeToActiveChats(currentUser.userId, (activeChats) => {
      let count = 0;
      activeChats.forEach(chat => {
        count += (chat[`unreadCount_${currentUser.userId}`] || 0);
      });
      setUnreadCount(count);
    });

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
      return false; // Allow default behavior (exit app)
    };

    const backHandler = BackHandler.addEventListener(
      "hardwareBackPress",
      backAction
    );

    return () => backHandler.remove();
  }, [selectedUserProfileId, selectedVenue]);

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
    setIsEditingVenue(false);
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
      setSelectedUserProfileId(null);
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
              setSelectedUserProfileId(null);
              Alert.alert("Success", t("accountDeleted"));
            } catch (err: any) {
              console.error(err);
              if (err?.code === 'auth/requires-recent-login' || err?.message?.includes('requires-recent-login')) {
                Alert.alert(t("deleteAccountRequiresRecentLoginTitle"), t("deleteAccountRequiresRecentLoginMsg"));
              } else {
                Alert.alert("Deletion Failed", err.message || "Failed to permanently erase profile.");
              }
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
      <StatusBar barStyle="light-content" backgroundColor={PincTheme.colors.background} />

      {!currentUser ? (
        /* If NOT logged in, show Sleek Sand Login Screen */
        <LoginScreen onAuthSuccess={handleAuthSuccess} />
      ) : (
        /* If logged in, show Main Map Dashboard */
        <>
          <View style={{ flex: 1, display: activeTab === 'map' ? 'flex' : 'none' }}>
            <MapScreen
              venues={venues}
              allPins={allPins}
              userLocation={userLocation}
              isLoadingVenues={isLoadingVenues}
              onSelectVenue={handleSelectVenue}
              followingVenueIds={followingVenueIds}
              locale={locale}
              cameraTarget={cameraTarget}
              focusSearchTrigger={focusSearchTrigger}
              selectedMemoryPin={selectedPin}
              onClearMemory={() => setSelectedPin(null)}
              currentUserId={currentUser?.userId}
              onDeletePin={handleDeletePin}
              onOpenUserProfile={(userId) => {
                setSelectedUserProfileId(userId);
              }}
            />
          </View>
          <View style={{ flex: 1, display: activeTab === 'home' ? 'flex' : 'none', position: 'absolute', width: '100%', height: '100%', zIndex: 5 }}>
            <HomeFeedScreen 
                pins={allPins}
                currentUser={currentUser as UserProfile}
                onOpenUserProfile={(userId) => {
                  setSelectedUserProfileId(userId);
                }}
                onNewPostPress={() => {
                  pincButtonRef.current?.openMediaSelector();
                }}
                onStartVideoPost={() => pincButtonRef.current?.startVideoPost()}
                onStartPhotoPost={() => pincButtonRef.current?.startPhotoPost()}
                onStartGalleryPost={() => pincButtonRef.current?.startGalleryPost()}
              />
          </View>

          {/* Floating Action Button "The Pinc Button" */}
          <PincButton
            ref={pincButtonRef}
            venues={venues}
            userLocation={userLocation}
            onPinCreated={handlePinCreated}
            currentUser={currentUser}
            locationTrackingEnabled={locationTrackingEnabled}
            hideButton={activeTab === 'home' || activeTab === 'profile' || photoShelfVisible || selectedUserProfileId !== null}
            activeTab={activeTab}
          />

          {/* Reality Check Sliding Sheet (For Advertiser/Business Packages) */}
          {selectedVenue && (
            selectedVenue.is_sponsored || (selectedVenue.sponsor_tier && selectedVenue.sponsor_tier >= 1) ? (
              <Modal
                visible={true}
                animationType="slide"
                onRequestClose={handleCloseBottomSheet}
              >
                <SafeAreaView style={{ flex: 1, backgroundColor: PincTheme.colors.background }}>
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
                    isFullScreen={true}
                    isEditing={isEditingVenue}
                  />
                </SafeAreaView>
              </Modal>
            ) : (
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
                  isFullScreen={false}
                  isEditing={isEditingVenue}
                />
              </View>
            )
          )} 

          {/* User Profile Modal */}
          <UserProfileModal
            visible={selectedUserProfileId !== null}
            userId={selectedUserProfileId}
            currentUserId={currentUser?.userId || ""}
            onClose={() => setSelectedUserProfileId(null)}
            onSelectMemory={(pin) => {
              setSelectedPin(pin);
              setSelectedUserProfileId(null);
              setActiveTab("home");
            }}
            locale={locale}
            setLocale={setLocale}
            onDeletePin={handleDeletePin}
            setUserId={setSelectedUserProfileId}
            currentUserProfile={currentUser}
            venues={venues}
            onSelectEditVenue={(shop) => {
              setSelectedVenue(shop);
              setIsEditingVenue(true);
            }}
            onUpdateProfile={handleAuthSuccess}
            locationTrackingEnabled={locationTrackingEnabled}
            setLocationTrackingEnabled={setLocationTrackingEnabled}
            onSignOut={handleSignOut}
            onDeleteAccount={handleDeleteAccount}
          />

          {/* Reality Check Sliding Shelf (User Pins Photo Drawer) */}
          {photoShelfVisible && (
            <View style={styles.photoShelfContainer}>
              <View style={styles.shelfHeader}>
                <Text style={[styles.shelfTitle, { color: PincTheme.colors.primary, fontSize: 24, fontWeight: '800' }]}>
                  Pinc Album ({currentUserPins.length})
                </Text>
              </View>
              {currentUserPins.length === 0 ? (
                <View style={styles.shelfEmpty}>
                  <Text style={styles.shelfEmptyText}>
                    {locale === "th" ? "ยังไม่มีภาพหรือวิดีโอที่คุณถ่ายไว้" : "No posted media yet."}
                  </Text>
                </View>
              ) : (
                <ScrollView 
                  showsVerticalScrollIndicator={false}
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
                            setSelectedPin(pin);
                            setActiveTab("map");
                            setPhotoShelfVisible(false);
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
                              resizeMode={"cover"} 
                              shouldPlay 
                              useNativeControls
                            />
                          ) : (
                            <View 
                              style={{ width: '100%', height: '100%' }} 
                            >
                              <Image source={{ uri: getSafeVideoUrl(pin.image_url) }} style={styles.shelfImage} contentFit="cover" />
                              <View style={[StyleSheet.absoluteFill, { justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.3)' }]}>
                                <Ionicons name="play" size={24} color="#FFFFFF" />
                              </View>
                            </View>
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
  
            {/* Profile Tab View (Full screen, no modal) */}
            <View style={{ flex: 1, display: activeTab === 'profile' ? 'flex' : 'none', position: 'absolute', width: '100%', height: '100%', zIndex: 5, backgroundColor: PincTheme.colors.background }}>
              {currentUser && activeTab === 'profile' && (
                <UserProfileModal
                  isModal={false}
                  visible={true}
                  userId={currentUser.userId}
                  currentUserId={currentUser.userId}
                  onClose={() => {}}
                  locale={locale}
                  setLocale={setLocale}
                  currentUserProfile={currentUser as UserProfile}
                  onSelectMemory={(pin) => {
                    setSelectedPin(pin);
                    setActiveTab("home");
                  }}
                  onDeletePin={handleDeletePin}
                  setUserId={setSelectedUserProfileId}
                  venues={venues}
                  onSelectEditVenue={(shop) => {
                    setSelectedVenue(shop);
                    setIsEditingVenue(true);
                  }}
                  onUpdateProfile={handleAuthSuccess}
                  locationTrackingEnabled={locationTrackingEnabled}
                  setLocationTrackingEnabled={setLocationTrackingEnabled}
                  onSignOut={handleSignOut}
                  onDeleteAccount={handleDeleteAccount}
                />
              )}
            </View>

          {/* Premium Instagram-Style User Bottom Toolbar */}
          <View style={[styles.bottomTabBar, { bottom: Platform.OS === 'ios' ? 24 : 56 }]}>
            {/* Tab 1: Home Feed */}
            <TouchableOpacity 
              style={styles.tabBtn} 
              onPress={handleHomeTabPress}
              activeOpacity={0.7}
            >
              <Ionicons name={activeTab === "home" ? "home" : "home-outline"} size={26} color={activeTab === "home" ? "#E4007F" : "#A0A0A0"} />
            </TouchableOpacity>

            {/* Tab 1.5: Map */}
            <TouchableOpacity 
              style={styles.tabBtn} 
              onPress={handleMapTabPress}
              activeOpacity={0.7}
            >
              <Ionicons name={activeTab === "map" ? "map" : "map-outline"} size={26} color={activeTab === "map" ? "#E4007F" : "#A0A0A0"} />
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



            {/* Tab 5: Profile (IG-Style Avatar) */}
            <TouchableOpacity 
              style={[styles.tabBtn, { position: "relative" }]} 
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
              {unreadCount > 0 && (
                <View style={{
                  position: "absolute",
                  top: 12,
                  right: 20,
                  backgroundColor: PincTheme.colors.primary,
                  width: 10,
                  height: 10,
                  borderRadius: 5,
                  borderWidth: 1.5,
                  borderColor: "rgba(26, 26, 26, 0.75)"
                }} />
              )}
            </TouchableOpacity>
          </View>

          {/* Full Screen Reels Feed Modal from Tab 3 */}
          <ReelsFeedModal 
            visible={appReelsPins.length > 0}
            pins={appReelsPins}
            initialIndex={appReelsInitialIndex}
            onClose={() => {
              setAppReelsPins([]);
              setAppReelsInitialIndex(0);
              setActiveTab("home");
            }}
            currentUserId={currentUser.userId}
            onOpenUserProfile={(userId) => {
              setSelectedUserProfileId(userId);
              setAppReelsPins([]);
            }}
            locale={locale}
          />

          {/* Redundant settings modal removed in favor of UserProfileModal settings integration */}
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
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: PincTheme.colors.background,
    zIndex: 4,
    paddingTop: Platform.OS === 'android' ? 50 : 30,
    paddingHorizontal: 16,
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
    flexWrap: "wrap",
    justifyContent: "space-between",
    paddingBottom: 150
  },
  shelfItem: {
    width: "31%",
    aspectRatio: 1,
    borderRadius: 8,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: PincTheme.colors.border,
    position: "relative",
    marginBottom: 12
  },
  shelfImage: {
    width: "100%",
    height: "100%",
    resizeMode: "cover"
  } as any,
  deleteBadgeBtn: {
    position: "absolute",
    top: "50%",
    left: "50%",
    transform: [{ translateX: -12 }, { translateY: -12 }],
    backgroundColor: PincTheme.colors.card,
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
    shadowColor: PincTheme.colors.textPrimary,
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
