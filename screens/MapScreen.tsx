import React, { useState, useRef, useMemo, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  SafeAreaView,
  Image,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Animated,
  Keyboard
} from "react-native";
import MapView, { Marker, PROVIDER_GOOGLE } from "react-native-maps";
import { PincTheme } from "../styles/theme";
import { Venue, Pin, isCampaignActive } from "../services/firebase";
import { t } from "../services/localization";

interface MapScreenProps {
  venues: Venue[];
  allPins: Pin[];
  userLocation: { latitude: number; longitude: number } | null;
  onSelectVenue: (venue: Venue) => void;
  isLoadingVenues: boolean;
  onOpenSettings?: () => void;
  followingVenueIds?: Set<string>;
  locale?: "en" | "th";
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

export const MapScreen: React.FC<MapScreenProps> = ({
  venues,
  allPins = [],
  userLocation,
  onSelectVenue,
  isLoadingVenues,
  onOpenSettings,
  followingVenueIds = new Set<string>(),
  locale = "en"
}) => {
  const mapRef = useRef<MapView | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [isFilterFriends, setIsFilterFriends] = useState(false);
  
  // Dynamic zoom scale and region delta tracking
  const [zoomScale, setZoomScale] = useState(1.0);
  const [regionDelta, setRegionDelta] = useState({ latitudeDelta: 0.015, longitudeDelta: 0.015 });

  const handleRegionChangeComplete = (region: { latitude: number; longitude: number; latitudeDelta: number; longitudeDelta: number }) => {
    const delta = region.longitudeDelta || 0.015;
    const baseDelta = 0.015;
    const rawScale = Math.sqrt(baseDelta / delta);
    // Cap scale between 0.5 and 2.0
    const computedScale = Math.max(0.5, Math.min(2.0, rawScale));
    setZoomScale(computedScale);
    setRegionDelta({
      latitudeDelta: region.latitudeDelta || 0.015,
      longitudeDelta: region.longitudeDelta || 0.015
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

  // Filter venues based on isFilterFriends state
  const displayedVenues = useMemo(() => {
    if (!isFilterFriends) return venues;
    return venues.filter((venue) => followingVenueIds.has(venue.venueId));
  }, [venues, isFilterFriends, followingVenueIds]);

  // Dynamic Greedy Clustering algorithm based on map deltas
  const clusteredVenues = useMemo(() => {
    // Overlap threshold: 8% of screen height/width
    const thresholdLat = regionDelta.latitudeDelta * 0.08;
    const thresholdLng = regionDelta.longitudeDelta * 0.08;

    interface ClusterGroup {
      representative: Venue;
      venues: Venue[];
      latestPhotoUrl: string;
      latestPinTimestamp: number;
    }

    // Helper to find latest photo for a venue
    const getVenueLatestPhoto = (v: Venue) => {
      const venuePins = allPins.filter(pin => pin.venueId === v.venueId && pin.image_url);
      const photoUrl = venuePins.length > 0 ? venuePins[0].image_url : v.cover_image;
      const timestamp = venuePins.length > 0 ? new Date(venuePins[0].timestamp).getTime() : 0;
      return { photoUrl, timestamp };
    };

    // Pre-sort displayedVenues:
    // 1. By latest pin timestamp (descending) so the newest photo is always on top.
    // 2. Secondary: by active campaign/sponsored status.
    const sortedVenues = [...displayedVenues].map(venue => {
      const { photoUrl, timestamp } = getVenueLatestPhoto(venue);
      return { venue, photoUrl, timestamp };
    }).sort((a, b) => {
      if (b.timestamp !== a.timestamp) {
        return b.timestamp - a.timestamp;
      }
      const sponsoredA = isCampaignActive(a.venue) ? 1 : 0;
      const sponsoredB = isCampaignActive(b.venue) ? 1 : 0;
      return sponsoredB - sponsoredA;
    });

    const groups: ClusterGroup[] = [];

    sortedVenues.forEach(({ venue, photoUrl, timestamp }) => {
      // Find an existing cluster group whose representative is visually "too close"
      const matchingGroup = groups.find((g) => {
        const rep = g.representative;
        return (
          Math.abs(rep.latitude - venue.latitude) < thresholdLat &&
          Math.abs(rep.longitude - venue.longitude) < thresholdLng
        );
      });

      if (matchingGroup) {
        matchingGroup.venues.push(venue);
      } else {
        groups.push({
          representative: venue,
          venues: [venue],
          latestPhotoUrl: photoUrl,
          latestPinTimestamp: timestamp
        });
      }
    });

    return groups;
  }, [displayedVenues, allPins, regionDelta]);

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
    Keyboard.dismiss();

    if (mapRef.current) {
      mapRef.current.animateToRegion({
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
      <View style={styles.searchContainer}>
        <View style={[styles.searchBar, isSearchFocused && styles.searchBarActive]}>
          <Text style={styles.searchIcon}>🔍</Text>
          <TextInput
            style={styles.searchInput}
            placeholder="Search cafes or categories..."
            placeholderTextColor={PincTheme.colors.textSecondary}
            value={searchQuery}
            onChangeText={setSearchQuery}
            onFocus={() => setIsSearchFocused(true)}
            onBlur={() => setTimeout(() => setIsSearchFocused(false), 200)}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery("")} style={styles.clearButton}>
              <Text style={styles.clearButtonText}>✕</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={onOpenSettings} style={styles.settingsButton} activeOpacity={0.7}>
            <Text style={styles.settingsIcon}>⚙️</Text>
          </TouchableOpacity>
        </View>

        {/* Floating Toggle Pills Row */}
        <View style={styles.togglesRow}>
          <TouchableOpacity
            style={[styles.togglePill, isFilterFriends && styles.togglePillActive]}
            onPress={() => setIsFilterFriends(prev => !prev)}
            activeOpacity={0.8}
          >
            <Text style={[styles.toggleText, isFilterFriends && styles.toggleTextActive]}>
              👥 {t(locale, "friendsOnly")}
            </Text>
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
        showsMyLocationButton
        onRegionChangeComplete={handleRegionChangeComplete}
      >
        {clusteredVenues.map((group) => {
          const venue = group.representative;
          const sponsored = isCampaignActive(venue);

          // Get latest photos for the top 3 venues in this cluster stack
          const getLatestPhotoUrl = (v: Venue) => {
            const venuePins = allPins.filter(pin => pin.venueId === v.venueId && pin.image_url);
            return venuePins.length > 0 ? venuePins[0].image_url : v.cover_image;
          };

          const stackVenues = group.venues.map(v => ({
            venue: v,
            photoUrl: getLatestPhotoUrl(v)
          }));

          // Build stack label: "⭐️ Venue (+N)" or "Venue (+N)"
          const labelText = group.venues.length > 1
            ? `${venue.name} (+${group.venues.length - 1})`
            : venue.name;

          return (
            <Marker
              key={venue.venueId}
              coordinate={{ latitude: venue.latitude, longitude: venue.longitude }}
              onPress={() => onSelectVenue(venue)}
              title={labelText}
            >
              {sponsored ? (
                /* OVERRIDE: Render Sponsored Pin UI Overrides */
                <View style={[styles.customMarkerContainer, { transform: [{ scale: zoomScale }] }]}>
                  {/* Glowing Radar Pulse Effect for Tier 2 Sponsorship */}
                  {venue.sponsor_tier === 2 && <RadarPulse />}
                  
                  {/* Stack Background Ring Effect for Clustered Sponsored Pin with peeking logo */}
                  {stackVenues.length > 1 && (
                    <View style={[styles.sponsoredIconRing, styles.sponsoredStackBack, { transform: [{ rotate: "8deg" }] }]}>
                      {stackVenues[1].venue.custom_icon_url ? (
                        <Image source={{ uri: stackVenues[1].venue.custom_icon_url }} style={styles.sponsoredIconLogo} />
                      ) : null}
                    </View>
                  )}
                  
                  {/* Outer premium gold/pink ring with store logo */}
                  <View style={[styles.sponsoredIconRing, venue.sponsor_tier === 2 && styles.tier2GoldRing]}>
                    <Image source={{ uri: venue.custom_icon_url }} style={styles.sponsoredIconLogo} />
                    {group.venues.length > 1 && (
                      <View style={styles.stackBadge}>
                        <Text style={styles.stackBadgeText}>+{group.venues.length - 1}</Text>
                      </View>
                    )}
                  </View>

                  <View style={[styles.markerLabelContainer, styles.sponsoredLabel]}>
                    <Text numberOfLines={1} style={styles.markerLabelText}>
                      ⭐️ {labelText}
                    </Text>
                  </View>
                </View>
              ) : (
                /* STANDARD: Render Custom white-bordered Photo Pin */
                <View style={[styles.customMarkerContainer, { transform: [{ scale: zoomScale }] }]}>
                  {/* Stack Background Card 2 (Bottom-most) - shows 3rd newest photo */}
                  {stackVenues.length > 2 && (
                    <View style={[styles.photoPinCard, styles.stackCardBack, { transform: [{ rotate: "-6deg" }] }]}>
                      <Image source={{ uri: stackVenues[2].photoUrl }} style={styles.photoPinImage} resizeMode="cover" />
                    </View>
                  )}

                  {/* Stack Background Card 1 (Middle) - shows 2nd newest photo */}
                  {stackVenues.length > 1 && (
                    <View style={[styles.photoPinCard, styles.stackCardMiddle, { transform: [{ rotate: "6deg" }] }]}>
                      <Image source={{ uri: stackVenues[1].photoUrl }} style={styles.photoPinImage} resizeMode="cover" />
                    </View>
                  )}

                  {/* White Rounded Photo Card (Front-most) - shows newest photo */}
                  <View style={styles.photoPinCard}>
                    <Image source={{ uri: stackVenues[0].photoUrl }} style={styles.photoPinImage} resizeMode="cover" />
                    {group.venues.length > 1 && (
                      <View style={styles.stackBadge}>
                        <Text style={styles.stackBadgeText}>+{group.venues.length - 1}</Text>
                      </View>
                    )}
                  </View>
                  
                  {/* Triangular Marker Pointer */}
                  <View style={styles.photoPinPointer} />
                  
                  {/* Venue Name Label below */}
                  <View style={styles.markerLabelContainer}>
                    <Text numberOfLines={1} style={styles.markerLabelText}>
                      {labelText}
                    </Text>
                  </View>
                </View>
              )}
            </Marker>
          );
        })}
      </MapView>
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
    width: 120,
    height: 90
  },
  photoPinCard: {
    width: 70,
    height: 48,
    borderRadius: 8,
    backgroundColor: "#FFFFFF",
    padding: 3,
    borderWidth: 1.5,
    borderColor: "#FFFFFF",
    // soft, narrow faded shadow
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 3,
    justifyContent: "center",
    alignItems: "center",
    zIndex: 10
  },
  photoPinImage: {
    width: 64,
    height: 42,
    borderRadius: 6
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
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 1,
    elevation: 2,
    zIndex: 9
  },
  stackCardBack: {
    position: "absolute",
    top: 4,
    left: 21, // centered horizontal offset shift (120w - 70w) / 2 = 25. Back card is shifted left by 4, so 21.
    backgroundColor: "#F5F2EB",
    borderColor: "#EAE5D8",
    zIndex: -2,
    opacity: 0.8
  },
  stackCardMiddle: {
    position: "absolute",
    top: 2,
    left: 27, // 25 + 2 shift = 27.
    backgroundColor: "#FAF7F0",
    borderColor: "#F0EAE0",
    zIndex: -1,
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
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 2.5,
    borderColor: "#FF4B72",
    backgroundColor: "#FFF",
    alignItems: "center",
    justifyContent: "center",
    ...PincTheme.shadows.md,
    zIndex: 2
  },
  tier2GoldRing: {
    borderColor: "#FFD700"
  },
  sponsoredIconLogo: {
    width: 26,
    height: 26,
    borderRadius: 13
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
    marginTop: 4,
    maxWidth: 110
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
    // Elegant text shadow glow for superior readability on light map styles
    textShadowColor: "#FFFFFF",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3
  },
  settingsButton: {
    padding: 6,
    marginLeft: 4
  },
  settingsIcon: {
    fontSize: 18,
    color: PincTheme.colors.textSecondary
  },
  togglesRow: {
    flexDirection: "row",
    marginTop: 10,
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
  }
});
