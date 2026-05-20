export const PincTheme = {
  colors: {
    // Brand & UI Backgrounds
    background: "#FDFBF7",    // Editorial warm bone-white
    card: "#FFFFFF",          // Pure white for surface containers
    border: "#EFECE6",        // Light warm separator borders
    divider: "#E8E4DB",       // Slightly darker warm dividers
    
    // Brand Accent
    primary: "#FF4B72",       // Electric Pinc
    primaryLight: "#FFEBF0",  // Very soft blush pink
    primaryDark: "#D8234D",   // Rich berry red
    
    // Typography
    textPrimary: "#1A1A1A",   // Soft charcoal (high contrast, easy on eyes)
    textSecondary: "#7A756B", // Muted taupe/gray for metadata
    textTertiary: "#A39E93",  // Slate sand for captions & disabled states

    // Crowd & Live Status Colors
    crowdGreen: "#2E7D32",    // Empty/Chill (Emerald)
    crowdGreenLight: "#E8F5E9",
    crowdYellow: "#F57C00",   // Moderate (Amber)
    crowdYellowLight: "#FFF3E0",
    crowdRed: "#D32F2F",      // Crowded/Long Queue (Crimson)
    crowdRedLight: "#FFEBEE",

    // Overlay / Backdrop
    backdrop: "rgba(26, 26, 26, 0.4)",
    glassCard: "rgba(255, 255, 255, 0.8)",
  },
  
  fonts: {
    // Editorial headers & callouts
    heading: "Outfit",
    // Clean, readable body texts
    body: "Inter",
  },

  spacing: {
    xs: 4,
    sm: 8,
    md: 16,
    lg: 24,
    xl: 32,
  },

  borderRadius: {
    sm: 8,
    md: 16,
    lg: 24,
    xl: 32,
    round: 9999,
  },

  shadows: {
    sm: {
      shadowColor: "#1A1A1A",
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.05,
      shadowRadius: 4,
      elevation: 2,
    },
    md: {
      shadowColor: "#1A1A1A",
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.08,
      shadowRadius: 12,
      elevation: 5,
    },
    lg: {
      shadowColor: "#1A1A1A",
      shadowOffset: { width: 0, height: 12 },
      shadowOpacity: 0.12,
      shadowRadius: 24,
      elevation: 10,
    },
  }
};

export type ThemeType = typeof PincTheme;
