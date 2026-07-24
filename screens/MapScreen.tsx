import React, { useState, useRef, useMemo, useEffect } from "react";
import { darkMapStyle } from "./darkMapStyle";
import { pincDarkStyle } from '../constants/pincDarkStyle';
import { pincIOSDarkStyle } from '../constants/pincIOSDarkStyle';
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
  Image as RNImage,
  Alert
} from "react-native";
import { Image } from "expo-image";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import * as RNMaps from "react-native-maps";
import RNMapClustering from "react-native-map-clustering";
import * as Location from "expo-location";
import { LinearGradient } from "expo-linear-gradient";

const Marker = Platform.OS === 'web' ? View : RNMaps.Marker;
const PROVIDER_GOOGLE = Platform.OS === 'web' ? null : RNMaps.PROVIDER_GOOGLE;
const MapView = Platform.OS === 'web' ? View : RNMapClustering;
const Audio = { Sound: { createAsync: async () => ({ sound: { playAsync: async () => { }, stopAsync: async () => { }, unloadAsync: async () => { } } }) }, setAudioModeAsync: async () => { } }; const Video = () => null; const ResizeMode = { COVER: 'cover', CONTAIN: 'contain' };

import { CachedVideo } from "../components/CachedVideo";
import { PincTheme } from "../styles/theme";
import { Venue, Pin, auth, getUserStats, calculateDistance, db } from "../services/firebase";
import { doc, updateDoc } from "firebase/firestore";
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

const getMarkerSize = (scale: number) => {
  if (scale <= 0.6) return 3; // Shrink to tiny dots when zoomed out
  return Math.floor(Math.max(40, Math.min(64, 54 * scale)));
};

interface MapScreenProps {
  venues: Venue[]; // To be deprecated later
  allPins: Pin[];
  userLocation: { latitude: number; longitude: number } | null;
  onSelectVenue: (venue: Venue) => void;
  isLoadingVenues: boolean;
  followingVenueIds?: Set<string>;
  followingIds?: string[];
  locale?: "en" | "th";
  cameraTarget?: { latitude: number; longitude: number; timestamp: number } | null;
  focusSearchTrigger?: number;
  selectedMemoryPin?: Pin | null;
  onClearMemory?: () => void;
  currentUserId?: string;
  onDeletePin?: (pin: Pin) => void;
  onOpenUserProfile?: (userId: string) => void;
  settingCrewBaseVenue?: Venue | null;
  onClearCrewBaseMode?: () => void;
}

// Detailed Light Lifestyle Map Styling for Google Maps
// All POI labels (restaurants, shops, services, etc.) are hidden for a clean look

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
  cluster?: boolean;
  identifier?: string;
}

const CustomMapMarker: React.FC<CustomMapMarkerProps> = ({
  coordinate,
  onPress,
  onLongPress,
  anchor,
  zIndex,
  zoomScale,
  children,
  cluster,
  identifier
}) => {
  const [tracksView, setTracksView] = useState(true);

  useEffect(() => {
    setTracksView(true);
    const timer = setTimeout(() => {
      setTracksView(false);
    }, zoomScale <= 0.6 ? 200 : 5000);
    return () => clearTimeout(timer);
  }, [zoomScale]);

  const markerProps: any = {
    coordinate,
    onPress,
    anchor,
    zIndex,
    tracksViewChanges: tracksView,
  };
  if (identifier) {
    markerProps.identifier = identifier;
  }
  if (cluster !== undefined) {
    markerProps.cluster = cluster;
  }
  if (onLongPress) {
    markerProps.onLongPress = onLongPress;
  }

  return (
    <Marker {...markerProps}>
      {children}
    </Marker>
  );
};

const getTierColor = (followers: number) => {
  if (followers >= 100000000) return '#FFD700';
  if (followers >= 1000000) return '#C0C0C0';
  if (followers >= 10000) return '#00FFFF';
  if (followers >= 1000) return '#FF00FF';
  return '#FF69B4';
};

export const MapScreen: React.FC<MapScreenProps> = ({
  venues,
  allPins = [],
  userLocation,
  onSelectVenue,
  isLoadingVenues,
  followingVenueIds = new Set<string>(),
  followingIds = [],
  locale = "en",
  cameraTarget = null,
  focusSearchTrigger = 0,
  selectedMemoryPin = null,
  onClearMemory,
  currentUserId,
  onDeletePin,
  onOpenUserProfile,
  settingCrewBaseVenue,
  onClearCrewBaseMode
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
  const [currentCenterRegion, setCurrentCenterRegion] = useState<{ latitude: number; longitude: number } | null>(null);
  const [isUpdatingBase, setIsUpdatingBase] = useState(false);
  const [followerStatsCache, setFollowerStatsCache] = useState<Record<string, number>>({});
  const hasAnimatedToUserLocation = useRef(false);

  useEffect(() => {
    if (userLocation && mapRef.current && !hasAnimatedToUserLocation.current) {
      hasAnimatedToUserLocation.current = true;
      const mapObj = mapRef.current as any;
      const targetCamera = {
        center: {
          latitude: userLocation.latitude,
          longitude: userLocation.longitude,
        },
        zoom: 17,
      };
      try {
        if (typeof mapObj.animateCamera === 'function') {
          mapObj.animateCamera(targetCamera, { duration: 1000 });
        } else if (typeof mapObj.getMapRef === 'function') {
          mapObj.getMapRef().animateCamera(targetCamera, { duration: 1000 });
        } else if (typeof mapObj.animateToRegion === 'function') {
          mapObj.animateToRegion({
            latitude: userLocation.latitude,
            longitude: userLocation.longitude,
            latitudeDelta: 0.005,
            longitudeDelta: 0.005,
          }, 1000);
        }
      } catch (e) {
        console.log("Failed to animate to region", e);
      }
    }
  }, [userLocation]);

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

  // Helper for dynamic fly-to animation based on distance
  const flyToTarget = async (targetLat: number, targetLng: number, onComplete: () => void) => {
    if (!mapRef.current) return;
    
    let currentLat = userLocation?.latitude;
    let currentLng = userLocation?.longitude;
    let currentZoom = 14;

    try {
      const currentCamera = await (mapRef.current as any).getCamera();
      if (currentCamera && currentCamera.center) {
        currentLat = currentCamera.center.latitude;
        currentLng = currentCamera.center.longitude;
        if (currentCamera.zoom !== undefined) currentZoom = currentCamera.zoom;
      }
    } catch (e) {
      console.log("Error getting camera, using userLocation instead", e);
    }
    
    // Fallback if camera and userLocation fail
    if (currentLat === undefined || currentLng === undefined) {
      currentLat = 40.7128; // New York (for testing cross-continent)
      currentLng = -74.0060;
    }

    const coordinate = { latitude: targetLat, longitude: targetLng };

    // Built-in Haversine distance in meters to ensure 100% reliability
    const R = 6371e3;
    const p1 = currentLat * Math.PI/180;
    const p2 = targetLat * Math.PI/180;
    const dp = (targetLat-currentLat) * Math.PI/180;
    const dl = (targetLng-currentLng) * Math.PI/180;
    const a = Math.sin(dp/2) * Math.sin(dp/2) + Math.cos(p1) * Math.cos(p2) * Math.sin(dl/2) * Math.sin(dl/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    const distMeters = R * c;

    if (distMeters > 50000) {
      const midLat = (currentLat + targetLat) / 2;
      const midLng = (currentLng + targetLng) / 2;
      
      // Calculate dynamic peak altitude AND duration based on distance
      // We use a logarithmic scale based on Earth's circumference (approx 40,000 km)
      // to ensure both current location and target are completely visible at the peak.
      let peakZoom = Math.floor(Math.log2(40000000 / (distMeters * 2.5)));
      peakZoom = Math.max(1, Math.min(12, peakZoom)); // Clamp between zoom level 1 (world) and 12 (city)

      let phase1Duration = 2500; // Lift off to midpoint
      let phase2Duration = 4000; // Dive diagonally to target

      if (distMeters > 5000000) {
        phase1Duration = 3500; 
        phase2Duration = 7000; 
      } else if (distMeters > 1000000) {
        phase1Duration = 3000;
        phase2Duration = 5500;
      } else if (distMeters > 500000) {
        phase1Duration = 2000;
        phase2Duration = 4500;
      }

      if (Platform.OS === 'ios') {
        let liftDuration = 2000;
        let diveDuration = 2500;
        let slideDuration = 3000;

        if (distMeters > 5000000) {
           liftDuration = 2500; slideDuration = 5000; diveDuration = 3000;
        } else if (distMeters > 1000000) {
           liftDuration = 2000; slideDuration = 4000; diveDuration = 2500;
        } else if (distMeters > 500000) {
           liftDuration = 1500; slideDuration = 3000; diveDuration = 2000;
        }

        // Step 1: Lift off (zoom out) at current location
        (mapRef.current as any).animateCamera({
          center: { latitude: currentLat, longitude: currentLng },
          zoom: peakZoom,
          pitch: 0
        }, { duration: liftDuration });

        // Step 2: Slide horizontally to target location
        setTimeout(() => {
          if (!mapRef.current) return;
          (mapRef.current as any).animateCamera({
            center: coordinate,
            zoom: peakZoom,
            pitch: 0
          }, { duration: slideDuration });

          // Step 3: Dive (zoom in) at target
          setTimeout(() => {
            if (!mapRef.current) return;
            (mapRef.current as any).animateCamera({
              center: coordinate,
              zoom: 18.5,
              pitch: 60
            }, { duration: diveDuration });

            setTimeout(() => onComplete(), diveDuration + 100);
          }, slideDuration);
        }, liftDuration);
      } else {
        // Calculate trigger times with OVERLAPS (-400ms) to blend animations into a smooth parabolic curve
        const overlap = 400;
        const t2 = phase1Duration - overlap;

        // Phase 1: Lift off and travel to Midpoint
        (mapRef.current as any).animateCamera({ 
          center: { latitude: midLat, longitude: midLng }, 
          zoom: peakZoom,
          pitch: 45 // Tilt camera up to see horizon
        }, { duration: phase1Duration });
        
        // Phase 2: Diagonal Dive (Move horizontally to target WHILE zooming in to street level)
        setTimeout(() => {
          if (!mapRef.current) return;
          (mapRef.current as any).animateCamera({ 
            center: coordinate, 
            zoom: 18.5,
            pitch: 60 // Tilt further to see 3D buildings from a low angle during landing approach
          }, { duration: phase2Duration });
          
          setTimeout(() => onComplete(), phase2Duration + 100);
        }, t2);
      }
    } else {
      // Near (<= 50km): 1-step direct ground-skimming flight
      // We use manual JS interpolation (setInterval with setCamera) because the Android Google Maps SDK 
      // natively teleports if the pan distance is too large relative to the current zoom level.
      let nearDuration = 3000;
      if (distMeters > 20000) nearDuration = 6000; // 20km - 50km
      else if (distMeters > 5000) nearDuration = 5000; // 5km - 20km
      else if (distMeters > 1000) nearDuration = 4000; // 1km - 5km

      if (Platform.OS === 'ios') {
        (mapRef.current as any).animateCamera({ 
          center: coordinate,
          zoom: 18.5
        }, { duration: nearDuration });
        setTimeout(() => onComplete(), nearDuration + 100);
      } else {
        const startLat = currentLat;
        const startLng = currentLng;
        const startZ = currentZoom;
        const targetZoom = 18.5;
        const dLat = coordinate.latitude - startLat;
        const dLng = coordinate.longitude - startLng;
        const dZoom = targetZoom - startZ;
        
        let startTime: number | null = null;
        
        const animateFrame = (timestamp: number) => {
          if (!startTime) startTime = timestamp;
          const elapsed = timestamp - startTime;
          let progress = elapsed / nearDuration;
          if (progress > 1) progress = 1;
          
          // Ease In Out Quad for smooth acceleration and deceleration
          const ease = progress < 0.5 ? 2 * progress * progress : 1 - Math.pow(-2 * progress + 2, 2) / 2;
          
          const curLat = startLat + dLat * ease;
          const curLng = startLng + dLng * ease;
          const curZoom = startZ + dZoom * ease;

          if (mapRef.current) {
            (mapRef.current as any).setCamera({ 
              center: { latitude: curLat, longitude: curLng },
              zoom: curZoom
            });
          }

          if (progress < 1) {
            requestAnimationFrame(animateFrame);
          } else {
            setTimeout(() => onComplete(), 100);
          }
        };
        
        requestAnimationFrame(animateFrame);
      }
    }
  };

  // Effect to pan map camera on target change
  useEffect(() => {
    if (cameraTarget && mapRef.current) {
      flyToTarget(cameraTarget.latitude, cameraTarget.longitude, () => {});
    }
  }, [cameraTarget]);

  // Handle selected memory pin (Fly-to animation and auto open timeline)
  const [isMemorySheetVisible, setIsMemorySheetVisible] = useState(false);
  useEffect(() => {
    if (selectedMemoryPin && mapRef.current) {
      setIsMemorySheetVisible(false);
      flyToTarget(selectedMemoryPin.latitude, selectedMemoryPin.longitude, () => {
        setIsMemorySheetVisible(true);
      });
    }
  }, [selectedMemoryPin]);

  // Time-Decay Logic: filter out expired pins
  const validPins = useMemo(() => {
    const now = Date.now();
    const filtered = allPins.filter(pin => {
      if (pin.is_pinned === false) return false;
      if (!pin.latitude || !pin.longitude) return false; // MUST have valid coordinates
      const pinTime = new Date(pin.timestamp).getTime();
      const ageHours = (now - pinTime) / (1000 * 60 * 60);
      if (pin.post_type === "live_news") {
        return ageHours <= 24; // Pinc Story (formerly Live News) lasts 24h
      } else {
        return true; // Standard pins are now Permanent
      }
    });

    // Deduplicate by pinId to guarantee stable unique keys for Map rendering
    const uniqueMap = new Map();
    filtered.forEach(p => {
      const key = p.pinId || `${p.latitude}-${p.longitude}-${p.timestamp}`;
      if (!uniqueMap.has(key)) {
        uniqueMap.set(key, p);
      }
    });
    return Array.from(uniqueMap.values());
  }, [allPins]);

  // Precompute the oldest permanent pin (pioneer pin) for each 500m location area globally
  const pioneerPinIds = useMemo(() => {
    const sortedAll = [...allPins].filter(p => p.post_type !== "live_news" && p.latitude && p.longitude).sort((a, b) => {
      const timeA = (a.timestamp as any)?.toDate ? (a.timestamp as any).toDate().getTime() : new Date(a.timestamp || 0).getTime();
      const timeB = (b.timestamp as any)?.toDate ? (b.timestamp as any).toDate().getTime() : new Date(b.timestamp || 0).getTime();
      return (timeA || 0) - (timeB || 0);
    });
    const pioneerIds = new Set<string>();
    const pioneerLocations: {lat: number, lng: number}[] = [];

    for (const pin of sortedAll) {
       let isPioneer = true;
       for (const loc of pioneerLocations) {
          if (calculateDistance(pin.latitude, pin.longitude, loc.lat, loc.lng) <= 500) {
             isPioneer = false;
             break;
          }
       }
       if (isPioneer) {
          if (pin.pinId) pioneerIds.add(pin.pinId);
          pioneerLocations.push({lat: pin.latitude, lng: pin.longitude});
       }
    }
    return pioneerIds;
  }, [allPins]);

  // Group pins within 500 meters. The representative pin (group[0]) is the oldest (first posted) pin.
  const groupedValidPins = useMemo(() => {
    // 1. Identify all sponsored venue IDs
    const sponsoredVenueIds = new Set(displayedVenues.filter(v => v.is_sponsored || (v.sponsor_tier && v.sponsor_tier >= 1)).map(v => v.venueId));

    // 2. Filter out pins that belong to a sponsored venue so they don't render on the map directly
    let mapRenderablePins = validPins.filter(pin => !pin.venueId || !sponsoredVenueIds.has(pin.venueId));

    if (isFilterFriends) {
      mapRenderablePins = mapRenderablePins.filter(pin => 
        pin.userId === currentUserId || followingIds.includes(pin.userId)
      );
    }

    // Sort pins oldest first so that the seed pin for each cluster is the earliest posted pin
    const sortedPins = [...mapRenderablePins].sort((a, b) => {
      const timeA = (a.timestamp as any)?.toDate ? (a.timestamp as any).toDate().getTime() : new Date(a.timestamp || 0).getTime();
      const timeB = (b.timestamp as any)?.toDate ? (b.timestamp as any).toDate().getTime() : new Date(b.timestamp || 0).getTime();
      return (timeA || 0) - (timeB || 0);
    });
    const groups: Pin[][] = [];
    const processed = new Set<string>();

    for (const pin of sortedPins) {
      if (processed.has(pin.pinId!)) continue;
      const currentGroup = [pin];
      processed.add(pin.pinId!);

      for (const otherPin of sortedPins) {
        if (processed.has(otherPin.pinId!)) continue;
        if (pin.userId !== otherPin.userId) continue;

        const distance = calculateDistance(pin.latitude, pin.longitude, otherPin.latitude, otherPin.longitude);
        
        if (distance <= 500) {
          currentGroup.push(otherPin);
          processed.add(otherPin.pinId!);
        }
      }
      groups.push(currentGroup);
    }
    groups.sort((groupA, groupB) => {
      const latestA = groupA[groupA.length - 1];
      const latestB = groupB[groupB.length - 1];
      const timeA = (latestA.timestamp as any)?.toDate ? (latestA.timestamp as any).toDate().getTime() : new Date(latestA.timestamp || 0).getTime();
      const timeB = (latestB.timestamp as any)?.toDate ? (latestB.timestamp as any).toDate().getTime() : new Date(latestB.timestamp || 0).getTime();
      return (timeA || 0) - (timeB || 0);
    });
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



  // Helper for formatting follower count
  const formatFollowers = (count: number) => {
    if (!count) return '0';
    if (count >= 1000000) return (count / 1000000).toFixed(1) + 'M';
    if (count >= 1000) return (count / 1000).toFixed(1) + 'k';
    return count.toString();
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

  const handleRegionChange = (region: { latitude: number; longitude: number; latitudeDelta: number; longitudeDelta: number }) => {
    const newScale = (region.latitudeDelta && region.latitudeDelta > 0.05) ? 0.4 : 1.0;
    setZoomScale(prevScale => {
      if (prevScale !== newScale) {
        return newScale;
      }
      return prevScale;
    });
  };

  const handleRegionChangeComplete = (region: { latitude: number; longitude: number; latitudeDelta: number; longitudeDelta: number }) => {
    handleRegionChange(region);
    setCurrentCenterRegion({ latitude: region.latitude, longitude: region.longitude });
  };

  // Default Center coordinates if GPS is loading
  const defaultRegion = {
    latitude: 40.7128,
    longitude: -74.0060,
    latitudeDelta: 0.015,
    longitudeDelta: 0.015
  };

  // Start at user location at street level height if available, else default
  const initialRegion = userLocation ? {
    latitude: userLocation.latitude,
    longitude: userLocation.longitude,
    latitudeDelta: 0.005,
    longitudeDelta: 0.005
  } : defaultRegion;



  // Dynamic Greedy Clustering algorithm removed in favor of react-native-map-clustering

  // Search filter and prioritize sponsored sorting logic
  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const queryStr = searchQuery.toLowerCase().trim();

    const matchedVenues = displayedVenues.filter((venue) => {
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

    // Sort venues: Sponsored first (by tier descending), then others
    matchedVenues.sort((a, b) => {
      if (a.is_sponsored && !b.is_sponsored) return -1;
      if (!a.is_sponsored && b.is_sponsored) return 1;
      if (a.is_sponsored && b.is_sponsored) {
        return (b.sponsor_tier || 0) - (a.sponsor_tier || 0);
      }
      return 0;
    });

    const mappedVenues = matchedVenues.slice(0, 5).map(v => ({ type: 'venue', item: v }));

    const usersMap = new Map();
    const matchedPosts: any[] = [];
    let postCount = 0;

    allPins.forEach(p => {
       if (p.userId && !usersMap.has(p.userId)) {
          usersMap.set(p.userId, {
             userId: p.userId,
             username: p.username || 'Unknown',
             userProfilePic: p.user_profile_pic || null,
             latitude: p.latitude,
             longitude: p.longitude,
          });
       }
       if (postCount < 5 && ((p.text_content || '').toLowerCase().includes(queryStr) || (p.username || '').toLowerCase().includes(queryStr))) {
          if (p.latitude && p.longitude) {
            matchedPosts.push({ type: 'post', item: p });
            postCount++;
          }
       }
    });

    const matchedUsers = Array.from(usersMap.values())
       .filter(u => u.username.toLowerCase().includes(queryStr) && u.latitude && u.longitude)
       .map(u => ({ type: 'user', item: u }))
       .slice(0, 5);

    return [...mappedVenues, ...matchedUsers, ...matchedPosts].slice(0, 8);
  }, [searchQuery, displayedVenues, allPins]);

  const handleSelectSearchResult = (result: any) => {
    setSearchQuery("");
    setIsSearchFocused(false);
    setIsSearchVisible(false);
    Keyboard.dismiss();

    flyToTarget(result.item.latitude, result.item.longitude, () => {
      if (result.type === 'venue') {
        onSelectVenue(result.item);
      }
    });
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Floating Toggle Pills Column (Always Visible) */}
      <View style={styles.togglesContainer}>
        {!isSearchVisible && (
          <TouchableOpacity
            style={[styles.togglePill, { width: 44, height: 44, borderRadius: 22, paddingHorizontal: 0, backgroundColor: '#0F0F14', borderWidth: 0 }]}
            onPress={() => {
              setIsSearchVisible(true);
              setTimeout(() => {
                if (searchInputRef.current) searchInputRef.current.focus();
              }, 100);
            }}
            activeOpacity={0.8}
          >
            <Ionicons name="search-outline" size={20} color={PincTheme.colors.primary} />
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={[styles.togglePill, isFilterFriends && styles.togglePillActive, { width: 44, height: 44, borderRadius: 22, paddingHorizontal: 0, backgroundColor: isFilterFriends ? PincTheme.colors.primary : '#0F0F14', borderWidth: 0 }]}
          onPress={() => setIsFilterFriends(prev => !prev)}
          activeOpacity={0.8}
        >
          <Ionicons name="people-outline" size={22} color={isFilterFriends ? "#FFF" : PincTheme.colors.primary} />
        </TouchableOpacity>
      </View>

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
                {searchResults.map((result: any) => {
                  const item = result.item;
                  return (
                    <TouchableOpacity
                      key={result.type + '-' + (item.venueId || item.pinId || item.userId)}
                      style={styles.resultItem}
                      onPress={() => handleSelectSearchResult(result)}
                    >
                      <View style={[styles.resultCategoryPlaceholder, result.type === 'venue' && { backgroundColor: 'transparent', borderRadius: 4 }]}>
                        {result.type === 'venue' ? (
                          item.custom_icon_url || item.cover_image ? (
                            <Image source={{ uri: item.custom_icon_url || item.cover_image }} style={{ width: 32, height: 32, borderRadius: 4 }} contentFit="contain" />
                          ) : (
                            <Text style={{ fontSize: 14 }}>☕</Text>
                          )
                        ) : result.type === 'user' ? (
                          <Image source={{ uri: item.userProfilePic || 'https://via.placeholder.com/40' }} style={{ width: 32, height: 32, borderRadius: 16 }} contentFit="cover" />
                        ) : (
                          <Image source={{ uri: item.image_url || 'https://via.placeholder.com/40' }} style={{ width: 32, height: 32, borderRadius: 4 }} contentFit="cover" />
                        )}
                      </View>

                      <View style={styles.resultTextContainer}>
                        {result.type === 'venue' ? (
                          <>
                            <Text style={styles.resultName}>{item.name}</Text>
                            <Text style={styles.resultCategory}>{item.category.toUpperCase()}</Text>
                          </>
                        ) : result.type === 'user' ? (
                          <>
                            <Text style={styles.resultName}>{item.username}</Text>
                            <Text style={styles.resultCategory}>USER</Text>
                          </>
                        ) : (
                          <>
                            <Text style={styles.resultName} numberOfLines={1}>{item.text_content || 'Post'}</Text>
                            <Text style={styles.resultCategory}>POST</Text>
                          </>
                        )}
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            )}
          </View>
        )}
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
        customMapStyle={Platform.OS === 'ios' ? pincIOSDarkStyle : pincDarkStyle}
        style={styles.map}
        initialRegion={initialRegion}
        googleMapId={Platform.OS === 'ios' ? undefined : "ffb88fa752b68c8b5ad8c208"}
        mapType="standard"
        showsBuildings={true}
        showsTraffic={false}
        showsIndoors={true}
        showsUserLocation
        showsMyLocationButton={false}
        spiralEnabled={false}
        preserveClusterPressBehavior={true}
        loadingEnabled={true}
        loadingBackgroundColor="#14141e"
        loadingIndicatorColor={PincTheme.colors.primary}
        onRegionChange={handleRegionChange}
        onRegionChangeComplete={handleRegionChangeComplete}
        clusterColor={PincTheme.colors.primary}
        clusterTextColor="#FFFFFF"
        radius={15}
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

          // Find the actual pins in this cluster by sorting validPins by distance
          const sortedByDistance = [...validPins].map(p => {
            const d = Math.pow(p.latitude - centerLat, 2) + Math.pow(p.longitude - centerLng, 2);
            return { p, d };
          }).sort((a, b) => a.d - b.d);
          
          // Get the pins belonging to this cluster
          const clusterPinsRaw = sortedByDistance.slice(0, points).map(item => item.p);
          
          // Calculate max physical distance from center
          let maxPhysicalDistance = 0;
          sortedByDistance.slice(0, points).forEach(item => {
            const dist = calculateDistance(item.p.latitude, item.p.longitude, centerLat, centerLng);
            if (dist > maxPhysicalDistance) maxPhysicalDistance = dist;
          });

          // Sort by timestamp: oldest first (back), newest last (front)
          const clusterPins = clusterPinsRaw.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
          
          // If the cluster spans a large physical distance (> 150m), it's just a zoomed-out grouping.
          // Don't show them as "stacked" (overlapping) because they aren't actually at the same spot.
          // Just show the representative (newest) pin. If they are truly close (<= 150m), show the overlap.
          const displayPins = maxPhysicalDistance > 150 ? clusterPins.slice(-1) : clusterPins.slice(-3);

          const clusterKey = `cluster-${id}-${points}`;
          const baseTierColor = nearestPin ? getTierColor(followerStatsCache[nearestPin.userId] || 0) : '#E0E0E0';

          return (
            <CustomMapMarker key={clusterKey} coordinate={{ latitude: centerLat, longitude: centerLng }} onPress={onPress} zoomScale={zoomScale}>
              <View style={{ alignItems: 'center', paddingBottom: 10, paddingHorizontal: 10, backgroundColor: 'transparent' }}>
                {zoomScale > 0.6 ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    {displayPins.map((pin, index) => {
                      const picUrl = pin.user_profile_pic;
                      const pTierColor = getTierColor(followerStatsCache[pin.userId] || 0);
                      
                      return (
                        <View key={pin.pinId} style={{ 
                          marginLeft: index === 0 ? 0 : -20, // Overlap by roughly half a circle
                          position: 'relative',
                          zIndex: index 
                        }}>
                          {picUrl ? (
                            <RNImage
                              source={{ uri: picUrl }}
                              style={{
                                width: 44,
                                height: 44,
                                borderRadius: 22,
                                borderWidth: 2,
                                borderColor: pTierColor,
                                backgroundColor: PincTheme.colors.card
                              }}
                              resizeMode="cover"
                            />
                          ) : (
                            <View style={{
                              width: 44, height: 44, borderRadius: 22,
                              backgroundColor: pTierColor,
                              borderWidth: 2, borderColor: PincTheme.colors.card
                            }} />
                          )}
                          
                          {/* Show badge only on the very last (front-most) pin if points > 3 */}
                          {index === displayPins.length - 1 && points > 3 && (
                            <View style={{
                              position: 'absolute',
                              bottom: -4, right: -4,
                              backgroundColor: '#FF3B30',
                              borderRadius: 10,
                              paddingHorizontal: 5, paddingVertical: 2,
                              borderWidth: 1.5, borderColor: '#FFFFFF'
                            }}>
                              <Text style={{ color: '#FFFFFF', fontSize: 10, fontWeight: 'bold' }}>{points > 99 ? '99+' : points}</Text>
                            </View>
                          )}
                        </View>
                      );
                    })}
                  </View>
                ) : (
                  <View style={{
                    width: 3, height: 3, borderRadius: 1.5,
                    backgroundColor: baseTierColor
                  }} />
                )}
              </View>
            </CustomMapMarker>
          );
        }}
        onPress={() => {
          setDeleteModePinId(null);
        }}
        onClusterPress={(cluster: any, markers?: any[]) => {
          if (!markers) return;
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

          if (clusterPins.length > 0) {
            clusterPins.sort((a, b) => {
              const timeA = (a.timestamp as any)?.toDate ? (a.timestamp as any).toDate().getTime() : new Date(a.timestamp || 0).getTime();
              const timeB = (b.timestamp as any)?.toDate ? (b.timestamp as any).toDate().getTime() : new Date(b.timestamp || 0).getTime();
              return (timeB || 0) - (timeA || 0);
            });
            setReelsFeedPins(clusterPins);
          }
        }}
      >
        {groupedValidPins.map((group) => {
          const firstPin = group[0];
          const latestPin = group[group.length - 1];
          const isLiveNews = latestPin.post_type === "live_news";
          const isDeleteMode = deleteModePinId === firstPin.pinId;
          const pinKey = `pin-${firstPin.pinId || `${firstPin.latitude}-${firstPin.longitude}-${firstPin.timestamp}`}-${latestPin.user_profile_pic || ''}`;

          const closeSponsor = displayedVenues.find(
            v => v.is_sponsored && calculateDistance(firstPin.latitude, firstPin.longitude, v.latitude, v.longitude) < 10
          );

          let displayLat = firstPin.latitude;
          let displayLng = firstPin.longitude;
          if (closeSponsor) {
            displayLat = firstPin.latitude - 0.00010;
            displayLng = firstPin.longitude + 0.00010;
          }

          return (
            <CustomMapMarker
              key={pinKey}
              identifier={firstPin.pinId}
              coordinate={{ latitude: displayLat, longitude: displayLng }}
              onPress={() => {
                if (isDeleteMode) return;
                if (group.length > 1) {
                  const sortedNewestFirst = [...group].sort((a, b) => {
                    const timeA = (a.timestamp as any)?.toDate ? (a.timestamp as any).toDate().getTime() : new Date(a.timestamp || 0).getTime();
                    const timeB = (b.timestamp as any)?.toDate ? (b.timestamp as any).toDate().getTime() : new Date(b.timestamp || 0).getTime();
                    return (timeB || 0) - (timeA || 0);
                  });
                  setReelsFeedPins(sortedNewestFirst);
                } else {
                  if (onSelectVenue) {
                    onSelectVenue(null as any);
                  }
                  if (firstPin.pinId) {
                    setReelsFeedPins([firstPin]);
                  }
                }
              }}
              onLongPress={() => {
                if (currentUserId && latestPin.userId === currentUserId) {
                  setDeleteModePinId(firstPin.pinId || null);
                }
              }}
              zIndex={closeSponsor ? 100 : 500}
              anchor={{ x: 0.5, y: 0.5 }}
              zoomScale={zoomScale}
            >
              {isDeleteMode && (
                <View style={{ position: 'absolute', top: '50%', left: '50%', marginTop: -20, marginLeft: -18, zIndex: 100, elevation: 20 }}>
                  <TouchableOpacity
                    onPress={(e) => {
                      e.stopPropagation();
                      if (onDeletePin) onDeletePin(firstPin);
                      setDeleteModePinId(null);
                    }}
                    style={{ backgroundColor: PincTheme.colors.card, borderRadius: 20, padding: 2 }}
                  >
                    <Ionicons name="remove-circle" size={32} color="#FF3B30" />
                  </TouchableOpacity>
                </View>
              )}

              <View style={{ alignItems: 'center', paddingBottom: 28, paddingTop: isLiveNews ? 28 : 20, paddingHorizontal: 22, backgroundColor: 'transparent' }}>
                {isLiveNews && zoomScale > 0.6 && (
                  <View style={{
                    position: 'absolute',
                    top: 8,
                    backgroundColor: PincTheme.colors.crowdRed,
                    paddingHorizontal: 6,
                    paddingVertical: 2,
                    borderRadius: 8,
                    zIndex: 20
                  }}>
                    <Text style={{ color: '#FFF', fontSize: 9, fontWeight: '900', letterSpacing: 0.5 }} allowFontScaling={false}>STORY</Text>
                  </View>
                )}
                <View style={{ 
                  position: 'relative', 
                  borderRadius: getMarkerSize(zoomScale) / 2,
                  zIndex: 10
                }}>
                  {zoomScale > 0.6 && (firstPin.pinColor === 'rainbow' ? (
                    <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>
                      {[
                        ...Array.from({ length: 9 }).map((_, i) => {
                          const layerIndex = 9 - i;
                          const spread = 9 + layerIndex;
                          const progress = layerIndex / 9;
                          return {
                            spread: spread,
                            color: '#9400D3',
                            opacity: 0.25 * Math.pow(1 - progress, 2)
                          };
                        }),
                        { spread: 9, color: '#9400D3', opacity: 1.00 },
                        { spread: 7.5, color: '#0044FF', opacity: 1.00 },
                        { spread: 6, color: '#00CC44', opacity: 1.00 },
                        { spread: 4.5, color: '#FFEE00', opacity: 1.00 },
                        { spread: 3, color: '#FF8C00', opacity: 1.00 },
                        { spread: 1.5, color: '#FF0000', opacity: 1.00 },
                      ].map((layer, i) => (
                        <View key={`glow-${i}`} style={{
                          position: 'absolute',
                          top: -layer.spread,
                          left: -layer.spread,
                          width: getMarkerSize(zoomScale) + layer.spread * 2,
                          height: getMarkerSize(zoomScale) + layer.spread * 2,
                          borderRadius: (getMarkerSize(zoomScale) + layer.spread * 2) / 2,
                          backgroundColor: layer.color,
                          opacity: layer.opacity,
                        }} />
                      ))}
                    </View>
                  ) : (
                    Array.from({ length: 9 }).map((_, i) => {
                      const glowSpread = i + 1; // 1px to 9px spread
                      const progress = glowSpread / 9;
                      const opacity = (isLiveNews ? 0.20 : 0.15) * Math.pow(1 - progress, 2);
                      return (
                        <View key={`glow-${i}`} style={{
                          position: 'absolute',
                          top: -glowSpread, left: -glowSpread,
                          width: getMarkerSize(zoomScale) + glowSpread * 2,
                          height: getMarkerSize(zoomScale) + glowSpread * 2,
                          borderRadius: (getMarkerSize(zoomScale) + glowSpread * 2) / 2,
                          backgroundColor: isLiveNews ? PincTheme.colors.crowdRed : (firstPin.pinColor || '#FF69B4'),
                          opacity: opacity,
                        }} />
                      );
                    })
                  ))}
                  {(followerStatsCache[firstPin.userId] || 0) >= 100000000 && (
                    <View style={{ 
                      position: 'absolute', top: -16, left: 0, right: 0, alignItems: 'center', zIndex: 100, elevation: 20
                    }}>
                      <RNImage source={require('../assets/crown.png')} style={{ width: 34, height: 24, resizeMode: 'contain', tintColor: '#FFD700' }} />
                    </View>
                  )}
                  <View style={{
                    width: getMarkerSize(zoomScale),
                    height: getMarkerSize(zoomScale),
                    borderRadius: getMarkerSize(zoomScale) / 2,
                    padding: zoomScale > 0.6 ? (firstPin.pinColor === 'rainbow' ? 0 : 4) : 0,
                    backgroundColor: isLiveNews ? PincTheme.colors.crowdRed : (firstPin.pinColor === 'rainbow' ? (zoomScale > 0.6 ? 'transparent' : '#9400D3') : (firstPin.pinColor || '#FF69B4')),
                    overflow: 'hidden'
                  }}>
                    {zoomScale > 0.6 ? (
                      latestPin.user_profile_pic ? (
                        <RNImage
                          source={{ uri: latestPin.user_profile_pic }}
                          style={{ 
                            width: '100%', 
                            height: '100%', 
                            borderRadius: getMarkerSize(zoomScale) / 2,
                            borderWidth: firstPin.pinColor === 'rainbow' ? 1 : 0.5,
                            borderColor: '#000000'
                          }}
                          resizeMode="cover"
                        />
                      ) : (
                        <View style={{ width: '100%', height: '100%', borderRadius: getMarkerSize(zoomScale) / 2, backgroundColor: PincTheme.colors.card, borderWidth: firstPin.pinColor === 'rainbow' ? 1 : 0.5, borderColor: '#000000' }} />
                      )
                    ) : null}
                  </View>
                  {zoomScale > 0.6 && pioneerPinIds.has(firstPin.pinId || "") && (
                    <View style={{
                      position: 'absolute',
                      bottom: 0,
                      right: 0,
                      backgroundColor: PincTheme.colors.card,
                      borderRadius: 7,
                      width: 14,
                      height: 14,
                      justifyContent: 'center',
                      alignItems: 'center',
                      borderWidth: 1,
                      borderColor: '#FFD700'
                    }}>
                      <Ionicons name="star" size={8} color="#FFD700" />
                    </View>
                  )}
                </View>
                {zoomScale > 0.6 && (
                  <View style={{ marginTop: firstPin.pinColor === 'rainbow' ? 7 : -2, alignItems: 'center', zIndex: 1 }}>
                    <View style={{
                      width: 0,
                      height: 0,
                      borderLeftWidth: 8,
                      borderRightWidth: 8,
                      borderTopWidth: 10,
                      borderLeftColor: 'transparent',
                      borderRightColor: 'transparent',
                      borderTopColor: isLiveNews ? PincTheme.colors.crowdRed : (firstPin.pinColor === 'rainbow' ? '#9400D3' : (firstPin.pinColor || '#FF69B4')),
                    }} />
                  </View>
                )}
                {latestPin.username && zoomScale > 0.6 ? (
                  <View style={{ alignItems: 'center' }}>
                    <Text style={{ marginTop: 2, fontSize: 11, fontWeight: '800', color: PincTheme.colors.textPrimary, textShadowColor: '#000', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3, paddingHorizontal: 4, lineHeight: 15, maxWidth: 120, textAlign: 'center' }} allowFontScaling={false}>
                      {latestPin.username}
                    </Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', paddingBottom: 4 }}>
                      <Ionicons name="people" size={9} color={PincTheme.colors.primary} style={{ marginRight: 2, textShadowColor: '#000', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2 }} />
                      <Text style={{ fontSize: 9, fontWeight: '700', color: PincTheme.colors.primary, textShadowColor: '#000', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2 }} allowFontScaling={false}>
                        {formatFollowers(followerStatsCache[firstPin.userId] || 0)}
                      </Text>
                    </View>
                  </View>
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

        {(() => {
          const sponsored = displayedVenues.filter(venue => venue.is_sponsored);
          const coordsCount: Record<string, number> = {};
          return sponsored.map(venue => {
            const latKey = venue.latitude.toFixed(4);
            const lngKey = venue.longitude.toFixed(4);
            const key = `${latKey},${lngKey}`;
            let lat = venue.latitude;
            let lng = venue.longitude;
            if (coordsCount[key] !== undefined) {
              coordsCount[key]++;
              const count = coordsCount[key];
              const radius = 0.00015 + (Math.floor(count/6) * 0.0001); 
              const angle = count * (Math.PI / 3);
              lat += Math.sin(angle) * radius;
              lng += Math.cos(angle) * radius;
            } else {
              coordsCount[key] = 0;
            }
            return { ...venue, _renderLat: lat, _renderLng: lng };
          });
        })().map(venue => {
          const sponsorKey = `sponsor-${venue.venueId}-${venue.custom_icon_url || venue.cover_image}-${venue.aesthetic_rating}-${venue.crowd_status}`;
          const isZoomedOut = zoomScale <= 0.6;
          const markerHeight = isZoomedOut ? 3 : Math.max(50, getMarkerSize(zoomScale) * 1.2);
          const markerWidth = markerHeight;
          const innerWidth = markerWidth - 4;
          const innerHeight = markerHeight - 4;
          const isCommunity = venue.category?.toLowerCase() === 'community' || venue.category?.toLowerCase() === 'gang';
          const isPincClub = venue.sponsor_tier === 4;
          const useCustomIcon = venue.custom_icon_url && (isCommunity || isPincClub);

          return (
            <CustomMapMarker
              key={sponsorKey}
              coordinate={{ latitude: venue._renderLat, longitude: venue._renderLng }}
              onPress={() => onSelectVenue(venue)}
              zIndex={998}
              anchor={{ x: 0.5, y: 0.5 }}
              zoomScale={zoomScale}
              cluster={false}
            >
              <View style={{ 
                width: 140, 
                height: 140, 
                alignItems: 'center', 
                justifyContent: 'center', 
                backgroundColor: 'transparent' 
              }}>
                {/* 
                  CRITICAL ANDROID BUG FIX: 
                  Android's map engine often fails to render an Image-only marker 
                  unless there is a Text component to force a layout pass. 
                */}
                <Text style={{ width: 0, height: 0, opacity: 0, fontSize: 0 }}>{venue.venueId}</Text>

                {useCustomIcon && !isZoomedOut ? (
                  <View style={{ height: 100, justifyContent: 'center', alignItems: 'center' }}>
                    <RNImage
                      source={{ uri: venue.custom_icon_url }}
                      style={{ width: 100, height: 100 }}
                      resizeMode="contain"
                    />
                  </View>
                ) : (
                  <View style={{
                    width: markerWidth,
                    height: markerHeight,
                    borderRadius: isZoomedOut ? markerHeight / 2 : 10,
                    borderWidth: isZoomedOut ? 0 : 2,
                    borderColor: 'rgba(255, 182, 193, 0.9)',
                    backgroundColor: isZoomedOut ? PincTheme.colors.primary : PincTheme.colors.card,
                    padding: 0,
                    justifyContent: 'center',
                    alignItems: 'center',
                  }}>
                    <View style={{
                      width: innerWidth,
                      height: innerHeight,
                      borderRadius: 8,
                      overflow: 'hidden',
                      justifyContent: 'center',
                      alignItems: 'center',
                    }}>
                    {!isZoomedOut && (
                      <View style={{ width: innerWidth, height: innerHeight, justifyContent: 'center', alignItems: 'center' }}>
                        {venue.cover_image ? (
                          <RNImage
                            source={{ uri: venue.cover_image }}
                            style={{
                              width: innerWidth,
                              height: innerHeight,
                              borderRadius: 8
                            }}
                            resizeMode="cover"
                          />
                        ) : (
                          <View style={{ width: innerWidth, height: innerHeight, borderRadius: 8, backgroundColor: PincTheme.colors.card, justifyContent: 'center', alignItems: 'center' }} />
                        )}
                        <LinearGradient
                          colors={['transparent', 'rgba(0,0,0,0.8)']}
                          style={{ 
                            position: 'absolute', 
                            bottom: 0, left: 0, right: 0, 
                            paddingTop: 12, 
                            paddingBottom: 2, 
                            paddingHorizontal: 4,
                            alignItems: 'center',
                            borderBottomLeftRadius: 8,
                            borderBottomRightRadius: 8,
                          }}
                        >
                          <Text style={{
                            width: '100%',
                            fontSize: 10,
                            fontWeight: 'bold',
                            color: '#FFFFFF',
                            textAlign: 'center',
                            textShadowColor: 'rgba(0, 0, 0, 0.5)',
                            textShadowOffset: { width: 0, height: 1 },
                            textShadowRadius: 2,
                          }} numberOfLines={1} allowFontScaling={false}>
                            {venue.name}
                          </Text>
                        </LinearGradient>
                      </View>
                    )}
                    </View>

                    {/* Review Badge */}
                    {!isZoomedOut && (() => {
                      const rCount = venue.rating_count || allPins.filter(p => p.venueId === venue.venueId).length;
                      // Force display 10+ for demo if count is 0, otherwise show real count
                      const displayCount = rCount === 0 ? '10+' : (rCount >= 10 ? '10+' : rCount.toString());
                      return (
                        <View style={{
                          position: 'absolute',
                          top: -6, 
                          right: -6, 
                          width: 20,
                          height: 20,
                          borderRadius: 10,
                          backgroundColor: '#2C2C2E',
                          borderWidth: 2,
                          borderColor: 'rgba(255, 182, 193, 0.9)',
                          justifyContent: 'center',
                          alignItems: 'center',
                          zIndex: 999,
                          shadowColor: '#000',
                          shadowOffset: { width: 0, height: 2 },
                          shadowOpacity: 0.3,
                          shadowRadius: 2,
                          elevation: 5,
                        }}>
                          <Text style={{ 
                            color: '#FFFFFF', 
                            fontSize: 7.5, 
                            fontWeight: '600', 
                            textAlign: 'center',
                            letterSpacing: -0.3,
                            transform: [{ scaleY: 1.1 }]
                          }} allowFontScaling={false}>
                            {displayCount}
                          </Text>
                        </View>
                      );
                    })()}
                  </View>
                )}
                
                {/* Downward triangle pointer for venue pin - matches pink border */}
                {!isZoomedOut && !useCustomIcon && (
                  <View style={{
                    width: 0,
                    height: 0,
                    borderLeftWidth: 8,
                    borderRightWidth: 8,
                    borderTopWidth: 10,
                    borderLeftColor: 'transparent',
                    borderRightColor: 'transparent',
                    borderTopColor: 'rgba(255, 182, 193, 0.9)',
                    marginTop: -2,
                  }} />
                )}

                {/* Subtitle box */}
                {!isZoomedOut && venue.subtitle ? (
                  <View style={{
                    marginTop: useCustomIcon ? -4 : 3,
                    alignItems: 'center',
                    justifyContent: 'center',
                    maxWidth: 120,
                  }}>
                    <Text style={{
                      color: '#FFF',
                      fontSize: 9,
                      fontWeight: '900',
                      textAlign: 'center',
                      fontFamily: PincTheme.fonts.body,
                      textShadowColor: 'rgba(0, 0, 0, 1)',
                      textShadowOffset: { width: 0, height: 1 },
                      textShadowRadius: 3,
                    }} numberOfLines={2}>
                      {venue.subtitle}
                    </Text>
                  </View>
                ) : null}
              </View>
            </CustomMapMarker>
          );
        })}

      </MapView>

      {settingCrewBaseVenue && (
        <View style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          marginLeft: -45,
          marginTop: -45,
          zIndex: 10,
          alignItems: 'center',
          justifyContent: 'center',
          pointerEvents: 'none' // Ensure clicks pass through to map
        }}>
          <Image 
            source={{ uri: settingCrewBaseVenue.custom_icon_url || settingCrewBaseVenue.cover_image || 'https://via.placeholder.com/90' }} 
            style={{ width: 90, height: 90 }} 
            contentFit="contain"
          />
        </View>
      )}

      {settingCrewBaseVenue && (
        <View style={{ position: 'absolute', bottom: 40, left: 20, right: 20, zIndex: 100, flexDirection: 'row', gap: 12 }}>
          <TouchableOpacity 
            style={{ flex: 1, backgroundColor: '#FFF', paddingVertical: 14, borderRadius: 12, alignItems: 'center', borderWidth: 1, borderColor: '#FFE0E6' }}
            onPress={() => onClearCrewBaseMode && onClearCrewBaseMode()}
            disabled={isUpdatingBase}
          >
            <Text style={{ color: PincTheme.colors.textSecondary, fontWeight: 'bold', fontSize: 14, fontFamily: PincTheme.fonts.heading }}>
              ❌ {locale === 'th' ? 'ยกเลิก' : 'Cancel'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={{ flex: 2, backgroundColor: '#B366FF', paddingVertical: 14, borderRadius: 12, alignItems: 'center', ...PincTheme.shadows.md }}
            onPress={async () => {
              if (!settingCrewBaseVenue) return;
              const targetRegion = currentCenterRegion || 
                (userLocation ? { latitude: userLocation.latitude, longitude: userLocation.longitude } : { latitude: settingCrewBaseVenue.latitude, longitude: settingCrewBaseVenue.longitude });
                
              try {
                setIsUpdatingBase(true);
                const venueRef = doc(db, 'venues', settingCrewBaseVenue.venueId);
                await updateDoc(venueRef, {
                  latitude: targetRegion.latitude,
                  longitude: targetRegion.longitude
                });
                if (onClearCrewBaseMode) onClearCrewBaseMode();
                Alert.alert(
                  locale === 'th' ? 'สำเร็จ' : 'Success',
                  locale === 'th' ? 'อัปเดตพิกัดฐานทัพเรียบร้อยแล้ว' : 'Successfully updated Club Base location.'
                );
              } catch (error) {
                console.error("Error updating venue location: ", error);
                Alert.alert(locale === 'th' ? 'ข้อผิดพลาด' : 'Error', 'Failed to update location.');
              } finally {
                setIsUpdatingBase(false);
              }
            }}
            disabled={isUpdatingBase}
          >
            {isUpdatingBase ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <Text style={{ color: '#FFF', fontWeight: 'bold', fontSize: 14, fontFamily: PincTheme.fonts.heading }}>
                ✅ {locale === 'th' ? 'ยืนยันพิกัดฐานทัพ' : 'Confirm Location'}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      )}

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
        locale={locale}
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
              const mapObj = mapRef.current as any;
              const targetCamera = {
                center: {
                  latitude: loc.coords.latitude,
                  longitude: loc.coords.longitude,
                },
                zoom: 19,
              };
              if (typeof mapObj.animateCamera === 'function') {
                mapObj.animateCamera(targetCamera, { duration: 1000 });
              } else if (typeof mapObj.getMapRef === 'function') {
                mapObj.getMapRef().animateCamera(targetCamera, { duration: 1000 });
              }
            }
          } catch (error) {
            console.warn("Failed to get location on GPS button press", error);
            // Fallback to userLocation state
            if (userLocation && mapRef.current) {
              const mapObj = mapRef.current as any;
              const targetCamera = {
                center: {
                  latitude: userLocation.latitude,
                  longitude: userLocation.longitude,
                },
                zoom: 19,
              };
              if (typeof mapObj.animateCamera === 'function') {
                mapObj.animateCamera(targetCamera, { duration: 1000 });
              } else if (typeof mapObj.getMapRef === 'function') {
                mapObj.getMapRef().animateCamera(targetCamera, { duration: 1000 });
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
        locale={locale}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#212121',
  },
  map: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#212121',
  },
  gpsButton: {
    position: "absolute",
    top: Platform.OS === 'android' ? 170 : 180,
    right: 16,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#0F0F14',
    justifyContent: "center",
    alignItems: "center",
    zIndex: 998,
    ...PincTheme.shadows.md,
  },

  searchContainer: {
    position: "absolute",
    top: Platform.OS === 'android' ? 104 : 106,
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
    backgroundColor: PincTheme.colors.card
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
    backgroundColor: PincTheme.colors.card,
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
    color: PincTheme.colors.textPrimary,
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
    backgroundColor: PincTheme.colors.card,
    padding: 3,
    borderWidth: 1.5,
    borderColor: PincTheme.colors.border,
    // Very strong drop shadow for maximum pop against map
    shadowColor: PincTheme.colors.textPrimary,
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
    backgroundColor: PincTheme.colors.background
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
    shadowColor: PincTheme.colors.textPrimary,
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
    borderColor: PincTheme.colors.border,
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
    backgroundColor: PincTheme.colors.card,
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
    backgroundColor: PincTheme.colors.card,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: PincTheme.colors.textPrimary,
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
    backgroundColor: PincTheme.colors.card,
    padding: 3,
    borderWidth: 2,
    borderColor: PincTheme.colors.crowdRed,
    shadowColor: PincTheme.colors.textPrimary,
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
    backgroundColor: PincTheme.colors.background
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
    top: Platform.OS === 'android' ? 60 : 70,
    right: 16,
    zIndex: 998,
    flexDirection: "column",
    gap: 12
  },
  togglePill: {
    backgroundColor: "#FDFBF7EF",
    borderWidth: 0,
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
    backgroundColor: PincTheme.colors.card,
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
