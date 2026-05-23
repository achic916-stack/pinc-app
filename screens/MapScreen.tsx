import React, { useState, useRef, useMemo, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  SafeAreaView,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Animated,
  Keyboard,
  Modal,
  PanResponder,
  Platform
} from "react-native";
import * as Location from "expo-location";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { Marker, PROVIDER_GOOGLE } from "react-native-maps";
import MapView from "react-native-map-clustering";
const Audio = { Sound: { createAsync: async () => ({ sound: { playAsync: async () => {}, stopAsync: async () => {}, unloadAsync: async () => {} } }) }, setAudioModeAsync: async () => {} }; const Video = () => null; const ResizeMode = { COVER: 'cover', CONTAIN: 'contain' };

import { CachedVideo } from "../components/CachedVideo";
import { PincTheme } from "../styles/theme";
import { Venue, Pin, isCampaignActive, auth } from "../services/firebase";
import { useTranslation } from 'react-i18next';
import { ReelsFeedModal } from "../components/ReelsFeedModal";

const isVideoUrl = (url: string | null | undefined): boolean => {
  if (!url) return false;
  const urlLower = url.toLowerCase();
  return (
    urlLower.endsWith(".mp4") || 
    urlLower.endsWith(".mov") || 
    urlLower.endsWith(".m4v") || 
    urlLower.endsWith(".3gp") ||
    urlLower.includes("video") ||
    urlLower.includes(".mp4?") ||
    urlLower.includes(".mov?")
  );
};

interface MapScreenProps {
  venues: Venue[];
  allPins: Pin[];
  userLocation: { latitude: number; longitude: number } | null;
  onSelectVenue: (venue: Venue) => void;
  isLoadingVenues: boolean;
  onOpenSettings?: () => void;
  followingVenueIds?: Set<string>;
  locale?: "en" | "th";
  cameraTarget?: { latitude: number; longitude: number; timestamp: number } | null;
  focusSearchTrigger?: number;
  selectedMemoryPin?: Pin | null;
  onClearMemory?: () => void;
}

// Minimal/Light Lifestyle Map Styling for Google Maps
const minimalMapStyle = [
  {
    featureType: "all",
    elementType: "geometry.fill",
    stylers: [{ color: "#FDFBF7" }]
  },
  {
    featureType: "all",
    elementType: "labels.text.fill",
    stylers: [{ color: "#5E5950" }]
  },
  {
    featureType: "all",
    elementType: "labels.text.stroke",
    stylers: [{ color: "#FFFFFF" }]
  },
  {
    featureType: "water",
    elementType: "geometry.fill",
    stylers: [{ color: "#E0E9ED" }]
  },
  {
    featureType: "landscape",
    elementType: "geometry.fill",
    stylers: [{ color: "#FAF6EF" }]
  },
  {
    featureType: "poi",
    elementType: "all",
    stylers: [{ visibility: "off" }]
  },
  {
    featureType: "poi.park",
    elementType: "geometry.fill",
    stylers: [{ color: "#E8F0E6" }, { visibility: "on" }]
  },
  {
    featureType: "road",
    elementType: "geometry",
    stylers: [{ color: "#FFFFFF" }]
  },
  {
    featureType: "road",
    elementType: "labels",
    stylers: [{ visibility: "simplified" }]
  },
  {
    featureType: "transit",
    elementType: "all",
    stylers: [{ visibility: "off" }]
  }
];

// Glowing Radar Pulse Animation component for Tier 2 Sponsorship
const RadarPulse: React.FC = () => {
  const scaleVal = useRef(new Animated.Value(1)).current;
  const opacityVal = useRef(new Animated.Value(0.7)).current;

  useEffect(() => {
    Animated.loop(
      Animated.parallel([
        Animated.timing(scaleVal, {
          toValue: 2.3,
          duration: 1800,
          useNativeDriver: true,
        }),
        Animated.timing(opacityVal, {
          toValue: 0,
          duration: 1800,
          useNativeDriver: true,
        })
      ])
    ).start();
  }, []);

  return (
    <Animated.View
      style={[
        styles.radarPulseRing,
        {
          transform: [{ scale: scaleVal }],
          opacity: opacityVal
        }
      ]}
    />
  );
};

const BlinkingLiveNewsBadge: React.FC = () => {
  const opacityVal = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(opacityVal, { toValue: 0.3, duration: 600, useNativeDriver: true }),
        Animated.timing(opacityVal, { toValue: 1, duration: 600, useNativeDriver: true })
      ])
    ).start();
  }, []);
  return (
    <Animated.View style={[styles.liveNewsBadge, { opacity: opacityVal }]}>
      <Text style={styles.liveNewsBadgeText}>LIVE NEWS</Text>
    </Animated.View>
  );
};

export const MapScreen: React.FC<MapScreenProps> = ({
  venues,
  allPins = [],
  userLocation,
  onSelectVenue,
  isLoadingVenues,
  onOpenSettings,
  followingVenueIds = new Set<string>(),
  locale = "en",
  cameraTarget = null,
  focusSearchTrigger = 0,
  selectedMemoryPin = null,
  onClearMemory
}) => {
  const { t } = useTranslation();
  const mapRef = useRef<MapView | null>(null);
  const searchInputRef = useRef<TextInput | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [isSearchVisible, setIsSearchVisible] = useState(false);
  const [isFilterFriends, setIsFilterFriends] = useState(false);
  const [markerTracksViewChanges, setMarkerTracksViewChanges] = useState<Record<string, boolean>>({});
  const [reelsFeedPins, setReelsFeedPins] = useState<Pin[]>([]);

  // Effect to autofocus search bar on trigger
  useEffect(() => {
    if (focusSearchTrigger && focusSearchTrigger > 0) {
      setIsSearchVisible(true);
      setTimeout(() => {
        if (searchInputRef.current) searchInputRef.current.focus();
      }, 100);
    }
  }, [focusSearchTrigger]);

  // Effect to pan map camera on target change
  useEffect(() => {
    if (cameraTarget && mapRef.current) {
      (mapRef.current as any).animateToRegion({
        latitude: cameraTarget.latitude,
        longitude: cameraTarget.longitude,
        latitudeDelta: 0.008,
        longitudeDelta: 0.008
      }, 1000);
    }
  }, [cameraTarget]);

  // Handle selected memory pin (Fly-to animation and auto open timeline)
  const [isMemorySheetVisible, setIsMemorySheetVisible] = useState(false);
  useEffect(() => {
    if (selectedMemoryPin && mapRef.current) {
      setIsMemorySheetVisible(false);
      
      const coordinate = { 
        latitude: selectedMemoryPin.latitude, 
        longitude: selectedMemoryPin.longitude 
      };
      
      // Fly to animation
      (mapRef.current as any).animateCamera({
        center: coordinate,
        pitch: 45,
        zoom: 18,
      }, { duration: 1500 });

      // Open memory sheet after animation completes
      const timeoutId = setTimeout(() => {
        setIsMemorySheetVisible(true);
      }, 1600);

      return () => clearTimeout(timeoutId);
    }
  }, [selectedMemoryPin]);

  // Time-Decay Logic: filter out expired pins
  const validPins = useMemo(() => {
    const now = Date.now();
    return allPins.filter(pin => {
      const pinTime = new Date(pin.timestamp).getTime();
      const ageHours = (now - pinTime) / (1000 * 60 * 60);
      if (pin.post_type === "live_news") {
        return ageHours <= 6;
      } else {
        return ageHours <= 24;
      }
    });
  }, [allPins]);

  // Lifted helper: find latest pin + photo URL for a venue
  const getVenueLatestPhoto = React.useCallback((v: Venue) => {
    const venuePins = validPins.filter(pin => pin.venueId === v.venueId);
    let photoUrl = v.cover_image;
    let latestPin = venuePins.length > 0 ? venuePins[0] : null;

    if (latestPin) {
      photoUrl = (latestPin.media_type === "video" && latestPin.thumbnail_url) 
        ? latestPin.thumbnail_url 
        : latestPin.image_url;
    }

    const timestamp = latestPin ? new Date(latestPin.timestamp).getTime() : 0;
    return { photoUrl, timestamp, latestPin };
  }, [validPins]);
  
  // Dynamic zoom scale and region delta tracking
  const [zoomScale, setZoomScale] = useState(1.0);
  const [regionDelta, setRegionDelta] = useState({ latitudeDelta: 0.015, longitudeDelta: 0.015 });
  const [tracksViewChangesDuringZoom, setTracksViewChangesDuringZoom] = useState(false);

  const handleRegionChange = () => {
    if (!tracksViewChangesDuringZoom) {
      setTracksViewChangesDuringZoom(true);
    }
  };

  const handleRegionChangeComplete = (region: { latitude: number; longitude: number; latitudeDelta: number; longitudeDelta: number }) => {
    // Calculate custom zoom scale based on current latitudeDelta relative to base delta (0.015)
    const baseDelta = 0.015;
    const calculatedScale = baseDelta / (region.latitudeDelta || baseDelta);
    // Clamp scale to keep icons legible (between 0.4 and 1.8)
    const clampedScale = Math.max(0.4, Math.min(1.8, calculatedScale));
    
    setZoomScale(clampedScale);
    setRegionDelta({
      latitudeDelta: region.latitudeDelta || 0.015,
      longitudeDelta: region.longitudeDelta || 0.015
    });

    // Keep tracking view changes for a short duration to let the scale update render natively, then disable
    setTimeout(() => {
      setTracksViewChangesDuringZoom(false);
    }, 600);
  };

  // Default Center coordinates if GPS is loading (Bangkok central café district as default)
  const defaultRegion = {
    latitude: 13.736717,
    longitude: 100.560481,
    latitudeDelta: 0.015,
    longitudeDelta: 0.015
  };

  const initialRegion = userLocation
    ? {
        ...userLocation,
        latitudeDelta: 0.015,
        longitudeDelta: 0.015
      }
    : defaultRegion;

  // Filter venues based on isFilterFriends state
  const displayedVenues = useMemo(() => {
    if (!isFilterFriends) return venues;
    return venues.filter((venue) => followingVenueIds.has(venue.venueId));
  }, [venues, isFilterFriends, followingVenueIds]);

  // Dynamic Greedy Clustering algorithm removed in favor of react-native-map-clustering

  // Search filter and prioritize sponsored sorting logic
  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const queryStr = searchQuery.toLowerCase().trim();
    
    const matched = displayedVenues.filter((venue) => 
      venue.name.toLowerCase().includes(queryStr) || 
      venue.category.toLowerCase().includes(queryStr)
    );

    // Prioritize active sponsored pins at the top of the search result list
    return matched.sort((a, b) => {
      const isSponsoredA = isCampaignActive(a) ? 1 : 0;
      const isSponsoredB = isCampaignActive(b) ? 1 : 0;
      return isSponsoredB - isSponsoredA; // Sponsored (1) comes before Non-sponsored (0)
    });
  }, [searchQuery, displayedVenues]);

  const handleSelectSearchResult = (venue: Venue) => {
    setSearchQuery("");
    setIsSearchFocused(false);
    setIsSearchVisible(false);
    Keyboard.dismiss();

    if (mapRef.current) {
      (mapRef.current as any).animateToRegion({
        latitude: venue.latitude,
        longitude: venue.longitude,
        latitudeDelta: 0.008,
        longitudeDelta: 0.008
      }, 1000);
    }
    onSelectVenue(venue);
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* 1. Sand Aesthetic prioritized Search Bar */}
      <View style={[styles.searchContainer, !isSearchVisible && { display: 'none' }]}>
        <View style={[styles.searchBar, isSearchFocused && styles.searchBarActive]}>
          <Text style={styles.searchIcon}>🔍</Text>
          <TextInput
            ref={searchInputRef}
            style={styles.searchInput}
            placeholder="Search cafes or categories..."
            placeholderTextColor={PincTheme.colors.textSecondary}
            value={searchQuery}
            onChangeText={setSearchQuery}
            onFocus={() => setIsSearchFocused(true)}
            onBlur={() => {
              setTimeout(() => {
                setIsSearchFocused(false);
                if (!searchQuery) setIsSearchVisible(false);
              }, 200);
            }}
          />
          <TouchableOpacity 
            onPress={() => {
              setSearchQuery("");
              setIsSearchVisible(false);
              Keyboard.dismiss();
            }} 
            style={styles.clearButton}
          >
            <Text style={styles.clearButtonText}>✕</Text>
          </TouchableOpacity>
        </View>

        {/* Search dropdown list */}
        {isSearchFocused && searchQuery.trim().length > 0 && (
          <View style={styles.dropdownContainer}>
            {searchResults.length === 0 ? (
              <View style={styles.emptyResult}>
                <Text style={styles.emptyResultText}>No cafes found</Text>
              </View>
            ) : (
              <ScrollView 
                keyboardShouldPersistTaps="handled"
                style={styles.dropdownScroll}
              >
                {searchResults.map((venue) => {
                  const sponsored = isCampaignActive(venue);
                  return (
                    <TouchableOpacity
                      key={venue.venueId}
                      style={[styles.resultItem, sponsored && styles.resultItemSponsored]}
                      onPress={() => handleSelectSearchResult(venue)}
                    >
                      {sponsored && venue.custom_icon_url ? (
                        <Image source={{ uri: venue.custom_icon_url }} style={styles.resultLogo} />
                      ) : (
                        <View style={styles.resultCategoryPlaceholder}>
                          <Text style={{ fontSize: 14 }}>☕</Text>
                        </View>
                      )}
                      
                      <View style={styles.resultTextContainer}>
                        <Text style={styles.resultName}>{venue.name}</Text>
                        <Text style={styles.resultCategory}>{venue.category.toUpperCase()}</Text>
                      </View>



                      {sponsored && (
                        <View style={styles.sponsoredBadge}>
                          <Text style={styles.sponsoredBadgeText}>✓ SPONSORED</Text>
                        </View>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            )}
          </View>
        )}
      </View>

      {/* Floating Toggle Pills Row (Always Visible) */}
      <View style={styles.togglesContainer}>
        <TouchableOpacity
          style={[styles.togglePill, isFilterFriends && styles.togglePillActive]}
          onPress={() => setIsFilterFriends(prev => !prev)}
          activeOpacity={0.8}
        >
          <Text style={[styles.toggleText, isFilterFriends && styles.toggleTextActive]}>
            👥 {t("friendsOnly")}
          </Text>
        </TouchableOpacity>
      </View>

      {isLoadingVenues && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="small" color={PincTheme.colors.primary} />
          <Text style={styles.loadingText}>Loading local spots...</Text>
        </View>
      )}

      {/* 2. Map view rendering */}
      <MapView
        ref={mapRef}
        provider={PROVIDER_GOOGLE}
        style={styles.map}
        initialRegion={initialRegion}
        customMapStyle={minimalMapStyle}
        showsUserLocation
        showsMyLocationButton={false}
        onRegionChange={handleRegionChange}
        onRegionChangeComplete={handleRegionChangeComplete}
        clusterColor={PincTheme.colors.primary}
        clusterTextColor="#FFFFFF"
      >
        {displayedVenues.map((venue) => {
          const sponsored = isCampaignActive(venue);
          const { photoUrl, latestPin } = getVenueLatestPhoto(venue);
          const isLiveNews = latestPin?.post_type === "live_news";
          
          return (
            <Marker
              key={venue.venueId}
              coordinate={
                latestPin 
                  ? { latitude: latestPin.latitude, longitude: latestPin.longitude }
                  : { latitude: venue.latitude, longitude: venue.longitude }
              }
              onPress={() => {
                const venuePins = validPins.filter(pin => pin.venueId === venue.venueId);
                if (venuePins.length > 0) {
                  setReelsFeedPins(venuePins);
                } else {
                  onSelectVenue(venue);
                }
              }}
              tracksViewChanges={
                tracksViewChangesDuringZoom || 
                latestPin?.media_type === "video" || 
                isVideoUrl(photoUrl) ||
                (markerTracksViewChanges[venue.venueId] ?? true)
              }
              anchor={sponsored ? { x: 0.5, y: 0.5 } : isLiveNews ? { x: 0.5, y: 0.5 } : { x: 0.5, y: 0.68 }}
            >


              {sponsored ? (
                /* OVERRIDE: Render Sponsored Pin UI Overrides */
                <View style={[styles.customMarkerContainer, { transform: [{ scale: zoomScale * (venue.sponsor_tier === 3 ? 1.05 : 1.0) }] }]}>
                  <View style={{ alignItems: "center", justifyContent: "center", paddingBottom: 15 }}>
                    {/* Glowing Radar Pulse Effect for Tier 3 Sponsorship */}
                    {venue.sponsor_tier === 3 && <RadarPulse />}

                    {(() => {
                      const cardPaddingTop = 17; // Always show name for sponsored venues
                      const tier = venue.sponsor_tier || 1;
                      
                      let borderColor = "#A6A6A6"; // Tier 1: Silver
                      if (tier === 2) borderColor = "#FFC107"; // Tier 2: Gold
                      if (tier === 3) borderColor = "#FF4B72"; // Tier 3: Pink

                      return (
                        <>
                          {/* Concentric shadows */}
                          <View style={[styles.photoPinCard, styles.concentricShadow1, { paddingTop: cardPaddingTop, borderColor: borderColor }]} />
                          <View style={[styles.photoPinCard, styles.concentricShadow2, { paddingTop: cardPaddingTop, borderColor: borderColor }]} />

                          {/* Front Card */}
                          <View style={[styles.photoPinCard, { paddingTop: cardPaddingTop, paddingBottom: 3, justifyContent: "flex-end", borderColor: borderColor, borderWidth: tier >= 2 ? 2.5 : 1.5 }]}>
                            {/* Name inside the top part of the card */}
                            <View style={{ position: "absolute", top: 0, left: 0, right: 0, height: cardPaddingTop, justifyContent: "center", alignItems: "center" }}>
                              <Text 
                                style={{ 
                                  fontSize: 11, 
                                  fontWeight: "800", 
                                  color: PincTheme.colors.textPrimary, 
                                  width: "95%", 
                                  textAlign: "center",
                                  includeFontPadding: false
                                }} 
                                numberOfLines={1}
                              >
                                {venue.name}
                              </Text>
                            </View>

                            <View style={styles.imageWrapper}>
                              {latestPin?.media_type === "video" || isVideoUrl(photoUrl) ? (
                                <View style={{ width: 68, height: 68, borderRadius: 4, overflow: 'hidden' }}>
                                  {photoUrl && !isVideoUrl(photoUrl) ? (
                                    <Image source={{ uri: photoUrl }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                                  ) : (
                                    <View style={{ width: '100%', height: '100%', backgroundColor: PincTheme.colors.card }} />
                                  )}
                                  <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.3)' }}>
                                    <Ionicons name="play" size={24} color={PincTheme.colors.primary} />
                                  </View>
                                </View>
                              ) : (
                                <Image 
                                  key={venue.custom_icon_url || photoUrl || venue.cover_image}
                                  source={{ uri: venue.custom_icon_url || photoUrl || venue.cover_image }} 
                                  style={[styles.photoPinImage, { width: 68, height: 68, borderRadius: 4 }]} 
                                  resizeMode="cover" 
                                  onLoadEnd={() => setMarkerTracksViewChanges(prev => ({ ...prev, [venue.venueId]: false }))} 
                                />
                              )}
                            </View>
                          </View>
                        </>
                      );
                    })()}
                  </View>
                  
                  {/* Triangular Marker Pointer (Colored by Tier) */}
                  <View style={[
                    styles.photoPinPointer, 
                    { 
                      borderTopColor: (venue.sponsor_tier || 1) === 1 ? "#A6A6A6" : ((venue.sponsor_tier || 1) === 2 ? "#FFC107" : "#FF4B72") 
                    }
                  ]} />
                </View>
              ) : isLiveNews ? (
                /* LIVE NEWS: Render Custom Circular Photo Pin */
                <View style={[styles.customMarkerContainer, { transform: [{ scale: zoomScale }] }]}>
                  {/* Labels removed by user request, keeping only LIVE NEWS badge */}

                  <BlinkingLiveNewsBadge />

                  <View style={{ alignItems: "center", justifyContent: "center" }}>
                    {/* Concentric shadows for Android blur effect */}
                    <View style={[styles.livePhotoPinCard, styles.concentricShadow1]} />
                    <View style={[styles.livePhotoPinCard, styles.concentricShadow2]} />

                    <View style={styles.livePhotoPinCard}>
                      <View style={styles.liveImageWrapper}>
                        {latestPin?.media_type === "video" || isVideoUrl(photoUrl) ? (
                          <View style={{ width: 62, height: 62, borderRadius: 31, overflow: 'hidden' }}>
                            {photoUrl && !isVideoUrl(photoUrl) ? (
                              <Image source={{ uri: photoUrl }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                            ) : (
                              <View style={{ width: '100%', height: '100%', backgroundColor: PincTheme.colors.card }} />
                            )}
                            <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.3)' }}>
                              <Ionicons name="play" size={20} color={PincTheme.colors.primary} />
                            </View>
                          </View>
                        ) : (
                          <Image 
                            key={photoUrl}
                            source={{ uri: photoUrl }} 
                            style={[styles.photoPinImage, { width: 62, height: 62, borderRadius: 31 }]} 
                            resizeMode="cover" 
                            onLoadEnd={() => setMarkerTracksViewChanges(prev => ({ ...prev, [venue.venueId]: false }))} 
                          />
                        )}
                      </View>
                    </View>
                  </View>
                </View>
              ) : (
                /* STANDARD: Render Custom white-bordered Photo Pin */
                <View style={[styles.customMarkerContainer, { transform: [{ scale: zoomScale }] }]}>
                  <View style={{ alignItems: "center", justifyContent: "center", paddingBottom: 15 }}>
                    {/* Dynamic styles for the expanded card */}
                    {(() => {
                      const showName = latestPin?.username || !venue.name.includes("Current Location");
                      const displayName = latestPin?.username || venue.name;
                      const cardPaddingTop = showName ? 17 : 3;

                      return (
                        <>
                          {/* Concentric shadows for Android blur effect */}
                          <View style={[styles.photoPinCard, styles.concentricShadow1, { paddingTop: cardPaddingTop }]} />
                          <View style={[styles.photoPinCard, styles.concentricShadow2, { paddingTop: cardPaddingTop }]} />

                          {/* Front Card */}
                          <View style={[styles.photoPinCard, { paddingTop: cardPaddingTop, paddingBottom: 3, justifyContent: "flex-end" }]}>
                            {/* Name inside the top part of the card */}
                            {showName && (
                              <View style={{ position: "absolute", top: 0, left: 0, right: 0, height: cardPaddingTop, justifyContent: "center", alignItems: "center" }}>
                                <Text 
                                  style={{ 
                                    fontSize: 11, 
                                    fontWeight: "800", 
                                    color: PincTheme.colors.textPrimary, 
                                    width: "95%", 
                                    textAlign: "center",
                                    includeFontPadding: false
                                  }} 
                                  numberOfLines={1}
                                >
                                  {displayName}
                                </Text>
                              </View>
                            )}

                            <View style={styles.imageWrapper}>
                              {latestPin?.media_type === "video" || isVideoUrl(photoUrl) ? (
                                <View style={{ width: 68, height: 68, borderRadius: 4, overflow: 'hidden' }}>
                                  {photoUrl && !isVideoUrl(photoUrl) ? (
                                    <Image source={{ uri: photoUrl }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                                  ) : (
                                    <View style={{ width: '100%', height: '100%', backgroundColor: PincTheme.colors.card }} />
                                  )}
                                  <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.3)' }}>
                                    <Ionicons name="play" size={24} color={PincTheme.colors.primary} />
                                  </View>
                                </View>
                              ) : (
                                <Image 
                                  key={photoUrl}
                                  source={{ uri: photoUrl }} 
                                  style={[styles.photoPinImage, { width: 68, height: 68, borderRadius: 4 }]} 
                                  resizeMode="cover" 
                                  onLoadEnd={() => setMarkerTracksViewChanges(prev => ({ ...prev, [venue.venueId]: false }))} 
                                />
                              )}
                            </View>
                          </View>
                        </>
                      );
                    })()}
                  </View>
                  
                  {/* Triangular Marker Pointer */}
                  <View style={styles.photoPinPointer} />
                </View>
              )}
            </Marker>
          );
        })}
        {/* Render Custom Red Pin for Selected Memory */}
        {selectedMemoryPin && (
          <Marker
            coordinate={{ latitude: selectedMemoryPin.latitude, longitude: selectedMemoryPin.longitude }}
            tracksViewChanges={false}
            zIndex={9999}
          >
            <View style={{ alignItems: 'center', justifyContent: 'center' }}>
              <View style={{ position: 'absolute', width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255, 59, 48, 0.4)' }} />
              <Ionicons name="location" size={48} color="#FF3B30" />
            </View>
          </Marker>
        )}

      </MapView>

      {/* Memory Timeline Modal */}
      <ReelsFeedModal
        visible={isMemorySheetVisible && !!selectedMemoryPin}
        pins={selectedMemoryPin ? [selectedMemoryPin] : []}
        onClose={() => {
          setIsMemorySheetVisible(false);
          if (onClearMemory) onClearMemory();
        }}
        currentUserId={""} // Pass appropriately if needed
      />

      {/* Main Bottom Dashboard Tab Bar Overlay */}
      <TouchableOpacity 
        style={styles.gpsButton}
        onPress={async () => {
          try {
            // First attempt to grab latest location dynamically for maximum accuracy
            const { status } = await Location.requestForegroundPermissionsAsync();
            if (status !== 'granted') {
              console.warn("Location permission denied");
              return;
            }
            const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
            if (mapRef.current) {
              const region = {
                latitude: loc.coords.latitude,
                longitude: loc.coords.longitude,
                latitudeDelta: 0.015,
                longitudeDelta: 0.015,
              };
              const mapObj = mapRef.current as any;
              if (typeof mapObj.animateToRegion === 'function') {
                mapObj.animateToRegion(region, 1000);
              } else if (typeof mapObj.getMapRef === 'function') {
                mapObj.getMapRef().animateToRegion(region, 1000);
              }
            }
          } catch (error) {
            console.warn("Failed to get location on GPS button press", error);
            // Fallback to userLocation state
            if (userLocation && mapRef.current) {
              const region = {
                latitude: userLocation.latitude,
                longitude: userLocation.longitude,
                latitudeDelta: 0.015,
                longitudeDelta: 0.015,
              };
              const mapObj = mapRef.current as any;
              if (typeof mapObj.animateToRegion === 'function') {
                mapObj.animateToRegion(region, 1000);
              } else if (typeof mapObj.getMapRef === 'function') {
                mapObj.getMapRef().animateToRegion(region, 1000);
              }
            }
          }
        }}
        activeOpacity={0.8}
      >
        <Ionicons name="locate" size={24} color={PincTheme.colors.primary} />
      </TouchableOpacity>

      {/* IG Reels-Style Feed */}
      <ReelsFeedModal 
        visible={reelsFeedPins.length > 0}
        pins={reelsFeedPins}
        onClose={() => setReelsFeedPins([])}
        currentUserId={auth.currentUser?.uid || ""}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: PincTheme.colors.background
  },
  map: {
    ...StyleSheet.absoluteFillObject
  },
  gpsButton: {
    position: "absolute",
    top: Platform.OS === 'android' ? 110 : 120,
    right: 16,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#FFFFFF",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 998,
    ...PincTheme.shadows.md,
  },
  searchContainer: {
    position: "absolute",
    top: 50,
    left: 16,
    right: 16,
    zIndex: 999,
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FDFBF7EF",
    borderWidth: 1.5,
    borderColor: PincTheme.colors.border,
    borderRadius: 24,
    paddingHorizontal: 16,
    height: 48,
    ...PincTheme.shadows.md
  },
  searchBarActive: {
    borderColor: PincTheme.colors.primary,
    backgroundColor: "#FFFFFF"
  },
  searchIcon: {
    fontSize: 16,
    marginRight: 8,
    color: PincTheme.colors.textSecondary
  },
  searchInput: {
    flex: 1,
    height: "100%",
    fontSize: 14,
    color: PincTheme.colors.textPrimary,
    fontFamily: PincTheme.fonts.body
  },
  clearButton: {
    padding: 6
  },
  clearButtonText: {
    color: PincTheme.colors.textSecondary,
    fontSize: 14,
    fontWeight: "bold"
  },
  dropdownContainer: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: PincTheme.colors.border,
    marginTop: 8,
    maxHeight: 250,
    ...PincTheme.shadows.lg,
    overflow: "hidden"
  },
  dropdownScroll: {
    paddingVertical: 6
  },
  emptyResult: {
    padding: 16,
    alignItems: "center"
  },
  emptyResultText: {
    color: PincTheme.colors.textSecondary,
    fontSize: 13,
    fontFamily: PincTheme.fonts.body
  },
  resultItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 0.5,
    borderBottomColor: PincTheme.colors.border
  },
  resultItemSponsored: {
    backgroundColor: "rgba(255, 75, 114, 0.03)"
  },
  resultLogo: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: "#FF4B72"
  },
  resultCategoryPlaceholder: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#FAF6EF",
    alignItems: "center",
    justifyContent: "center"
  },
  resultTextContainer: {
    flex: 1,
    marginLeft: 12
  },
  resultName: {
    fontSize: 14,
    fontWeight: "600",
    color: PincTheme.colors.textPrimary,
    fontFamily: PincTheme.fonts.heading
  },
  resultCategory: {
    fontSize: 10,
    fontWeight: "700",
    color: PincTheme.colors.textSecondary,
    letterSpacing: 0.5,
    marginTop: 2
  },
  sponsoredBadge: {
    backgroundColor: PincTheme.colors.primary + "1A",
    borderWidth: 1,
    borderColor: PincTheme.colors.primary,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 3
  },
  sponsoredBadgeText: {
    color: PincTheme.colors.primary,
    fontSize: 8,
    fontWeight: "800",
    letterSpacing: 0.5
  },
  loadingOverlay: {
    position: "absolute",
    top: 110,
    left: 20,
    right: 20,
    backgroundColor: PincTheme.colors.glassCard,
    padding: 8,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 99,
    borderWidth: 1,
    borderColor: PincTheme.colors.border,
    ...PincTheme.shadows.sm
  },
  loadingText: {
    marginLeft: 6,
    fontFamily: PincTheme.fonts.heading,
    fontWeight: "bold",
    color: PincTheme.colors.textPrimary,
    fontSize: 11
  },
  customMarkerContainer: {
    alignItems: "center",
    justifyContent: "center",
    width: 250,
    height: 250
  },
    floatingUsernameText: {
    position: "absolute",
    top: 12,
    color: "#000000",
    fontWeight: "bold",
    fontFamily: PincTheme.fonts.heading,
    fontSize: 12,
    textShadowColor: "#FFFFFF",
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 2,
    zIndex: 20
  },
  photoPinCard: {
    width: 76,
    minHeight: 76,
    borderRadius: 8,
    backgroundColor: "#FFFFFF",
    padding: 3,
    borderWidth: 1.5,
    borderColor: "#FFFFFF",
    // Very strong drop shadow for maximum pop against map
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.5,
    shadowRadius: 10,
    elevation: 18,
    justifyContent: "center",
    alignItems: "center",
    zIndex: 10
  },
  concentricShadow1: {
    position: "absolute",
    backgroundColor: "rgba(0,0,0,0.06)",
    borderColor: "transparent",
    borderWidth: 0,
    borderRadius: 8,
    transform: [{ scale: 1.15 }],
    top: 2,
    zIndex: 1
  },
  concentricShadow2: {
    position: "absolute",
    backgroundColor: "rgba(0,0,0,0.15)",
    borderColor: "transparent",
    borderWidth: 0,
    borderRadius: 8,
    transform: [{ scale: 1.05 }],
    top: 1,
    zIndex: 2
  },
  imageWrapper: {
    width: 68,
    height: 68,
    borderRadius: 4,
    backgroundColor: "#FDFBF7"
  },
  photoPinImage: {
    width: "100%",
    height: "100%"
  },
  photoPinPointer: {
    width: 0,
    height: 0,
    backgroundColor: "transparent",
    borderStyle: "solid",
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderTopWidth: 8,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    borderTopColor: "#FFFFFF",
    alignSelf: "center",
    marginTop: -1,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
    zIndex: 9
  },
  stackCardBack: {
    position: "absolute",
    top: 34,
    left: 54, // container 180, card 64 -> margin is 58. Back card shifted left by 4 = 54
    backgroundColor: "#F5F2EB",
    borderColor: "#EAE5D8",
    opacity: 0.8
  },
  stackCardMiddle: {
    position: "absolute",
    top: 32,
    left: 60, // 58 + 2 shift = 60
    backgroundColor: "#FAF7F0",
    borderColor: "#F0EAE0",
    opacity: 0.95
  },
  stackBadge: {
    position: "absolute",
    top: -6,
    right: -6,
    backgroundColor: PincTheme.colors.primary,
    borderRadius: 9,
    width: 18,
    height: 18,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: "#FFF",
    ...PincTheme.shadows.sm,
    zIndex: 20
  },
  stackBadgeText: {
    color: "#FFF",
    fontSize: 9,
    fontWeight: "800",
    fontFamily: PincTheme.fonts.heading
  },
  sponsoredStackBack: {
    position: "absolute",
    borderColor: "#EAE5D8",
    backgroundColor: "#FAF6EF",
    zIndex: -1,
    opacity: 0.8
  },
  markerAura: {
    position: "absolute",
    width: 24,
    height: 24,
    borderRadius: 12
  },
  markerOuterRing: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
    backgroundColor: "#FFF",
    alignItems: "center",
    justifyContent: "center",
    ...PincTheme.shadows.sm
  },
  markerInnerDot: {
    width: 8,
    height: 8,
    borderRadius: 4
  },
  sponsoredIconRing: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2.5,
    borderColor: "#FF4B72",
    backgroundColor: "#FFF",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.5,
    shadowRadius: 10,
    elevation: 18,
    zIndex: 2
  },
  tier2GoldRing: {
    borderColor: "#FFD700"
  },
  sponsoredIconLogo: {
    width: 36,
    height: 36,
    borderRadius: 18
  },
  radarPulseRing: {
    position: "absolute",
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 3,
    borderColor: "#FF4B72",
    backgroundColor: "rgba(255, 75, 114, 0.2)",
    zIndex: 1
  },
  markerLabelContainer: {
    backgroundColor: "transparent",
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginBottom: 4,
    maxWidth: 160
  },
  sponsoredLabel: {
    backgroundColor: "transparent",
    borderWidth: 0
  },
  markerLabelText: {
    color: PincTheme.colors.textPrimary,
    fontSize: 10,
    fontWeight: "700",
    fontFamily: PincTheme.fonts.heading,
    textAlign: "center",
    // Tight text shadow to act as a stroke
    textShadowColor: "#FFFFFF",
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 1.5
  },
  settingsButton: {
    padding: 6,
    marginLeft: 4
  },
  businessLabelContainer: {
    position: "absolute",
    top: -4,
    backgroundColor: "rgba(255,255,255,0.95)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: "#FF4B72",
    ...PincTheme.shadows.md,
    zIndex: 10
  },
  businessLabelText: {
    fontSize: 10,
    fontWeight: "bold",
    fontFamily: PincTheme.fonts.heading,
    color: "#FF4B72"
  },
  livePhotoPinCard: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "#FFFFFF",
    padding: 3,
    borderWidth: 2,
    borderColor: PincTheme.colors.crowdRed,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.5,
    shadowRadius: 10,
    elevation: 18,
    justifyContent: "center",
    alignItems: "center",
    zIndex: 10
  },
  liveImageWrapper: {
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: "#FDFBF7"
  },
  liveNewsBadge: {
    position: "absolute",
    top: 8,
    backgroundColor: PincTheme.colors.crowdRed,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#FFF",
    zIndex: 11,
    ...PincTheme.shadows.sm
  },
  liveNewsBadgeText: {
    color: "#FFF",
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 0.5
  },
  liveSituationLabel: {
    position: "absolute",
    left: 65,
    top: 55,
    backgroundColor: "rgba(255, 255, 255, 0.95)",
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: PincTheme.colors.crowdRedLight,
    maxWidth: 120,
    zIndex: 12,
    ...PincTheme.shadows.sm
  },
  liveSituationText: {
    fontSize: 10,
    fontWeight: "bold",
    color: PincTheme.colors.crowdRed,
    fontFamily: PincTheme.fonts.body
  },
  settingsIcon: {
    fontSize: 18,
    color: PincTheme.colors.textSecondary
  },
  togglesContainer: {
    position: "absolute",
    top: Platform.OS === 'android' ? 12 : 50,
    left: 16,
    right: 16,
    zIndex: 998,
    flexDirection: "row",
    gap: 8
  },
  togglePill: {
    backgroundColor: "#FDFBF7EF",
    borderWidth: 1.5,
    borderColor: PincTheme.colors.border,
    borderRadius: 18,
    paddingHorizontal: 14,
    height: 36,
    justifyContent: "center",
    alignItems: "center",
    ...PincTheme.shadows.sm
  },
  togglePillActive: {
    backgroundColor: PincTheme.colors.primaryLight,
    borderColor: PincTheme.colors.primary
  },
  toggleText: {
    fontFamily: PincTheme.fonts.heading,
    fontSize: 12,
    fontWeight: "700",
    color: PincTheme.colors.textSecondary
  },
  toggleTextActive: {
    color: PincTheme.colors.primary
  },
  liveNewsModalContainer: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.95)",
    justifyContent: "center",
    alignItems: "center"
  },
  liveNewsModalCloseButton: {
    position: "absolute",
    top: 50,
    right: 20,
    zIndex: 10,
    padding: 10,
    backgroundColor: "rgba(255,255,255,0.2)",
    borderRadius: 20
  },
  liveNewsModalCloseText: {
    color: "#FFF",
    fontSize: 20,
    fontWeight: "bold"
  },
  liveNewsModalImage: {
    width: "100%",
    height: "100%",
    marginBottom: 80
  },
  liveNewsModalDescriptionBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "rgba(0,0,0,0.8)",
    padding: 24,
    paddingBottom: 40,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.1)"
  },
  liveNewsModalDescriptionText: {
    color: "#FFF",
    fontSize: 16,
    lineHeight: 24,
    fontFamily: PincTheme.fonts.body
  }
});
