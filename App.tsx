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
  SafeAreaView
} from "react-native";
import { MapScreen } from "./screens/MapScreen";
import { VenueDetailsSheet } from "./components/VenueDetailsSheet";
import { PincButton } from "./components/PincButton";
import { LoginScreen } from "./screens/LoginScreen";
import { PincTheme } from "./styles/theme";
import { 
  Venue, 
  Pin, 
  UserProfile,
  auth,
  fetchUserProfile,
  subscribeToVenues, 
  subscribeToVenuePins,
  seedInitialVenues,
  signOutUser,
  deleteUserAccount
} from "./services/firebase";
import { t } from "./services/localization";

export default function App() {
  // Session States
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [isAuthChecking, setIsAuthChecking] = useState(true);

  // Settings & GDPR States
  const [locale, setLocale] = useState<"en" | "th">("en");
  const [locationTrackingEnabled, setLocationTrackingEnabled] = useState(true);
  const [settingsModalVisible, setSettingsModalVisible] = useState(false);

  // Map & DB States
  const [venues, setVenues] = useState<Venue[]>([]);
  const [selectedVenue, setSelectedVenue] = useState<Venue | null>(null);
  const [activePins, setActivePins] = useState<Pin[]>([]);
  
  const [isLoadingVenues, setIsLoadingVenues] = useState(true);
  const [isLoadingPins, setIsLoadingPins] = useState(false);
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);

  // 1. Check Auth Status & Auto-Seed Database on mount
  useEffect(() => {
    // A: Seed database if empty on startup
    const prepareApp = async () => {
      try {
        await seedInitialVenues();
      } catch (err) {
        console.warn("Failed to check or seed initial database venues.", err);
      }
    };
    prepareApp();

    // B: Listen to Firebase Auth state changes
    const unsubscribeAuth = auth.onAuthStateChanged(async (user) => {
      setIsAuthChecking(true);
      if (user) {
        try {
          const profile = await fetchUserProfile(user.uid);
          setCurrentUser(profile);
        } catch (err) {
          console.error("Failed to load user profile.", err);
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
    const unsubscribe = subscribeToVenues((updatedVenues) => {
      setVenues(updatedVenues);
      setIsLoadingVenues(false);
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
    const unsubscribe = subscribeToVenuePins(selectedVenue.venueId, (updatedPins) => {
      setActivePins(updatedPins);
      setIsLoadingPins(false);
    });

    return () => unsubscribe();
  }, [selectedVenue]);

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
      t(locale, "deleteAccountConfirmTitle"),
      t(locale, "deleteAccountConfirmMsg"),
      [
        { text: t(locale, "cancel"), style: "cancel" },
        {
          text: t(locale, "delete"),
          style: "destructive",
          onPress: async () => {
            try {
              await deleteUserAccount(currentUser.userId);
              setCurrentUser(null);
              setSettingsModalVisible(false);
              Alert.alert("Success", "Account deleted successfully in compliance with GDPR. Data erased.");
            } catch (err: any) {
              console.error(err);
              Alert.alert("Deletion Failed", err.message || "Failed to permanently erase profile.");
            }
          }
        }
      ]
    );
  };

  // Auth Loading Overlay Screen
  if (isAuthChecking) {
    return (
      <View style={styles.loaderContainer}>
        <ActivityIndicator size="large" color={PincTheme.colors.primary} />
        <Text style={styles.loaderText}>Syncing session...</Text>
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
            userLocation={userLocation}
            isLoadingVenues={isLoadingVenues}
            onSelectVenue={handleSelectVenue}
            onOpenSettings={() => setSettingsModalVisible(true)}
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
              />
            </View>
          )}

          {/* GDPR & Settings Modal */}
          <Modal
            animationType="slide"
            transparent={true}
            visible={settingsModalVisible}
            onRequestClose={() => setSettingsModalVisible(false)}
          >
            <View style={styles.modalOverlay}>
              <SafeAreaView style={styles.modalContent}>
                {/* Modal Header */}
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>{t(locale, "settingsTitle")}</Text>
                  <TouchableOpacity 
                    onPress={() => setSettingsModalVisible(false)} 
                    style={styles.closeButton}
                  >
                    <Text style={styles.closeButtonText}>✕</Text>
                  </TouchableOpacity>
                </View>

                <View style={styles.modalBody}>
                  {/* Language Section */}
                  <View style={styles.settingSection}>
                    <Text style={styles.settingHeading}>{t(locale, "languageLabel")}</Text>
                    <View style={styles.languageOptions}>
                      <TouchableOpacity
                        style={[styles.langBtn, locale === "en" && styles.langBtnActive]}
                        onPress={() => setLocale("en")}
                      >
                        <Text style={[styles.langText, locale === "en" && styles.langTextActive]}>English</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.langBtn, locale === "th" && styles.langBtnActive]}
                        onPress={() => setLocale("th")}
                      >
                        <Text style={[styles.langText, locale === "th" && styles.langTextActive]}>ภาษาไทย</Text>
                      </TouchableOpacity>
                    </View>
                  </View>

                  {/* Location Privacy Toggle */}
                  <View style={styles.settingSection}>
                    <View style={styles.settingRow}>
                      <View style={styles.settingTextContainer}>
                        <Text style={styles.settingLabel}>{t(locale, "locationTrackingLabel")}</Text>
                        <Text style={styles.settingDesc}>{t(locale, "locationTrackingDesc")}</Text>
                      </View>
                      <Switch
                        value={locationTrackingEnabled}
                        onValueChange={setLocationTrackingEnabled}
                        trackColor={{ false: PincTheme.colors.divider, true: PincTheme.colors.primary }}
                        thumbColor={locationTrackingEnabled ? "#FFF" : PincTheme.colors.textTertiary}
                      />
                    </View>
                  </View>

                  <View style={styles.flexSpacer} />

                  {/* Settings Actions */}
                  <View style={styles.actionsContainer}>
                    <TouchableOpacity style={styles.signOutBtn} onPress={handleSignOut}>
                      <Text style={styles.signOutBtnText}>{t(locale, "signOut")}</Text>
                    </TouchableOpacity>

                    <TouchableOpacity style={styles.deleteBtn} onPress={handleDeleteAccount}>
                      <Text style={styles.deleteBtnText}>{t(locale, "deleteAccountBtn")}</Text>
                    </TouchableOpacity>
                  </View>
                </View>
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
    zIndex: 999
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
  modalBody: {
    padding: 20,
    flex: 1
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
    backgroundColor: "transparent"
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
  }
});
