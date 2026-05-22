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
  SafeAreaView,
  KeyboardAvoidingView,
  ScrollView,
  Platform
} from "react-native";
import * as Location from "expo-location";
import * as ImagePicker from "expo-image-picker";
import * as VideoThumbnails from 'expo-video-thumbnails';
import { LinearGradient } from "expo-linear-gradient";
import { Feather, Ionicons } from "@expo/vector-icons";
import { Audio, Video, ResizeMode } from "expo-av";

import { PincTheme } from "../styles/theme";
import { Venue, createPin, calculateDistance, db } from "../services/firebase";
import { collection, addDoc } from "firebase/firestore";
import { useTranslation } from 'react-i18next';

const MOCK_TRACKS = [
  { id: "original", title: "Original Audio 🔇", url: "" },
  { id: "1", title: "Summer Breeze ☀️ (Cafe Lounge)", url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3" },
  { id: "2", title: "Lofi Sunset 🌆 (Chill Beats)", url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3" },
  { id: "3", title: "Coffee & Rain ☕ (Acoustic Piano)", url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3" },
  { id: "4", title: "Midnight Jazz 🎷 (Classy Vibe)", url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3" }
];


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
  const { t } = useTranslation();
  const [modalVisible, setModalVisible] = useState(false);
  const [capturedPhoto, setCapturedPhoto] = useState<string | null>(null);
  const [capturedMediaType, setCapturedMediaType] = useState<"image" | "video">("image");
  const [text, setText] = useState("");
  const [postType, setPostType] = useState<"standard" | "live_news">("standard");
  const [postDuration, setPostDuration] = useState<"permanent" | "24h">("permanent");
  const [capturedBase64, setCapturedBase64] = useState<string | null>(null);
  
  const [currentGPSLocation, setCurrentGPSLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSensorsLoading, setIsSensorsLoading] = useState(false);
  const [isMediaSelectorVisible, setIsMediaSelectorVisible] = useState(false);

  // States for Music Picker
  const [selectedTrack, setSelectedTrack] = useState<typeof MOCK_TRACKS[0]>(MOCK_TRACKS[0]);
  const [musicPickerVisible, setMusicPickerVisible] = useState(false);
  const [playingTrackId, setPlayingTrackId] = useState<string | null>(null);
  const [soundObject, setSoundObject] = useState<Audio.Sound | null>(null);

  // Preview Music Logic
  const handlePlayPreview = async (track: typeof MOCK_TRACKS[0]) => {
    if (playingTrackId === track.id) {
      if (soundObject) {
        await soundObject.pauseAsync();
      }
      setPlayingTrackId(null);
      return;
    }

    if (soundObject) {
      try {
        await soundObject.unloadAsync();
      } catch (e) {
        console.warn("Unloading previous sound error:", e);
      }
    }

    if (track.id === "original" || !track.url) {
      setPlayingTrackId(null);
      setSoundObject(null);
      return;
    }

    try {
      const { sound } = await Audio.Sound.createAsync(
        { uri: track.url },
        { shouldPlay: true, isLooping: false }
      );
      setSoundObject(sound);
      setPlayingTrackId(track.id);
      
      sound.setOnPlaybackStatusUpdate((status) => {
        if (status.isLoaded && status.didJustFinish) {
          setPlayingTrackId(null);
        }
      });
    } catch (err) {
      console.error("Preview sound error:", err);
      Alert.alert("Error", t("errorSubmission") || "Failed to preview sound.");
    }
  };

  const closeMusicPicker = async () => {
    if (soundObject) {
      try {
        await soundObject.stopAsync();
        await soundObject.unloadAsync();
      } catch (e) {
        console.warn("Unloading sound error on close:", e);
      }
      setSoundObject(null);
    }
    setPlayingTrackId(null);
    setMusicPickerVisible(false);
  };

  const handleCloseComposer = async () => {
    await closeMusicPicker();
    setModalVisible(false);
    setSelectedTrack(MOCK_TRACKS[0]);
  };


  // 1. Prompt User to select Photo or Video
  const promptCameraAction = () => {
    setIsMediaSelectorVisible(true);
  };

  // 2. native Sensors Trigger: Camera & GPS Proximity Check
  const triggerCameraAndGPS = async (mediaType: ImagePicker.MediaTypeOptions) => {
    setIsSensorsLoading(true);

    try {
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

      // Step B: Request Native Camera Permissions
      const { status: cameraStatus } = await ImagePicker.requestCameraPermissionsAsync();
      if (cameraStatus !== "granted") {
        Alert.alert("Permission Denied", "Camera permissions are required to take a raw unedited check-in photo.");
        setIsSensorsLoading(false);
        return;
      }

      // Step D: Open Native System Camera to capture unedited photo or video
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: mediaType,
        allowsEditing: true,
        quality: 0.8, // compress to 80% to minimize network traffic and Firebase storage costs
        base64: true,
        videoMaxDuration: 15
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        setCapturedPhoto(result.assets[0].uri);
        setCapturedMediaType(result.assets[0].type === "video" ? "video" : "image");
        setCapturedBase64(result.assets[0].base64 || null);
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
      Alert.alert("Photo Required", t("photoRequired"));
      return;
    }

    let finalVenue = nearestVenue;
    const loc = currentGPSLocation || userLocation || { latitude: 13.736717, longitude: 100.560481 };

    if (!finalVenue) {
      // Auto-create a temporary venue for the user's current location so they can post anywhere!
      try {
        const newVenueRef = collection(db, "venues");
        const newDoc = await addDoc(newVenueRef, {
          name: `Current Location (${loc.latitude.toFixed(3)}, ${loc.longitude.toFixed(3)})`,
          latitude: loc.latitude,
          longitude: loc.longitude,
          geohash: "w4rw", // dummy geohash, won't affect basic functionality
          category: "other",
          aesthetic_rating: 4.0,
          crowd_status: "Green",
          cover_image: "https://images.unsplash.com/photo-1524661135-423995f22d0b?auto=format&fit=crop&w=600&q=80"
        });
        finalVenue = {
          venueId: newDoc.id,
          name: `Current Location (${loc.latitude.toFixed(3)}, ${loc.longitude.toFixed(3)})`,
          latitude: loc.latitude,
          longitude: loc.longitude,
          category: "other",
          aesthetic_rating: 4.0,
          crowd_status: "Green",
          cover_image: "https://images.unsplash.com/photo-1524661135-423995f22d0b?auto=format&fit=crop&w=600&q=80"
        } as Venue;
      } catch (err) {
        Alert.alert("Error", t("errorAutoCreate"));
        return;
      }
    }

    setIsSubmitting(true);
    try {
      // 1. Run AI Safety Check first (Skip for video currently)
      if (capturedBase64 && capturedMediaType === "image") {
        const { checkImageSafety } = require("../services/firebase");
        await checkImageSafety(capturedBase64);
      }

      const loc = currentGPSLocation || userLocation || { latitude: 0, longitude: 0 };
      
      let thumbnailUri = null;
      if (capturedMediaType === "video" && capturedPhoto) {
        try {
          const { uri } = await VideoThumbnails.getThumbnailAsync(capturedPhoto, {
            time: 1000, // 1 second in
          });
          thumbnailUri = uri;
        } catch (e) {
          console.warn("Could not generate video thumbnail", e);
        }
      }
      
      // Save Pin to Firebase Firestore & Storage
      await createPin({
        userId: currentUser.userId,
        username: currentUser.username,
        user_profile_pic: currentUser.profile_pic,
        venueId: finalVenue!.venueId,
        venueCoords: { latitude: finalVenue!.latitude, longitude: finalVenue!.longitude },
        imageUri: capturedPhoto,
        textContent: text,
        userCoords: loc,
        reportType: "live_status",
        postType,
        postDuration,
        situationDetails: postType === "live_news" ? text : "",
        mediaType: capturedMediaType,
        musicTitle: selectedTrack.id !== "original" ? selectedTrack.title : "",
        musicUrl: selectedTrack.id !== "original" ? selectedTrack.url : "",
        thumbnailUri: thumbnailUri
      });

      await closeMusicPicker();
      Alert.alert("Success", t("successPost"));
      setModalVisible(false);
      setCapturedPhoto(null);
      setCapturedBase64(null);
      setText("");
      setPostType("standard");
      setPostDuration("permanent");
      setSelectedTrack(MOCK_TRACKS[0]);
      onPinCreated();
    } catch (error: any) {
      console.error(error);
      Alert.alert("Submission Failed", error.message || t("errorSubmission"));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      {/* Floating Action Button (FAB) in center-bottom */}
      <View style={styles.fabContainer}>
        
        {/* Custom Media Selector Popup */}
        {isMediaSelectorVisible && (
          <View style={styles.mediaSelectorPopup}>
            <TouchableOpacity 
              style={styles.mediaSelectorOption}
              onPress={() => {
                setIsMediaSelectorVisible(false);
                triggerCameraAndGPS(ImagePicker.MediaTypeOptions.Videos);
              }}
            >
              <Text style={styles.mediaSelectorText}>VIDEO</Text>
            </TouchableOpacity>
            
            <View style={styles.mediaSelectorDivider} />

            <TouchableOpacity 
              style={styles.mediaSelectorOption}
              onPress={() => {
                setIsMediaSelectorVisible(false);
                triggerCameraAndGPS(ImagePicker.MediaTypeOptions.Images);
              }}
            >
              <Text style={styles.mediaSelectorText}>PHOTO</Text>
            </TouchableOpacity>
          </View>
        )}

        <TouchableOpacity 
          style={styles.fab} 
          onPress={isMediaSelectorVisible ? () => setIsMediaSelectorVisible(false) : promptCameraAction} 
          activeOpacity={0.85}
          disabled={isSensorsLoading}
        >
          {isSensorsLoading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="small" color="#FFF" />
            </View>
          ) : (
            <View style={[styles.fabImage, { backgroundColor: PincTheme.colors.primary, borderRadius: 26, alignItems: "center", justifyContent: "center" }]}>
               <Image source={require("../assets/logo.png")} style={{ width: 80, height: 32 }} resizeMode="contain" />
            </View>
          )}
        </TouchableOpacity>
      </View>

      {/* Modal Composer Overlay */}
      <Modal 
        animationType="slide" 
        transparent={false} 
        visible={modalVisible}
        onRequestClose={handleCloseComposer}
      >
        <SafeAreaView style={styles.modalContainer}>
          <KeyboardAvoidingView 
            style={{ flex: 1 }} 
            behavior={Platform.OS === "ios" ? "padding" : undefined}
          >
          {/* Header */}
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={handleCloseComposer} disabled={isSubmitting}>
              <Text style={styles.cancelBtn}>{t("cancel")}</Text>
            </TouchableOpacity>
            
            <Text style={styles.modalTitle}>{t("realityCheck")}</Text>
            
            <TouchableOpacity 
              style={[styles.postBtn, (!text || isSubmitting) && styles.postBtnDisabled]} 
              onPress={handleSubmit}
              disabled={!text || isSubmitting}
            >
              {isSubmitting ? (
                <ActivityIndicator size="small" color="#FFF" />
              ) : (
                <Text style={styles.postBtnText}>{t("post")}</Text>
              )}
            </TouchableOpacity>
          </View>

          {/* Composer Body */}
          <ScrollView 
            style={styles.composerBody}
            contentContainerStyle={styles.composerBodyContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {/* Nearest Venue Geotag Indicator */}
            {nearestVenue ? (
              <View style={styles.venueIndicator}>
                <Text style={styles.venueIndicatorIcon}>📍</Text>
                <View style={styles.venueIndicatorMeta}>
                  <Text style={styles.venueIndicatorName}>{nearestVenue.name}</Text>
                  <Text style={styles.venueIndicatorDistance}>
                    {Math.round(distanceToVenue)}m away •{" "}
                    <Text style={isVerifiedLive ? styles.greenText : styles.amberText}>
                      {isVerifiedLive ? t("verifiedLive") : t("linkedLocation")}
                    </Text>
                  </Text>
                </View>
              </View>
            ) : (
              <View style={styles.venueIndicator}>
                <Text style={styles.venueIndicatorIcon}>⚠️</Text>
                <Text style={styles.venueIndicatorText}>{t("searchingVenues")}</Text>
              </View>
            )}

            {/* Post Photo/Video Frame */}
            {capturedPhoto && (
              <View style={styles.imageFrame}>
                {capturedMediaType === "video" ? (
                  <Video
                    source={{ uri: capturedPhoto }}
                    style={styles.previewImage}
                    resizeMode={ResizeMode.COVER}
                    shouldPlay
                    isLooping
                    isMuted
                  />
                ) : (
                  <Image source={{ uri: capturedPhoto }} style={styles.previewImage} />
                )}
                <View style={styles.rawRealityTag}>
                  <Text style={styles.rawText}>RAW CAMERA • UNEDITED</Text>
                </View>
              </View>
            )}

            {/* Post Type & Duration Combined Selector */}
            <View style={styles.postTypeToggleContainer}>
              {/* Option 1: Permanent Standard */}
              <TouchableOpacity
                style={[
                  styles.postTypeTab, 
                  postType === "standard" && postDuration === "permanent" && styles.postTypeTabActive
                ]}
                onPress={() => {
                  setPostType("standard");
                  setPostDuration("permanent");
                }}
                disabled={isSubmitting}
              >
                <Ionicons 
                  name="infinite" 
                  size={14} 
                  color={postType === "standard" && postDuration === "permanent" ? PincTheme.colors.textPrimary : PincTheme.colors.textSecondary} 
                />
                <Text style={[
                  styles.postTypeTabText, 
                  { fontSize: 11, marginLeft: -4 },
                  postType === "standard" && postDuration === "permanent" && styles.postTypeTabTextActive
                ]}>
                  {t("permanent")}
                </Text>
              </TouchableOpacity>
              
              {/* Option 2: 24h Reality Check */}
              <TouchableOpacity
                style={[
                  styles.postTypeTab, 
                  postType === "standard" && postDuration === "24h" && styles.postTypeTabActive
                ]}
                onPress={() => {
                  setPostType("standard");
                  setPostDuration("24h");
                }}
                disabled={isSubmitting}
              >
                <Ionicons 
                  name="time" 
                  size={14} 
                  color={postType === "standard" && postDuration === "24h" ? PincTheme.colors.textPrimary : PincTheme.colors.textSecondary} 
                />
                <Text style={[
                  styles.postTypeTabText, 
                  { fontSize: 11, marginLeft: -4 },
                  postType === "standard" && postDuration === "24h" && styles.postTypeTabTextActive
                ]}>
                  {t("24h")}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.postTypeTab, 
                  postType === "live_news" && styles.postTypeTabActive
                ]}
                onPress={() => {
                  setPostType("live_news");
                  setPostDuration("24h");
                }}
                disabled={isSubmitting}
              >
                <View style={styles.liveNewsIconContainer}>
                  <Text style={[styles.liveNewsBlinkText, { fontSize: 9 }]}>{t("liveNews")}</Text>
                  <View style={styles.liveNewsIcon} />
                </View>
              </TouchableOpacity>
            </View>

            {/* Text Input (Caption / Description) */}
            <TextInput
              style={styles.textInput}
              placeholder={postType === "live_news" ? t("liveNewsPlaceholder") : t("standardPlaceholder")}
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

            {/* Music Picker (Horizontal Scroll) */}
            <View style={styles.horizontalMusicContainer}>
              <Text style={styles.musicPickerTitle}>{t("musicPickerTitle")}</Text>
              <ScrollView 
                horizontal 
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.horizontalMusicScroll}
              >
                {MOCK_TRACKS.map((track) => {
                  const isSelected = selectedTrack.id === track.id;
                  const isPlaying = playingTrackId === track.id;
                  return (
                    <TouchableOpacity
                      key={track.id}
                      style={[
                        styles.horizontalMusicItem,
                        isSelected && styles.horizontalMusicItemSelected
                      ]}
                      onPress={() => setSelectedTrack(track)}
                      activeOpacity={0.8}
                    >
                      <TouchableOpacity
                        style={styles.playPauseBtnInline}
                        onPress={() => handlePlayPreview(track)}
                      >
                        <Ionicons 
                          name={isPlaying ? "pause-circle" : "play-circle"} 
                          size={28} 
                          color={isPlaying ? "#FF6B6B" : "#FFF"} 
                        />
                      </TouchableOpacity>
                      <Text style={[styles.horizontalMusicTitle, isSelected && { color: "#FF6B6B" }]} numberOfLines={1}>
                        {track.id === "original" ? t("originalAudio") : track.title}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>

          </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  fabContainer: {
    position: "absolute",
    bottom: Platform.OS === "ios" ? 85 : 100,
    left: 0,
    right: 0,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 99
  },
  fab: {
    backgroundColor: "transparent",
    alignItems: "center",
    justifyContent: "center",
    // Premium soft narrow 3D drop shadow
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.16,
    shadowRadius: 6,
    elevation: 5,
  },
  fabImage: {
    width: 120,
    height: 52,
  },
  loadingContainer: {
    width: 120,
    height: 52,
    borderRadius: 26,
    backgroundColor: "#E4007F", // matches the pink background of the button logo
    alignItems: "center",
    justifyContent: "center"
  },
  mediaSelectorPopup: {
    backgroundColor: "rgba(0, 0, 0, 0.75)",
    borderRadius: 20,
    paddingHorizontal: 8,
    paddingVertical: 10,
    marginBottom: 12,
    flexDirection: "row",
    alignItems: "center",
  },
  mediaSelectorOption: {
    paddingHorizontal: 16,
  },
  mediaSelectorText: {
    color: "#E4007F",
    fontSize: 15,
    fontWeight: "bold",
    fontFamily: PincTheme.fonts.heading
  },
  mediaSelectorDivider: {
    width: 1,
    height: 16,
    backgroundColor: "rgba(255, 255, 255, 0.3)",
    marginHorizontal: 4,
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
  },
  composerBodyContent: {
    padding: 16,
    paddingBottom: 40
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
  },
  postTypeToggleContainer: {
    flexDirection: "row",
    backgroundColor: PincTheme.colors.border,
    borderRadius: PincTheme.borderRadius.sm,
    padding: 2,
    marginBottom: 12
  },
  postTypeTab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: PincTheme.borderRadius.sm - 2,
    flexDirection: "row",
    gap: 8
  },
  postTypeTabActive: {
    backgroundColor: PincTheme.colors.card,
    ...PincTheme.shadows.sm
  },
  postTypeTabText: {
    fontSize: 13,
    fontWeight: "600",
    color: PincTheme.colors.textSecondary,
    fontFamily: PincTheme.fonts.body
  },
  postTypeTabTextActive: {
    color: PincTheme.colors.textPrimary
  },
  standardIcon: {
    width: 14,
    height: 14,
    borderWidth: 2,
    borderColor: PincTheme.colors.textSecondary,
    borderRadius: 2
  },
  liveNewsIconContainer: {
    alignItems: "center"
  },
  liveNewsBlinkText: {
    fontSize: 8,
    fontWeight: "900",
    color: PincTheme.colors.crowdRed,
    marginBottom: 2
  },
  liveNewsIcon: {
    width: 14,
    height: 14,
    backgroundColor: PincTheme.colors.crowdRed,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: PincTheme.colors.crowdRedLight
  },
  situationInput: {
    backgroundColor: PincTheme.colors.card,
    borderWidth: 1,
    borderColor: PincTheme.colors.border,
    borderRadius: PincTheme.borderRadius.md,
    padding: 12,
    fontSize: 14,
    fontFamily: PincTheme.fonts.body,
    color: PincTheme.colors.textPrimary,
    marginBottom: 12
  },
  horizontalMusicContainer: {
    marginTop: 16,
    marginBottom: 8,
  },
  musicPickerTitle: {
    fontSize: 13,
    fontWeight: "bold",
    color: PincTheme.colors.textPrimary,
    marginBottom: 10,
    fontFamily: PincTheme.fonts.heading
  },
  horizontalMusicScroll: {
    paddingRight: 16,
    gap: 12
  },
  horizontalMusicItem: {
    backgroundColor: "#2C2C2E",
    borderRadius: 12,
    padding: 10,
    width: 140,
    borderWidth: 1.5,
    borderColor: "transparent",
    alignItems: "center",
  },
  horizontalMusicItemSelected: {
    borderColor: "#FF6B6B",
    backgroundColor: "rgba(255, 107, 107, 0.1)"
  },
  horizontalMusicTitle: {
    color: "#FFF",
    fontSize: 11,
    marginTop: 8,
    textAlign: "center",
    fontFamily: PincTheme.fonts.body
  },
  playPauseBtnInline: {
    marginBottom: 4
  }
});
