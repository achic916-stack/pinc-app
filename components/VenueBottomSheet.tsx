import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Image,
  Dimensions,
  ActivityIndicator
} from "react-native";
import { PincTheme } from "../styles/theme";
import { Venue, Pin } from "../services/firebase";

interface VenueBottomSheetProps {
  venue: Venue | null;
  pins: Pin[];
  isLoadingPins: boolean;
  onClose: () => void;
}

const { height: SCREEN_HEIGHT } = Dimensions.get("window");

export const VenueBottomSheet: React.FC<VenueBottomSheetProps> = ({
  venue,
  pins,
  isLoadingPins,
  onClose
}) => {
  const [activeTab, setActiveTab] = useState<"aesthetic" | "reality">("aesthetic");

  if (!venue) return null;

  // Filter real-time pins for "The Reality" feed (today's posts or recent chronological)
  const isToday = (date: Date) => {
    const today = new Date();
    return (
      date.getDate() === today.getDate() &&
      date.getMonth() === today.getMonth() &&
      date.getFullYear() === today.getFullYear()
    );
  };

  // Curated, beautiful aesthetic photos (mocked or loaded from venue's highly rated assets)
  const aestheticImages = [
    venue.cover_image,
    "https://images.unsplash.com/photo-1554118811-1e0d58224f24?auto=format&fit=crop&w=600&q=80",
    "https://images.unsplash.com/photo-1498804103079-a6351b050096?auto=format&fit=crop&w=600&q=80",
    "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=600&q=80",
    "https://images.unsplash.com/photo-1559925393-8be0ec4767c8?auto=format&fit=crop&w=600&q=80",
    "https://images.unsplash.com/photo-1521017432531-fbd92d768814?auto=format&fit=crop&w=600&q=80"
  ];

  return (
    <View style={styles.sheetContainer}>
      {/* Drag Indicator / Header */}
      <View style={styles.header}>
        <View style={styles.dragIndicator} />
        <TouchableOpacity style={styles.closeButton} onPress={onClose}>
          <Text style={styles.closeText}>✕</Text>
        </TouchableOpacity>
      </View>

      {/* Venue Header Info */}
      <View style={styles.venueInfo}>
        <View style={styles.titleRow}>
          <Text style={styles.venueName}>{venue.name}</Text>
          <View style={styles.ratingBadge}>
            <Text style={styles.ratingText}>★ {venue.aesthetic_rating.toFixed(1)}</Text>
          </View>
        </View>

        <View style={styles.metaRow}>
          <Text style={styles.categoryText}>{venue.category.toUpperCase()}</Text>
          <View style={styles.bulletSeparator} />
          
          {/* Dynamic Crowd Status Badge */}
          <View
            style={[
              styles.crowdBadge,
              venue.crowd_status === "Green" && styles.badgeGreen,
              venue.crowd_status === "Yellow" && styles.badgeYellow,
              venue.crowd_status === "Red" && styles.badgeRed
            ]}
          >
            <View
              style={[
                styles.crowdIndicatorDot,
                venue.crowd_status === "Green" && { backgroundColor: PincTheme.colors.crowdGreen },
                venue.crowd_status === "Yellow" && { backgroundColor: PincTheme.colors.crowdYellow },
                venue.crowd_status === "Red" && { backgroundColor: PincTheme.colors.crowdRed }
              ]}
            />
            <Text
              style={[
                styles.crowdText,
                venue.crowd_status === "Green" && { color: PincTheme.colors.crowdGreen },
                venue.crowd_status === "Yellow" && { color: PincTheme.colors.crowdYellow },
                venue.crowd_status === "Red" && { color: PincTheme.colors.crowdRed }
              ]}
            >
              {venue.crowd_status === "Green" && "Empty / Chill"}
              {venue.crowd_status === "Yellow" && "Moderate Queue"}
              {venue.crowd_status === "Red" && "Crowded / Long Line"}
            </Text>
          </View>
        </View>
      </View>

      {/* Premium Sliding Navigation Tabs */}
      <View style={styles.tabsContainer}>
        <TouchableOpacity
          style={[styles.tabButton, activeTab === "aesthetic" && styles.activeTabButton]}
          onPress={() => setActiveTab("aesthetic")}
        >
          <Text style={[styles.tabLabel, activeTab === "aesthetic" && styles.activeTabLabel]}>
            ✨ The Aesthetic
          </Text>
          <Text style={styles.tabSubLabel}>IG Vibe (Curated)</Text>
          {activeTab === "aesthetic" && <View style={styles.tabIndicator} />}
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabButton, activeTab === "reality" && styles.activeTabButton]}
          onPress={() => setActiveTab("reality")}
        >
          <Text style={[styles.tabLabel, activeTab === "reality" && styles.activeTabLabel]}>
            ⚡ The Reality
          </Text>
          <Text style={styles.tabSubLabel}>X Speed (Live Check)</Text>
          {activeTab === "reality" && <View style={styles.tabIndicator} />}
        </TouchableOpacity>
      </View>

      {/* Tab View Contents */}
      <View style={styles.contentContainer}>
        {activeTab === "aesthetic" ? (
          /* Tab 1: Aesthetic (Polished IG Grid) */
          <ScrollView contentContainerStyle={styles.gridContainer} showsVerticalScrollIndicator={false}>
            {aestheticImages.map((uri, index) => (
              <View key={index} style={styles.gridImageWrapper}>
                <Image source={{ uri }} style={styles.gridImage} resizeMode="cover" />
              </View>
            ))}
          </ScrollView>
        ) : (
          /* Tab 2: The Reality (Real-time X Chronological Feed) */
          <View style={{ flex: 1 }}>
            {isLoadingPins ? (
              <View style={styles.loaderContainer}>
                <ActivityIndicator size="small" color={PincTheme.colors.primary} />
                <Text style={styles.loaderText}>Fetching live reports...</Text>
              </View>
            ) : pins.length === 0 ? (
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyTitle}>No live checks today ☕</Text>
                <Text style={styles.emptySubtitle}>
                  Be the first to post a raw reality check for this venue using the pinc button below!
                </Text>
              </View>
            ) : (
              <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }}>
                {pins.map((pin) => {
                  const isPostToday = isToday(pin.timestamp);
                  return (
                    <View key={pin.pinId} style={styles.feedCard}>
                      <View style={styles.feedHeader}>
                        <Image source={{ uri: pin.user_profile_pic }} style={styles.avatar} />
                        <View style={styles.userMeta}>
                          <Text style={styles.username}>@{pin.username}</Text>
                          <Text style={styles.timestamp}>
                            {isPostToday ? "Today" : "Yesterday"} at{" "}
                            {pin.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                          </Text>
                        </View>
                        
                        {/* Live Location verification Badge */}
                        {pin.is_live && (
                          <View style={styles.liveBadge}>
                            <Text style={styles.liveBadgeText}>✓ VERIFIED LIVE</Text>
                          </View>
                        )}
                      </View>
                      
                      <Text style={styles.feedText}>{pin.text_content}</Text>
                      
                      {pin.image_url && (
                        <Image source={{ uri: pin.image_url }} style={styles.feedImage} resizeMode="cover" />
                      )}
                    </View>
                  );
                })}
              </ScrollView>
            )}
          </View>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  sheetContainer: {
    height: SCREEN_HEIGHT * 0.6,
    backgroundColor: PincTheme.colors.background,
    borderTopLeftRadius: PincTheme.borderRadius.lg,
    borderTopRightRadius: PincTheme.borderRadius.lg,
    ...PincTheme.shadows.lg,
    display: "flex",
    flexDirection: "column"
  },
  header: {
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: PincTheme.colors.border,
    position: "relative"
  },
  dragIndicator: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: PincTheme.colors.divider
  },
  closeButton: {
    position: "absolute",
    right: 16,
    top: 6,
    padding: 8
  },
  closeText: {
    fontSize: 16,
    color: PincTheme.colors.textSecondary,
    fontWeight: "600"
  },
  venueInfo: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
    backgroundColor: PincTheme.colors.card
  },
  titleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center"
  },
  venueName: {
    fontSize: 22,
    fontFamily: PincTheme.fonts.heading,
    color: PincTheme.colors.textPrimary,
    fontWeight: "bold",
    flex: 1,
    paddingRight: 12
  },
  ratingBadge: {
    backgroundColor: PincTheme.colors.primaryLight,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: PincTheme.borderRadius.sm
  },
  ratingText: {
    color: PincTheme.colors.primary,
    fontFamily: PincTheme.fonts.body,
    fontWeight: "bold",
    fontSize: 14
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 8
  },
  categoryText: {
    fontSize: 11,
    fontFamily: PincTheme.fonts.body,
    letterSpacing: 0.8,
    fontWeight: "bold",
    color: PincTheme.colors.textSecondary
  },
  bulletSeparator: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: PincTheme.colors.textTertiary,
    marginHorizontal: 8
  },
  crowdBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: PincTheme.borderRadius.round
  },
  badgeGreen: {
    backgroundColor: PincTheme.colors.crowdGreenLight
  },
  badgeYellow: {
    backgroundColor: PincTheme.colors.crowdYellowLight
  },
  badgeRed: {
    backgroundColor: PincTheme.colors.crowdRedLight
  },
  crowdIndicatorDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 6
  },
  crowdText: {
    fontSize: 11,
    fontFamily: PincTheme.fonts.body,
    fontWeight: "bold"
  },
  tabsContainer: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: PincTheme.colors.border,
    backgroundColor: PincTheme.colors.card
  },
  tabButton: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 12,
    position: "relative"
  },
  activeTabButton: {
    backgroundColor: "#FAF9F5"
  },
  tabLabel: {
    fontSize: 14,
    fontFamily: PincTheme.fonts.heading,
    fontWeight: "600",
    color: PincTheme.colors.textSecondary
  },
  activeTabLabel: {
    color: PincTheme.colors.primary
  },
  tabSubLabel: {
    fontSize: 10,
    fontFamily: PincTheme.fonts.body,
    color: PincTheme.colors.textTertiary,
    marginTop: 2
  },
  tabIndicator: {
    position: "absolute",
    bottom: 0,
    width: "40%",
    height: 3,
    backgroundColor: PincTheme.colors.primary,
    borderTopLeftRadius: 2,
    borderTopRightRadius: 2
  },
  contentContainer: {
    flex: 1,
    backgroundColor: PincTheme.colors.background
  },
  gridContainer: {
    padding: 12,
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between"
  },
  gridImageWrapper: {
    width: "48%",
    aspectRatio: 1,
    borderRadius: PincTheme.borderRadius.md,
    overflow: "hidden",
    marginBottom: 12,
    ...PincTheme.shadows.sm
  },
  gridImage: {
    width: "100%",
    height: "100%"
  },
  loaderContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center"
  },
  loaderText: {
    marginTop: 8,
    color: PincTheme.colors.textSecondary,
    fontFamily: PincTheme.fonts.body
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 32
  },
  emptyTitle: {
    fontSize: 16,
    fontFamily: PincTheme.fonts.heading,
    fontWeight: "bold",
    color: PincTheme.colors.textPrimary,
    marginBottom: 8
  },
  emptySubtitle: {
    fontSize: 12,
    fontFamily: PincTheme.fonts.body,
    color: PincTheme.colors.textSecondary,
    textAlign: "center",
    lineHeight: 18
  },
  feedCard: {
    backgroundColor: PincTheme.colors.card,
    borderRadius: PincTheme.borderRadius.md,
    padding: 16,
    marginHorizontal: 16,
    marginTop: 12,
    borderWidth: 1,
    borderColor: PincTheme.colors.border,
    ...PincTheme.shadows.sm
  },
  feedHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    marginRight: 10
  },
  userMeta: {
    flex: 1
  },
  username: {
    fontSize: 13,
    fontFamily: PincTheme.fonts.body,
    fontWeight: "bold",
    color: PincTheme.colors.textPrimary
  },
  timestamp: {
    fontSize: 10,
    fontFamily: PincTheme.fonts.body,
    color: PincTheme.colors.textTertiary,
    marginTop: 1
  },
  liveBadge: {
    backgroundColor: "rgba(46, 125, 50, 0.1)",
    borderColor: PincTheme.colors.crowdGreen,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4
  },
  liveBadgeText: {
    fontSize: 9,
    fontFamily: PincTheme.fonts.body,
    fontWeight: "bold",
    color: PincTheme.colors.crowdGreen
  },
  feedText: {
    fontSize: 13,
    fontFamily: PincTheme.fonts.body,
    color: PincTheme.colors.textPrimary,
    lineHeight: 18,
    marginBottom: 10
  },
  feedImage: {
    width: "100%",
    height: 180,
    borderRadius: PincTheme.borderRadius.sm,
    overflow: "hidden"
  }
});
