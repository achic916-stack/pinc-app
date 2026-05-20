import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  TextInput,
  Image,
  Alert,
  ActivityIndicator,
  SafeAreaView
} from "react-native";
import * as Location from "expo-location";
import * as ImagePicker from "expo-image-picker";
import { PincTheme } from "../styles/theme";
import { Venue, createPin, calculateDistance } from "../services/firebase";

interface PincButtonProps {
  venues: Venue[];
  userLocation: { latitude: number; longitude: number } | null;
  onPinCreated: () => void;
  currentUser: {
    userId: string;
    username: string;
    profile_pic: string;
    bio: string;
  };
  locationTrackingEnabled?: boolean;
}

export const PincButton: React.FC<PincButtonProps> = ({
  venues,
  userLocation,
  onPinCreated,
  currentUser,
  locationTrackingEnabled = true
}) => {
  const [modalVisible, setModalVisible] = useState(false);
  const [capturedPhoto, setCapturedPhoto] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [userAestheticRating, setUserAestheticRating] = useState<number>(5);
  const [reportType, setReportType] = useState<"aesthetic" | "live_status">("aesthetic");
  const [liveCrowdVote, setLiveCrowdVote] = useState<"chill" | "moderate" | "packed">("chill");
  
  const [currentGPSLocation, setCurrentGPSLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSensorsLoading, setIsSensorsLoading] = useState(false);

  // 1. native Sensors Trigger: Camera & GPS Proximity Check
  const triggerCameraAndGPS = async () => {
    setIsSensorsLoading(true);

    try {
      if (locationTrackingEnabled) {
        // Step A: Request Native Location Permissions & Fetch GPS Coordinates
        const { status: locationStatus } = await Location.requestForegroundPermissionsAsync();
        if (locationStatus !== "granted") {
          Alert.alert("Permission Denied", "GPS location permissions are required to post a Verified Live Reality Check.");
          setIsSensorsLoading(false);
          return;
        }

        // Step C: Get Current GPS Coordinates
        const location = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced
        });
        const coords = {
          latitude: location.coords.latitude,
          longitude: location.coords.longitude
        };
        setCurrentGPSLocation(coords);
      } else {
        setCurrentGPSLocation(null);
      }

      // Step B: Request Native Camera Permissions
      const { status: cameraStatus } = await ImagePicker.requestCameraPermissionsAsync();
      if (cameraStatus !== "granted") {
        Alert.alert("Permission Denied", "Camera permissions are required to take a raw unedited check-in photo.");
        setIsSensorsLoading(false);
        return;
      }

      // Step D: Open Native System Camera to capture unedited photo
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.8 // compress to 80% to minimize network traffic and Firebase storage costs
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        setCapturedPhoto(result.assets[0].uri);
        setModalVisible(true);
      }
    } catch (error: any) {
      console.error(error);
      Alert.alert("Hardware Trigger Failed", error.message || "Failed to initialize GPS or Camera.");
    } finally {
      setIsSensorsLoading(false);
    }
  };

  // Find nearest venue using GPS coordinates
  const getNearestVenue = (): { venue: Venue | null; distance: number } => {
    const loc = currentGPSLocation || userLocation;
    if (!loc || venues.length === 0) return { venue: null, distance: Infinity };

    let nearestVenue: Venue | null = null;
    let minDistance = Infinity;

    venues.forEach((venue) => {
      const distance = calculateDistance(
        loc.latitude,
        loc.longitude,
        venue.latitude,
        venue.longitude
      );
      if (distance < minDistance) {
        minDistance = distance;
        nearestVenue = venue;
      }
    });

    return { venue: nearestVenue, distance: minDistance };
  };

  const { venue: nearestVenue, distance: distanceToVenue } = getNearestVenue();
  const isVerifiedLive = locationTrackingEnabled && nearestVenue && distanceToVenue <= 50; // verified within 50 meters

  const handleSubmit = async () => {
    if (!capturedPhoto) {
      Alert.alert("Photo Required", "Please capture a photo first!");
      return;
    }
    if (!nearestVenue) {
      Alert.alert("Error", "No nearby venues detected to link your pin.");
      return;
    }

    setIsSubmitting(true);
    try {
      const loc = currentGPSLocation || userLocation || { latitude: 0, longitude: 0 };
      
      // Save Pin to Firebase Firestore & Storage
      await createPin({
        userId: currentUser.userId,
        username: currentUser.username,
        user_profile_pic: currentUser.profile_pic,
        venueId: nearestVenue.venueId,
        venueCoords: { latitude: nearestVenue.latitude, longitude: nearestVenue.longitude },
        imageUri: capturedPhoto,
        textContent: text,
        userCoords: loc,
        aestheticRating: reportType === "aesthetic" ? userAestheticRating : undefined,
        reportType: reportType,
        liveCrowdVote: reportType === "live_status" ? liveCrowdVote : undefined
      });

      Alert.alert("Success", "Reality Check posted successfully! ✨");
      setModalVisible(false);
      setCapturedPhoto(null);
      setText("");
      setUserAestheticRating(5);
      setReportType("aesthetic");
      setLiveCrowdVote("chill");
      onPinCreated();
    } catch (error: any) {
      console.error(error);
      Alert.alert("Submission Failed", error.message || "Something went wrong.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      {/* Floating Action Button (FAB) in center-bottom */}
      <View style={styles.fabContainer}>
        <TouchableOpacity 
          style={styles.fab} 
          onPress={triggerCameraAndGPS} 
          activeOpacity={0.85}
          disabled={isSensorsLoading}
        >
          {isSensorsLoading ? (
            <ActivityIndicator size="small" color="#FFF" />
          ) : (
            <>
              <Text style={styles.fabIcon}>📷</Text>
              <Text style={styles.fabLabel}>PINC</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      {/* Modal Composer Overlay */}
      <Modal animationType="slide" transparent={false} visible={modalVisible}>
        <SafeAreaView style={styles.modalContainer}>
          {/* Header */}
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setModalVisible(false)} disabled={isSubmitting}>
              <Text style={styles.cancelBtn}>Cancel</Text>
            </TouchableOpacity>
            
            <Text style={styles.modalTitle}>Reality Check</Text>
            
            <TouchableOpacity 
              style={[styles.postBtn, (!text || isSubmitting) && styles.postBtnDisabled]} 
              onPress={handleSubmit}
              disabled={!text || isSubmitting}
            >
              {isSubmitting ? (
                <ActivityIndicator size="small" color="#FFF" />
              ) : (
                <Text style={styles.postBtnText}>Post</Text>
              )}
            </TouchableOpacity>
          </View>

          {/* Composer Body */}
          <View style={styles.composerBody}>
            {/* Nearest Venue Geotag Indicator */}
            {nearestVenue ? (
              <View style={styles.venueIndicator}>
                <Text style={styles.venueIndicatorIcon}>📍</Text>
                <View style={styles.venueIndicatorMeta}>
                  <Text style={styles.venueIndicatorName}>{nearestVenue.name}</Text>
                  <Text style={styles.venueIndicatorDistance}>
                    {Math.round(distanceToVenue)}m away •{" "}
                    <Text style={isVerifiedLive ? styles.greenText : styles.amberText}>
                      {isVerifiedLive ? "Verified Live (Within 50m) ✓" : "Linked (Not at location)"}
                    </Text>
                  </Text>
                </View>
              </View>
            ) : (
              <View style={styles.venueIndicator}>
                <Text style={styles.venueIndicatorIcon}>⚠️</Text>
                <Text style={styles.venueIndicatorText}>Searching nearest venues...</Text>
              </View>
            )}

            {/* Post Photo Frame */}
            {capturedPhoto && (
              <View style={styles.imageFrame}>
                <Image source={{ uri: capturedPhoto }} style={styles.previewImage} />
                <View style={styles.rawRealityTag}>
                  <Text style={styles.rawText}>RAW IMAGE • UNEDITED</Text>
                </View>
              </View>
            )}

            {/* Report Type Selector Segmented Tabs */}
            <View style={styles.reportTypeContainer}>
              <TouchableOpacity
                style={[styles.reportTypeTab, reportType === "aesthetic" && styles.reportTypeTabActive]}
                onPress={() => setReportType("aesthetic")}
                disabled={isSubmitting}
              >
                <Text style={[styles.reportTypeTabText, reportType === "aesthetic" && styles.reportTypeTabTextActive]}>
                  📸 Aesthetic
                </Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={[styles.reportTypeTab, reportType === "live_status" && styles.reportTypeTabActive]}
                onPress={() => setReportType("live_status")}
                disabled={isSubmitting}
              >
                <Text style={[styles.reportTypeTabText, reportType === "live_status" && styles.reportTypeTabTextActive]}>
                  ⚡ Live Reality
                </Text>
              </TouchableOpacity>
            </View>

            {/* Conditional Rating / Crowd Status Selector */}
            {reportType === "aesthetic" ? (
              <View style={styles.ratingSection}>
                <Text style={styles.ratingHeading}>AESTHETIC RATING:</Text>
                <View style={styles.starsContainer}>
                  {[1, 2, 3, 4, 5].map((star) => (
                    <TouchableOpacity
                      key={star}
                      onPress={() => setUserAestheticRating(star)}
                      disabled={isSubmitting}
                    >
                      <Text style={[styles.starText, star <= userAestheticRating ? styles.starActive : styles.starMuted]}>
                        ★
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            ) : (
              <View style={styles.voteSection}>
                <Text style={styles.voteHeading}>CROWD STATUS VOTE:</Text>
                <View style={styles.votesContainer}>
                  <TouchableOpacity
                    style={[styles.voteButton, liveCrowdVote === "chill" && styles.voteButtonChillActive]}
                    onPress={() => setLiveCrowdVote("chill")}
                    disabled={isSubmitting}
                  >
                    <Text style={[styles.voteButtonText, liveCrowdVote === "chill" && styles.voteButtonTextChillActive]}>
                      🟢 Chill
                    </Text>
                  </TouchableOpacity>
                  
                  <TouchableOpacity
                    style={[styles.voteButton, liveCrowdVote === "moderate" && styles.voteButtonModerateActive]}
                    onPress={() => setLiveCrowdVote("moderate")}
                    disabled={isSubmitting}
                  >
                    <Text style={[styles.voteButtonText, liveCrowdVote === "moderate" && styles.voteButtonTextModerateActive]}>
                      🟡 Moderate
                    </Text>
                  </TouchableOpacity>
                  
                  <TouchableOpacity
                    style={[styles.voteButton, liveCrowdVote === "packed" && styles.voteButtonPackedActive]}
                    onPress={() => setLiveCrowdVote("packed")}
                    disabled={isSubmitting}
                  >
                    <Text style={[styles.voteButtonText, liveCrowdVote === "packed" && styles.voteButtonTextPackedActive]}>
                      🔴 Packed
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* Text Input (X Twitter Style: max 280 chars) */}
            <TextInput
              style={styles.textInput}
              placeholder="What's the queue looking like? Aesthetic matches the hype? (Max 280 chars)"
              placeholderTextColor={PincTheme.colors.textTertiary}
              multiline
              maxLength={280}
              value={text}
              onChangeText={setText}
              editable={!isSubmitting}
            />

            {/* Character Count Indicator */}
            <View style={styles.charCountContainer}>
              <Text style={[styles.charCountText, text.length >= 260 && styles.charCountWarn]}>
                {text.length} / 280
              </Text>
            </View>
          </View>
        </SafeAreaView>
      </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  fabContainer: {
    position: "absolute",
    bottom: 24,
    left: 0,
    right: 0,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 99
  },
  fab: {
    backgroundColor: PincTheme.colors.primary,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: PincTheme.borderRadius.round,
    ...PincTheme.shadows.lg,
    borderWidth: 2,
    borderColor: "#FFF",
    minWidth: 100,
    justifyContent: "center"
  },
  fabIcon: {
    fontSize: 18,
    marginRight: 6
  },
  fabLabel: {
    color: "#FFF",
    fontFamily: PincTheme.fonts.heading,
    fontWeight: "bold",
    letterSpacing: 1.5,
    fontSize: 14
  },
  modalContainer: {
    flex: 1,
    backgroundColor: PincTheme.colors.background
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: PincTheme.colors.border,
    backgroundColor: PincTheme.colors.card
  },
  cancelBtn: {
    fontSize: 15,
    color: PincTheme.colors.textSecondary,
    fontFamily: PincTheme.fonts.body
  },
  modalTitle: {
    fontSize: 16,
    fontFamily: PincTheme.fonts.heading,
    fontWeight: "bold",
    color: PincTheme.colors.textPrimary
  },
  postBtn: {
    backgroundColor: PincTheme.colors.primary,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: PincTheme.borderRadius.round,
    minWidth: 64,
    alignItems: "center"
  },
  postBtnDisabled: {
    backgroundColor: PincTheme.colors.divider
  },
  postBtnText: {
    color: "#FFF",
    fontWeight: "bold",
    fontSize: 13,
    fontFamily: PincTheme.fonts.body
  },
  composerBody: {
    flex: 1,
    padding: 16
  },
  venueIndicator: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: PincTheme.colors.card,
    borderRadius: PincTheme.borderRadius.md,
    padding: 12,
    borderWidth: 1,
    borderColor: PincTheme.colors.border,
    marginBottom: 12
  },
  venueIndicatorIcon: {
    fontSize: 18,
    marginRight: 10
  },
  venueIndicatorMeta: {
    flex: 1
  },
  venueIndicatorName: {
    fontSize: 14,
    fontWeight: "bold",
    color: PincTheme.colors.textPrimary,
    fontFamily: PincTheme.fonts.heading
  },
  venueIndicatorDistance: {
    fontSize: 11,
    color: PincTheme.colors.textSecondary,
    fontFamily: PincTheme.fonts.body,
    marginTop: 2
  },
  venueIndicatorText: {
    fontSize: 13,
    color: PincTheme.colors.textSecondary,
    fontFamily: PincTheme.fonts.body
  },
  greenText: {
    color: PincTheme.colors.crowdGreen,
    fontWeight: "bold"
  },
  amberText: {
    color: PincTheme.colors.crowdYellow,
    fontWeight: "bold"
  },
  imageFrame: {
    width: "100%",
    aspectRatio: 1.5,
    borderRadius: PincTheme.borderRadius.md,
    overflow: "hidden",
    position: "relative",
    marginBottom: 12,
    borderWidth: 1,
    borderColor: PincTheme.colors.border
  },
  previewImage: {
    width: "100%",
    height: "100%"
  },
  rawRealityTag: {
    position: "absolute",
    bottom: 8,
    right: 8,
    backgroundColor: "rgba(26, 26, 26, 0.75)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4
  },
  rawText: {
    fontSize: 9,
    color: "#FFF",
    fontWeight: "bold",
    letterSpacing: 0.8
  },
  ratingSection: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: PincTheme.colors.card,
    borderRadius: PincTheme.borderRadius.md,
    padding: 12,
    borderWidth: 1,
    borderColor: PincTheme.colors.border,
    marginBottom: 12,
    justifyContent: "space-between"
  },
  ratingHeading: {
    fontSize: 10,
    fontWeight: "bold",
    letterSpacing: 1,
    color: PincTheme.colors.textSecondary,
    fontFamily: PincTheme.fonts.body
  },
  starsContainer: {
    flexDirection: "row",
    gap: 4
  },
  starText: {
    fontSize: 24,
    lineHeight: 24
  },
  starActive: {
    color: "#FFC107"
  },
  starMuted: {
    color: PincTheme.colors.divider
  },
  textInput: {
    flex: 1,
    fontSize: 15,
    fontFamily: PincTheme.fonts.body,
    color: PincTheme.colors.textPrimary,
    textAlignVertical: "top",
    lineHeight: 22
  },
  charCountContainer: {
    alignItems: "flex-end",
    paddingVertical: 8
  },
  charCountText: {
    fontSize: 11,
    color: PincTheme.colors.textSecondary,
    fontFamily: PincTheme.fonts.body
  },
  charCountWarn: {
    color: PincTheme.colors.crowdRed,
    fontWeight: "bold"
  },
  reportTypeContainer: {
    flexDirection: "row",
    backgroundColor: PincTheme.colors.border,
    borderRadius: PincTheme.borderRadius.sm,
    padding: 2,
    marginBottom: 12
  },
  reportTypeTab: {
    flex: 1,
    paddingVertical: 8,
    alignItems: "center",
    borderRadius: PincTheme.borderRadius.sm - 2
  },
  reportTypeTabActive: {
    backgroundColor: PincTheme.colors.card,
    ...PincTheme.shadows.sm
  },
  reportTypeTabText: {
    fontSize: 13,
    fontWeight: "600",
    color: PincTheme.colors.textSecondary,
    fontFamily: PincTheme.fonts.body
  },
  reportTypeTabTextActive: {
    color: PincTheme.colors.textPrimary
  },
  voteSection: {
    backgroundColor: PincTheme.colors.card,
    borderRadius: PincTheme.borderRadius.md,
    padding: 12,
    borderWidth: 1,
    borderColor: PincTheme.colors.border,
    marginBottom: 12
  },
  voteHeading: {
    fontSize: 10,
    fontWeight: "bold",
    letterSpacing: 1,
    color: PincTheme.colors.textSecondary,
    fontFamily: PincTheme.fonts.body,
    marginBottom: 8
  },
  votesContainer: {
    flexDirection: "row",
    gap: 8
  },
  voteButton: {
    flex: 1,
    paddingVertical: 10,
    alignItems: "center",
    borderRadius: PincTheme.borderRadius.sm,
    borderWidth: 1,
    borderColor: PincTheme.colors.border,
    backgroundColor: PincTheme.colors.background
  },
  voteButtonText: {
    fontSize: 13,
    fontWeight: "bold",
    color: PincTheme.colors.textSecondary,
    fontFamily: PincTheme.fonts.body
  },
  voteButtonChillActive: {
    backgroundColor: PincTheme.colors.crowdGreenLight,
    borderColor: PincTheme.colors.crowdGreen
  },
  voteButtonModerateActive: {
    backgroundColor: PincTheme.colors.crowdYellowLight,
    borderColor: PincTheme.colors.crowdYellow
  },
  voteButtonPackedActive: {
    backgroundColor: PincTheme.colors.crowdRedLight,
    borderColor: PincTheme.colors.crowdRed
  },
  voteButtonTextChillActive: {
    color: PincTheme.colors.crowdGreen
  },
  voteButtonTextModerateActive: {
    color: PincTheme.colors.crowdYellow
  },
  voteButtonTextPackedActive: {
    color: PincTheme.colors.crowdRed
  }
});
