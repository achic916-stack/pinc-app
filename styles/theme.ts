export const PincTheme = {
  colors: {
    // Brand & UI Backgrounds
    background: "#10101A",    // Deep dark blue/black
    card: "#1A1A2E",          // Dark surface
    border: "rgba(255, 255, 255, 0.1)", // Glass border
    divider: "rgba(255, 255, 255, 0.05)", // Soft divider
    
    // Brand Accent
    primary: "#FF2E63",       // Neon Pink
    primaryLight: "rgba(255, 46, 99, 0.2)", // Translucent pink
    primaryDark: "#D8234D",   // Rich berry red
    
    // Typography
    textPrimary: "#FFFFFF",   // White
    textSecondary: "#A0A0A0", // Light Gray
    textTertiary: "#666666",  // Muted gray

    // Crowd & Live Status Colors
    crowdGreen: "#2E7D32",    // Empty/Chill (Emerald)
    crowdGreenLight: "rgba(46, 125, 50, 0.2)",
    crowdYellow: "#F57C00",   // Moderate (Amber)
    crowdYellowLight: "rgba(245, 124, 0, 0.2)",
    crowdRed: "#D32F2F",      // Crowded/Long Queue (Crimson)
    crowdRedLight: "rgba(211, 47, 47, 0.2)",

    // Overlay / Backdrop
    backdrop: "rgba(0, 0, 0, 0.6)",
    glassCard: "rgba(20, 20, 30, 0.7)",
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
