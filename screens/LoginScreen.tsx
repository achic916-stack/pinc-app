import React, { useState } from "react";
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
  Alert
} from "react-native";
import { PincTheme } from "../styles/theme";
import { signInUser, signUpUser } from "../services/firebase";

interface LoginScreenProps {
  onAuthSuccess: (userProfile: any) => void;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({ onAuthSuccess }) => {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [bio, setBio] = useState("");
  
  const [isLoading, setIsLoading] = useState(false);

  const handleAuth = async () => {
    if (!email || !password) {
      Alert.alert("Missing Fields", "Please enter both Email and Password.");
      return;
    }

    if (isSignUp && !username) {
      Alert.alert("Missing Fields", "Please choose a username.");
      return;
    }

    setIsLoading(true);

    try {
      if (isSignUp) {
        // Register and create profile document in database
        const profile = await signUpUser({
          email,
          password,
          username,
          bio
        });
        Alert.alert("Welcome!", `Account @${profile.username} registered successfully! ✨`);
        onAuthSuccess(profile);
      } else {
        // Log in
        const user = await signInUser(email, password);
        // Success listener in App.tsx will load the profile automatically
      }
    } catch (error: any) {
      console.error(error);
      Alert.alert("Authentication Failed", error.message || "An unexpected error occurred.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={styles.container}
    >
      <ScrollView contentContainerStyle={styles.scrollContainer} keyboardShouldPersistTaps="handled">
        {/* Editorial Heading Panel */}
        <View style={styles.headerPanel}>
          <Text style={styles.logo}>pinc</Text>
          <Text style={styles.tagline}>Live reality check in the café scene.</Text>
        </View>

        {/* Inputs Cards */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{isSignUp ? "Create Account" : "Welcome Back"}</Text>

          {isSignUp && (
            <View style={styles.inputWrapper}>
              <Text style={styles.inputLabel}>USERNAME</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. coffee_wanderer"
                placeholderTextColor={PincTheme.colors.textTertiary}
                autoCapitalize="none"
                autoCorrect={false}
                value={username}
                onChangeText={setUsername}
                editable={!isLoading}
              />
            </View>
          )}

          <View style={styles.inputWrapper}>
            <Text style={styles.inputLabel}>EMAIL ADDRESS</Text>
            <TextInput
              style={styles.input}
              placeholder="name@email.com"
              placeholderTextColor={PincTheme.colors.textTertiary}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              value={email}
              onChangeText={setEmail}
              editable={!isLoading}
            />
          </View>

          <View style={styles.inputWrapper}>
            <Text style={styles.inputLabel}>PASSWORD</Text>
            <TextInput
              style={styles.input}
              placeholder="••••••••"
              placeholderTextColor={PincTheme.colors.textTertiary}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              value={password}
              onChangeText={setPassword}
              editable={!isLoading}
            />
          </View>

          {isSignUp && (
            <View style={styles.inputWrapper}>
              <Text style={styles.inputLabel}>SHORT BIO</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                placeholder="What's your café aesthetic?"
                placeholderTextColor={PincTheme.colors.textTertiary}
                multiline
                numberOfLines={3}
                value={bio}
                onChangeText={setBio}
                editable={!isLoading}
              />
            </View>
          )}

          {/* Submit Button */}
          <TouchableOpacity
            style={[styles.submitBtn, isLoading && styles.submitBtnDisabled]}
            onPress={handleAuth}
            disabled={isLoading}
            activeOpacity={0.85}
          >
            {isLoading ? (
              <ActivityIndicator size="small" color="#FFF" />
            ) : (
              <Text style={styles.submitBtnText}>
                {isSignUp ? "SIGN UP" : "LOG IN"}
              </Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Footer Navigation Switches */}
        <TouchableOpacity
          style={styles.switchButton}
          onPress={() => setIsSignUp(!isSignUp)}
          disabled={isLoading}
        >
          <Text style={styles.switchText}>
            {isSignUp ? (
              <>Already have an account? <Text style={styles.linkText}>Log in</Text></>
            ) : (
              <>New to pinc? <Text style={styles.linkText}>Create an account</Text></>
            )}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: PincTheme.colors.background
  },
  scrollContainer: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: 24,
    paddingVertical: 48
  },
  headerPanel: {
    alignItems: "center",
    marginBottom: 40
  },
  logo: {
    fontFamily: PincTheme.fonts.heading,
    fontSize: 56,
    fontWeight: "900",
    color: PincTheme.colors.primary,
    letterSpacing: -1.5
  },
  tagline: {
    fontFamily: PincTheme.fonts.body,
    fontSize: 14,
    color: PincTheme.colors.textSecondary,
    marginTop: 6,
    letterSpacing: 0.2
  },
  card: {
    backgroundColor: PincTheme.colors.card,
    borderRadius: PincTheme.borderRadius.lg,
    padding: 24,
    borderWidth: 1,
    borderColor: PincTheme.colors.border,
    ...PincTheme.shadows.md
  },
  cardTitle: {
    fontFamily: PincTheme.fonts.heading,
    fontSize: 22,
    fontWeight: "bold",
    color: PincTheme.colors.textPrimary,
    marginBottom: 20
  },
  inputWrapper: {
    marginBottom: 16
  },
  inputLabel: {
    fontFamily: PincTheme.fonts.body,
    fontSize: 10,
    fontWeight: "bold",
    letterSpacing: 1,
    color: PincTheme.colors.textSecondary,
    marginBottom: 6
  },
  input: {
    fontFamily: PincTheme.fonts.body,
    backgroundColor: PincTheme.colors.background,
    borderWidth: 1,
    borderColor: PincTheme.colors.border,
    borderRadius: PincTheme.borderRadius.sm,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 14,
    color: PincTheme.colors.textPrimary
  },
  textArea: {
    height: 80,
    textAlignVertical: "top"
  },
  submitBtn: {
    backgroundColor: PincTheme.colors.primary,
    borderRadius: PincTheme.borderRadius.round,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 12,
    ...PincTheme.shadows.sm
  },
  submitBtnDisabled: {
    backgroundColor: PincTheme.colors.divider
  },
  submitBtnText: {
    color: "#FFF",
    fontFamily: PincTheme.fonts.heading,
    fontWeight: "bold",
    letterSpacing: 1.5,
    fontSize: 13
  },
  switchButton: {
    alignItems: "center",
    marginTop: 24
  },
  switchText: {
    fontFamily: PincTheme.fonts.body,
    fontSize: 13,
    color: PincTheme.colors.textSecondary
  },
  linkText: {
    color: PincTheme.colors.primary,
    fontWeight: "bold"
  }
});
