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
import { Venue, isCampaignActive } from "../services/firebase";

interface MapScreenProps {
  venues: Venue[];
  userLocation: { latitude: number; longitude: number } | null;
  onSelectVenue: (venue: Venue) => void;
  isLoadingVenues: boolean;
  onOpenSettings?: () => void;
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
  userLocation,
  onSelectVenue,
  isLoadingVenues,
  onOpenSettings
}) => {
  const mapRef = useRef<MapView | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearchFocused, setIsSearchFocused] = useState(false);

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

  // Search filter and prioritize sponsored sorting logic
  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const queryStr = searchQuery.toLowerCase().trim();
    
    const matched = venues.filter((venue) => 
      venue.name.toLowerCase().includes(queryStr) || 
      venue.category.toLowerCase().includes(queryStr)
    );

    // Prioritize active sponsored pins at the top of the search result list
    return matched.sort((a, b) => {
      const isSponsoredA = isCampaignActive(a) ? 1 : 0;
      const isSponsoredB = isCampaignActive(b) ? 1 : 0;
      return isSponsoredB - isSponsoredA; // Sponsored (1) comes before Non-sponsored (0)
    });
  }, [searchQuery, venues]);

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
      >
        {venues.map((venue) => {
          const sponsored = isCampaignActive(venue);

          return (
            <Marker
              key={venue.venueId}
              coordinate={{ latitude: venue.latitude, longitude: venue.longitude }}
              onPress={() => onSelectVenue(venue)}
              title={venue.name}
            >
              {sponsored ? (
                /* OVERRIDE: Render Sponsored Pin UI Overrides */
                <View style={styles.customMarkerContainer}>
                  {/* Glowing Radar Pulse Effect for Tier 2 Sponsorship */}
                  {venue.sponsor_tier === 2 && <RadarPulse />}
                  
                  {/* Outer premium gold/pink ring with store logo */}
                  <View style={[styles.sponsoredIconRing, venue.sponsor_tier === 2 && styles.tier2GoldRing]}>
                    <Image source={{ uri: venue.custom_icon_url }} style={styles.sponsoredIconLogo} />
                  </View>

                  <View style={[styles.markerLabelContainer, styles.sponsoredLabel]}>
                    <Text numberOfLines={1} style={styles.markerLabelText}>
                      ⭐️ {venue.name}
                    </Text>
                  </View>
                </View>
              ) : (
                /* STANDARD: Render status color dot */
                (() => {
                  let markerColor = PincTheme.colors.crowdGreen;
                  const status = (venue.crowd_status || "").toLowerCase();
                  if (status === "yellow") {
                    markerColor = PincTheme.colors.crowdYellow;
                  } else if (status === "red") {
                    markerColor = PincTheme.colors.crowdRed;
                  }

                  return (
                    <View style={styles.customMarkerContainer}>
                      <View style={[styles.markerAura, { backgroundColor: markerColor + "22" }]} />
                      <View style={[styles.markerOuterRing, { borderColor: markerColor }]}>
                        <View style={[styles.markerInnerDot, { backgroundColor: markerColor }]} />
                      </View>
                      <View style={styles.markerLabelContainer}>
                        <Text numberOfLines={1} style={styles.markerLabelText}>
                          {venue.name}
                        </Text>
                      </View>
                    </View>
                  );
                })()
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
    height: 60
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
    backgroundColor: "#1A1A1AF5",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    marginTop: 4,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.15)",
    maxWidth: 100
  },
  sponsoredLabel: {
    borderColor: "#FF4B7255",
    backgroundColor: "#111111FA"
  },
  markerLabelText: {
    color: "#FFF",
    fontSize: 9,
    fontWeight: "600",
    fontFamily: PincTheme.fonts.body,
    textAlign: "center"
  },
  settingsButton: {
    padding: 6,
    marginLeft: 4
  },
  settingsIcon: {
    fontSize: 18,
    color: PincTheme.colors.textSecondary
  }
});
