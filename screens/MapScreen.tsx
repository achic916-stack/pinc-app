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
  Platform,
  Image as RNImage
} from "react-native";
import * as Location from "expo-location";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import * as RNMaps from "react-native-maps";
import RNMapClustering from "react-native-map-clustering";

const Marker = Platform.OS === 'web' ? View : RNMaps.Marker;
const PROVIDER_GOOGLE = Platform.OS === 'web' ? null : RNMaps.PROVIDER_GOOGLE;
const MapView = Platform.OS === 'web' ? View : RNMapClustering;
const Audio = { Sound: { createAsync: async () => ({ sound: { playAsync: async () => { }, stopAsync: async () => { }, unloadAsync: async () => { } } }) }, setAudioModeAsync: async () => { } }; const Video = () => null; const ResizeMode = { COVER: 'cover', CONTAIN: 'contain' };

import { CachedVideo } from "../components/CachedVideo";
import { PincTheme } from "../styles/theme";
import { Venue, Pin, auth, getUserStats, calculateDistance } from "../services/firebase";
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

const getMarkerSize = (scale: number) => Math.floor(Math.max(34, Math.min(54, 44 * scale)));

interface MapScreenProps {
  venues: Venue[]; // To be deprecated later
  allPins: Pin[];
  userLocation: { latitude: number; longitude: number } | null;
  onSelectVenue: (venue: Venue) => void;
  isLoadingVenues: boolean;
  followingVenueIds?: Set<string>;
  locale?: "en" | "th";
  cameraTarget?: { latitude: number; longitude: number; timestamp: number } | null;
  focusSearchTrigger?: number;
  selectedMemoryPin?: Pin | null;
  onClearMemory?: () => void;
  currentUserId?: string;
  onDeletePin?: (pin: Pin) => void;
  onOpenUserProfile?: (userId: string) => void;
}

// Detailed Light Lifestyle Map Styling for Google Maps
// All POI labels (restaurants, shops, services, etc.) are hidden for a clean look
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
    featureType: "water",
    elementType: "labels",
    stylers: [{ visibility: "off" }]
  },
  {
    featureType: "landscape",
    elementType: "geometry.fill",
    stylers: [{ color: "#FAF6EF" }]
  },
  {
    featureType: "landscape.man_made",
    elementType: "all",
    stylers: [{ visibility: "off" }]
  },
  // === ซ่อน POI ทั้งหมด (ร้านอาหาร, ร้านค้า, สถานบริการ, ฯลฯ) ===
  {
    featureType: "poi",
    elementType: "all",
    stylers: [{ visibility: "off" }]
  },
  {
    featureType: "poi",
    elementType: "labels",
    stylers: [{ visibility: "off" }]
  },
  {
    featureType: "poi",
    elementType: "labels.text",
    stylers: [{ visibility: "off" }]
  },
  {
    featureType: "poi",
    elementType: "labels.icon",
    stylers: [{ visibility: "off" }]
  },
  {
    featureType: "poi.business",
    elementType: "all",
    stylers: [{ visibility: "off" }]
  },
  {
    featureType: "poi.attraction",
    elementType: "all",
    stylers: [{ visibility: "on" }]
  },
  {
    featureType: "poi.government",
    elementType: "all",
    stylers: [{ visibility: "off" }]
  },
  {
    featureType: "poi.medical",
    elementType: "all",
    stylers: [{ visibility: "off" }]
  },
  {
    featureType: "poi.school",
    elementType: "all",
    stylers: [{ visibility: "off" }]
  },
  {
    featureType: "poi.place_of_worship",
    elementType: "all",
    stylers: [{ visibility: "off" }]
  },
  {
    featureType: "poi.sports_complex",
    elementType: "all",
    stylers: [{ visibility: "off" }]
  },
  // สวนสาธารณะ: เก็บพื้นที่สีเขียวไว้แต่ซ่อนชื่อ
  {
    featureType: "poi.park",
    elementType: "geometry.fill",
    stylers: [{ color: "#E8F0E6" }, { visibility: "on" }]
  },
  {
    featureType: "poi.park",
    elementType: "labels",
    stylers: [{ visibility: "off" }]
  },
  // ถนน: แสดง geometry แต่ซ่อนชื่อถนนเพื่อความสะอาด
  {
    featureType: "road",
    elementType: "geometry",
    stylers: [{ color: "#FFFFFF" }]
  },
  {
    featureType: "road",
    elementType: "labels",
    stylers: [{ visibility: "off" }]
  },
  {
    featureType: "road.highway",
    elementType: "labels",
    stylers: [{ visibility: "off" }]
  },
  {
    featureType: "road.arterial",
    elementType: "labels",
    stylers: [{ visibility: "off" }]
  },
  {
    featureType: "road.local",
    elementType: "labels",
    stylers: [{ visibility: "off" }]
  },
  // ซ่อนระบบขนส่ง
  {
    featureType: "transit",
    elementType: "all",
    stylers: [{ visibility: "off" }]
  },
  // ซ่อน labels ชุมชนและที่ดิน
  {
    featureType: "administrative.neighborhood",
    elementType: "labels",
    stylers: [{ visibility: "off" }]
  },
  {
    featureType: "administrative.land_parcel",
    elementType: "labels",
    stylers: [{ visibility: "off" }]
  }
];

const RadarPulse: React.FC = () => {
  const scale = useRef(new Animated.Value(0.8)).current;
  const opacity = useRef(new Animated.Value(0.6)).current;

  useEffect(() => {
    const pulseAnimation = Animated.loop(
      Animated.parallel([
        Animated.timing(scale, {
          toValue: 2.2,
          duration: 2000,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0,
          duration: 2000,
          useNativeDriver: true,
        }),
      ])
    );
    pulseAnimation.start();
    return () => pulseAnimation.stop();
  }, [scale, opacity]);

  return (
    <Animated.View
      style={{
        position: "absolute",
        width: 44,
        height: 44,
        borderRadius: 22,
        borderWidth: 2,
        borderColor: "#FF4B72",
        backgroundColor: "rgba(255, 75, 114, 0.15)",
        transform: [{ scale }],
        opacity,
        zIndex: -1,
      }}
    />
  );
};

interface CustomMapMarkerProps {
  coordinate: { latitude: number; longitude: number };
  onPress?: (e: any) => void;
  onLongPress?: (e: any) => void;
  anchor?: { x: number; y: number };
  zIndex?: number;
  zoomScale: number;
  children: React.ReactNode;
}

const CustomMapMarker: React.FC<CustomMapMarkerProps> = ({
  coordinate,
  onPress,
  onLongPress,
  anchor,
  zIndex,
  zoomScale,
  children
}) => {
  const [tracksView, setTracksView] = useState(true);

  useEffect(() => {
    setTracksView(true);
    const timer = setTimeout(() => {
      setTracksView(false);
    }, 850);
    return () => clearTimeout(timer);
  }, [zoomScale]);

  const markerProps: any = {
    coordinate,
    onPress,
    anchor,
    zIndex,
    tracksViewChanges: tracksView,
  };
  if (onLongPress) {
    markerProps.onLongPress = onLongPress;
  }

  return (
    <Marker {...markerProps}>
      {children}
    </Marker>
  );
};

export const MapScreen: React.FC<MapScreenProps> = ({
  venues,
  allPins = [],
  userLocation,
  onSelectVenue,
  isLoadingVenues,
  followingVenueIds = new Set<string>(),
  locale = "en",
  cameraTarget = null,
  focusSearchTrigger = 0,
  selectedMemoryPin = null,
  onClearMemory,
  currentUserId,
  onDeletePin,
  onOpenUserProfile
}) => {
  const { t } = useTranslation();
  const mapRef = useRef<any | null>(null);
  const searchInputRef = useRef<TextInput | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [isSearchVisible, setIsSearchVisible] = useState(false);
  const [isFilterFriends, setIsFilterFriends] = useState(false);
  const [reelsFeedPins, setReelsFeedPins] = useState<Pin[]>([]);
  const [deleteModePinId, setDeleteModePinId] = useState<string | null>(null);
  const [followerStatsCache, setFollowerStatsCache] = useState<Record<string, number>>({});

  // Filter venues based on isFilterFriends state
  const displayedVenues = useMemo(() => {
    if (!isFilterFriends) return venues;
    return venues.filter((venue) => venue.is_sponsored || followingVenueIds.has(venue.venueId));
  }, [venues, isFilterFriends, followingVenueIds]);

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
        return ageHours <= 24; // Pinc Story (formerly Live News) lasts 24h
      } else {
        return true; // Standard pins are now Permanent
      }
    });
  }, [allPins]);

  // Precompute the oldest pin (pioneer pin) for each venue
  const pioneerPinIds = useMemo(() => {
    const oldestPinsByVenue: Record<string, Pin> = {};
    allPins.forEach(pin => {
      if (!pin.venueId) return;
      const currentOldest = oldestPinsByVenue[pin.venueId];
      const pinTime = new Date(pin.timestamp).getTime();
      if (!currentOldest || pinTime < new Date(currentOldest.timestamp).getTime()) {
        oldestPinsByVenue[pin.venueId] = pin;
      }
    });
    return new Set(Object.values(oldestPinsByVenue).map(p => p.pinId).filter(Boolean));
  }, [allPins]);

  // Group pins within 500 meters. The representative pin (group[0]) is the oldest (first posted) pin.
  const groupedValidPins = useMemo(() => {
    // 1. Identify all sponsored venue IDs
    const sponsoredVenueIds = new Set(displayedVenues.filter(v => v.is_sponsored || (v.sponsor_tier && v.sponsor_tier >= 1)).map(v => v.venueId));

    // 2. Filter out pins that belong to a sponsored venue so they don't render on the map directly
    const mapRenderablePins = validPins.filter(pin => !pin.venueId || !sponsoredVenueIds.has(pin.venueId));

    // Sort pins oldest first so that the seed pin for each cluster is the earliest posted pin
    const sortedPins = [...mapRenderablePins].sort((a, b) => new Date(a.timestamp).getTime() - new Date(a.timestamp).getTime());
    const groups: Pin[][] = [];
    const processed = new Set<string>();

    for (const pin of sortedPins) {
      if (processed.has(pin.pinId!)) continue;
      const currentGroup = [pin];
      processed.add(pin.pinId!);

      for (const otherPin of sortedPins) {
        if (processed.has(otherPin.pinId!)) continue;
        const distance = calculateDistance(pin.latitude, pin.longitude, otherPin.latitude, otherPin.longitude);
        if (distance <= 500) {
          currentGroup.push(otherPin);
          processed.add(otherPin.pinId!);
        }
      }
      groups.push(currentGroup);
    }
    return groups;
  }, [validPins, displayedVenues]);

  // Fetch follower stats for validPins
  useEffect(() => {
    const fetchFollowerStats = async () => {
      const uniqueUserIds = Array.from(new Set(validPins.map(p => p.userId).filter(Boolean)));
      const uncachedIds = uniqueUserIds.filter(id => followerStatsCache[id] === undefined);

      if (uncachedIds.length > 0) {
        const newStats: Record<string, number> = {};
        await Promise.all(
          uncachedIds.map(async (uid) => {
            try {
              const stats = await getUserStats(uid);
              newStats[uid] = stats.followersCount || 0;
            } catch (error) {
              newStats[uid] = 0; // Default to 0 on error
            }
          })
        );
        setFollowerStatsCache(prev => ({ ...prev, ...newStats }));
      }
    };
    fetchFollowerStats();
  }, [validPins]);

  // Helper for determining tier color
  const getTierColor = (followersCount: number = 0) => {
    if (followersCount >= 100000) return '#f1c40f'; // Gold
    if (followersCount >= 10000) return '#FF2E63'; // Pink
    if (followersCount >= 1000) return '#9b59b6'; // Purple
    if (followersCount >= 100) return '#3498db'; // Blue
    return '#E0E0E0'; // Light Gray (Default)
  };

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

  // Dynamic zoom scale tracking
  const [zoomScale, setZoomScale] = useState(1.0);

  const handleRegionChangeComplete = (region: { latitude: number; longitude: number; latitudeDelta: number; longitudeDelta: number }) => {
    // Calculate custom zoom scale based on current latitudeDelta relative to base delta (0.015)
    const baseDelta = 0.015;
    const calculatedScale = baseDelta / (region.latitudeDelta || baseDelta);
    // Clamp scale to keep icons legible (between 0.4 and 1.8)
    const clampedScale = Math.max(0.4, Math.min(1.8, calculatedScale));

    // Only update zoom scale if it has changed significantly (more than 8%)
    // This avoids minor float fluctuations during panning from triggering useless re-renders
    setZoomScale(prevScale => {
      if (Math.abs(clampedScale - prevScale) > 0.08) {
        return clampedScale;
      }
      return prevScale;
    });
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



  // Dynamic Greedy Clustering algorithm removed in favor of react-native-map-clustering

  // Search filter and prioritize sponsored sorting logic
  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const queryStr = searchQuery.toLowerCase().trim();

    const matched = displayedVenues.filter((venue) => {
      const nameMatch = venue.name.toLowerCase().includes(queryStr);
      const catMatch = venue.category.toLowerCase().includes(queryStr);
      
      let packageMatch = false;
      if (venue.is_sponsored) {
        const tierKeywords = venue.sponsor_tier === 3 ? "gold package tier 3 ทอง" :
                             venue.sponsor_tier === 2 ? "silver package tier 2 เงิน" : 
                             "bronze package tier 1 ทองแดง";
        const sponsorKeywords = "แพ็คเกจ ร้านค้า สปอนเซอร์ sponsored package";
        packageMatch = tierKeywords.includes(queryStr) || sponsorKeywords.includes(queryStr);
      }

      return nameMatch || catMatch || packageMatch;
    });

    // Sort: Sponsored first (by tier descending), then others
    return matched.sort((a, b) => {
      if (a.is_sponsored && !b.is_sponsored) return -1;
      if (!a.is_sponsored && b.is_sponsored) return 1;
      if (a.is_sponsored && b.is_sponsored) {
        return (b.sponsor_tier || 0) - (a.sponsor_tier || 0);
      }
      return 0;
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
                  return (
                    <TouchableOpacity
                      key={venue.venueId}
                      style={styles.resultItem}
                      onPress={() => handleSelectSearchResult(venue)}
                    >
                      <View style={styles.resultCategoryPlaceholder}>
                        <Text style={{ fontSize: 14 }}>☕</Text>
                      </View>

                      <View style={styles.resultTextContainer}>
                        <Text style={styles.resultName}>{venue.name}</Text>
                        <Text style={styles.resultCategory}>{venue.category.toUpperCase()}</Text>
                      </View>



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
            👥 {locale === "th" ? "เพื่อนเท่านั้น" : "Friends Only"}
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
        provider={PROVIDER_GOOGLE as any}
        style={styles.map}
        initialRegion={initialRegion}
        customMapStyle={minimalMapStyle}
        showsPointsOfInterest={false}
        showsUserLocation
        showsMyLocationButton={false}
        spiralEnabled={false}
        onRegionChangeComplete={handleRegionChangeComplete}
        clusterColor={PincTheme.colors.primary}
        clusterTextColor="#FFFFFF"
        radius={35}
        renderCluster={(cluster: any) => {
          const { id, geometry, onPress, properties } = cluster;
          const points = properties.point_count;
          const centerLat = geometry.coordinates[1];
          const centerLng = geometry.coordinates[0];

          let nearestPin: any = null;
          let minDistance = Infinity;
          validPins.forEach(p => {
            const d = Math.pow(p.latitude - centerLat, 2) + Math.pow(p.longitude - centerLng, 2);
            if (d < minDistance) {
              minDistance = d;
              nearestPin = p;
            }
          });

          // ใช้รูปโปรไฟล์ (user_profile_pic) แทนรูปภาพในโพสต์
          const profilePicUrl = (nearestPin as any)?.user_profile_pic || null;
          const clusterKey = `cluster-${id}-${profilePicUrl || ''}`;
          const tierColor = nearestPin ? getTierColor(followerStatsCache[nearestPin.userId] || 0) : '#E0E0E0';
          const displayName = nearestPin?.username || "";

          const scaledSize = getMarkerSize(zoomScale);
          const scaledRadius = scaledSize / 2;
          const innerSize = scaledSize - 6;
          const innerRadius = innerSize / 2;
          const textSize = Math.max(9, Math.floor(11 * zoomScale));

          return (
            <CustomMapMarker key={clusterKey} coordinate={{ latitude: centerLat, longitude: centerLng }} onPress={onPress} zoomScale={zoomScale}>
              <View style={{ alignItems: 'center', ...PincTheme.shadows.md }}>
                <View style={{ width: scaledSize, height: scaledSize, borderRadius: scaledRadius, padding: 3, backgroundColor: tierColor, overflow: 'hidden' }}>
                  {profilePicUrl ? (
                    <RNImage source={{ uri: profilePicUrl }} style={{ width: innerSize, height: innerSize, borderRadius: innerRadius }} resizeMode="cover" />
                  ) : (
                    <View style={{ width: innerSize, height: innerSize, borderRadius: innerRadius, backgroundColor: PincTheme.colors.card }} />
                  )}
                </View>
                {displayName ? (
                  <Text style={{ marginTop: 0, fontSize: textSize, fontWeight: '800', color: PincTheme.colors.textPrimary, textShadowColor: '#FFF', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3 }}>
                    {displayName}
                  </Text>
                ) : null}
              </View>
            </CustomMapMarker>
          );
        }}
        onPress={() => {
          // แตะพื้นที่ว่างบนแผนที่เคลียร์ delete mode
          setDeleteModePinId(null);
        }}
        onClusterPress={(cluster: any, markers?: any[]) => {
          if (!markers) return;
          // ดึง pinIds ออกจาก markers โดยป้องกันการซ้ำ
          const availablePins = [...validPins];
          const clusterPins: Pin[] = [];
          markers.forEach((m: any) => {
            const foundIdx = availablePins.findIndex(p => {
              const pKey = p.pinId || `${p.latitude}-${p.longitude}-${p.timestamp}`;
              const mKey = m.properties?.identifier || m.id || '';
              return pKey === mKey ||
                (Math.abs(p.latitude - m.geometry?.coordinates?.[1]) < 0.00001 &&
                  Math.abs(p.longitude - m.geometry?.coordinates?.[0]) < 0.00001);
            });
            if (foundIdx !== -1) {
              clusterPins.push(availablePins[foundIdx]);
              availablePins.splice(foundIdx, 1);
            }
          });

          // เมื่อกดที่หมุดรวม ให้เปิด Modal เรียงรูปทันที
          if (clusterPins.length > 0) {
            setReelsFeedPins(clusterPins);
          }
        }}
      >
        {groupedValidPins.map((group) => {
          const pin = group[0];
          const photoUrl = pin.media_type === "video" && pin.thumbnail_url ? pin.thumbnail_url : pin.image_url;
          const isLiveNews = pin.post_type === "live_news";
          const isDeleteMode = deleteModePinId === pin.pinId;
          const pinKey = `pin-${pin.pinId || `${pin.latitude}-${pin.longitude}-${pin.timestamp}`}-${pin.user_profile_pic || ''}`;

          // Check if close to a sponsored venue (within 35 meters)
          const closeSponsor = displayedVenues.find(
            v => v.is_sponsored && calculateDistance(pin.latitude, pin.longitude, v.latitude, v.longitude) < 35
          );

          let displayLat = pin.latitude;
          let displayLng = pin.longitude;
          if (closeSponsor) {
            // Shift the user pin slightly south-east (~10 meters offset) so it tucks behind the shop's pin
            displayLat = pin.latitude - 0.00010;
            displayLng = pin.longitude + 0.00010;
          }

          return (
            <CustomMapMarker
              key={pinKey}
              coordinate={{ latitude: displayLat, longitude: displayLng }}
              onPress={() => {
                if (isDeleteMode) return;

                if (group.length > 1) {
                  // If it's a grouped pin, show all pins in the ReelsFeedModal (newest first for browsing)
                  const sortedNewestFirst = [...group].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
                  setReelsFeedPins(sortedNewestFirst);
                } else {
                  if (onSelectVenue) {
                    onSelectVenue(null as any);
                  }
                  if (pin.pinId) {
                    // Navigate camera to selected individual pin
                    // (Assuming cameraTarget logic is handled externally)
                    setReelsFeedPins([pin]);
                  }
                }
              }}
              // @ts-ignore
              onLongPress={() => {
                if (currentUserId && pin.userId === currentUserId) {
                  setDeleteModePinId(pin.pinId || null);
                }
              }}
              zIndex={closeSponsor ? 100 : 500}
              anchor={{ x: 0.5, y: 0.5 }}
              zoomScale={zoomScale}
            >
              {/* Red Minus Delete Badge Overlay */}
              {isDeleteMode && (
                <View style={{ position: 'absolute', top: '50%', left: '50%', marginTop: -20, marginLeft: -18, zIndex: 100, elevation: 20 }}>
                  <TouchableOpacity
                    onPress={(e) => {
                      e.stopPropagation();
                      if (onDeletePin) onDeletePin(pin);
                      setDeleteModePinId(null);
                    }}
                    style={{ backgroundColor: '#FFFFFF', borderRadius: 20, padding: 2 }}
                  >
                    <Ionicons name="remove-circle" size={32} color="#FF3B30" />
                  </TouchableOpacity>
                </View>
              )}

              {/* Unified Profile Marker */}
              <View style={{ alignItems: 'center', ...PincTheme.shadows.md }}>
                <View style={{ position: 'relative' }}>
                  <View style={{
                    width: getMarkerSize(zoomScale),
                    height: getMarkerSize(zoomScale),
                    borderRadius: getMarkerSize(zoomScale) / 2,
                    padding: 3,
                    backgroundColor: pioneerPinIds.has(pin.pinId!) ? '#FFD700' : (isLiveNews ? PincTheme.colors.crowdRed : getTierColor(followerStatsCache[pin.userId] || 0)),
                    overflow: 'hidden'
                  }}>
                    {pin.user_profile_pic ? (
                      <RNImage
                        source={{ uri: pin.user_profile_pic }}
                        style={{ width: getMarkerSize(zoomScale) - 6, height: getMarkerSize(zoomScale) - 6, borderRadius: (getMarkerSize(zoomScale) - 6) / 2 }}
                        resizeMode="cover"
                      />
                    ) : (
                      <View style={{ width: getMarkerSize(zoomScale) - 6, height: getMarkerSize(zoomScale) - 6, borderRadius: (getMarkerSize(zoomScale) - 6) / 2, backgroundColor: PincTheme.colors.card }} />
                    )}
                  </View>
                  {pioneerPinIds.has(pin.pinId!) && (
                    <View style={{
                      position: 'absolute',
                      bottom: 0,
                      right: 0,
                      backgroundColor: '#FFFFFF',
                      borderRadius: 7,
                      width: 14,
                      height: 14,
                      justifyContent: 'center',
                      alignItems: 'center',
                      borderWidth: 1,
                      borderColor: '#FFD700',
                      shadowColor: '#000',
                      shadowOffset: { width: 0, height: 1 },
                      shadowOpacity: 0.2,
                      shadowRadius: 1,
                      elevation: 2
                    }}>
                      <Ionicons name="star" size={8} color="#FFD700" />
                    </View>
                  )}
                </View>
                {pin.username ? (
                  <Text style={{ marginTop: 0, fontSize: Math.max(9, Math.floor(11 * zoomScale)), fontWeight: '800', color: PincTheme.colors.textPrimary, textShadowColor: '#FFF', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3 }}>
                    {pin.username}
                  </Text>
                ) : null}
              </View>
            </CustomMapMarker>
          );
        })}
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

        {/* Advertiser Pins */}
        {displayedVenues.filter(venue => venue.is_sponsored).map(venue => {
          const imageUri = venue.custom_icon_url || venue.cover_image || '';
          const sponsorKey = `sponsor-${venue.venueId}-${imageUri}-${venue.aesthetic_rating}-${venue.crowd_status}`;
          const isTier1 = venue.sponsor_tier === 1;
          const isTier2 = venue.sponsor_tier === 2;
          const isTier3 = venue.sponsor_tier === 3;
          
          let borderColor = '#A6A6A6'; // Silver default for Tier 1
          let borderWidth = 3;
          if (isTier2) {
            borderColor = '#FFC107'; // Gold for Tier 2
            borderWidth = 3;
          } else if (isTier3) {
            borderColor = '#FF4B72'; // Pink for Tier 3
            borderWidth = 3;
          }

          const markerSize = getMarkerSize(zoomScale);
          const innerSize = markerSize - 6;

          return (
            <CustomMapMarker
              key={sponsorKey}
              coordinate={{ latitude: venue.latitude, longitude: venue.longitude }}
              onPress={() => onSelectVenue(venue)}
              zIndex={998}
              anchor={{ x: 0.5, y: 0.5 }}
              zoomScale={zoomScale}
            >
              <View style={{ alignItems: 'center', justifyContent: 'center' }}>
                <View style={{
                  width: markerSize,
                  height: markerSize,
                  borderRadius: 6, // Square with softened premium edges
                  borderWidth: borderWidth,
                  borderColor: borderColor,
                  backgroundColor: '#FFFFFF',
                  padding: 2,
                  justifyContent: 'center',
                  alignItems: 'center',
                  ...PincTheme.shadows.md,
                }}>
                  {venue.custom_icon_url || venue.cover_image ? (
                    <Image
                      source={{ uri: venue.custom_icon_url || venue.cover_image }}
                      style={{
                        width: innerSize,
                        height: innerSize,
                        borderRadius: 4,
                      }}
                      contentFit="cover"
                    />
                  ) : null}
                </View>
                <Text style={{
                  marginTop: 4,
                  fontSize: Math.max(9, Math.floor(11 * zoomScale)),
                  fontWeight: '800',
                  color: PincTheme.colors.textPrimary,
                  textShadowColor: '#FFF',
                  textShadowOffset: { width: 0, height: 1 },
                  textShadowRadius: 3,
                  maxWidth: 100,
                  textAlign: 'center',
                }} numberOfLines={1}>
                  {venue.name}
                </Text>
              </View>
            </CustomMapMarker>
          );
        })}

      </MapView>

      {/* Memory Timeline Modal */}
      <ReelsFeedModal
        visible={isMemorySheetVisible && !!selectedMemoryPin}
        pins={selectedMemoryPin ? [selectedMemoryPin] : []}
        onClose={() => {
          setIsMemorySheetVisible(false);
          if (onClearMemory) onClearMemory();
        }}
        currentUserId={currentUserId || auth.currentUser?.uid || ""} // Pass appropriately if needed
        onOpenUserProfile={onOpenUserProfile}
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
        currentUserId={currentUserId || auth.currentUser?.uid || ""}
        onOpenUserProfile={onOpenUserProfile}
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
    top: Platform.OS === 'android' ? 48 : 50,
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
  },
  sponsorMarkerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: '#90EE90', // Light green
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    ...PincTheme.shadows.md,
  },
  sponsorMarkerImage: {
    width: 24,
    height: 24,
    borderRadius: 4,
    marginRight: 6,
  },
  sponsorMarkerText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: PincTheme.colors.textPrimary,
    maxWidth: 100,
  }
});
