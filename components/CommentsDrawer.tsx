import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  TextInput,
  ScrollView,
  Modal,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView
} from "react-native";
import { PincTheme } from "../styles/theme";
import {
  UserProfile,
  Comment,
  addComment,
  subscribeToComments
} from "../services/firebase";
import { t } from "../services/localization";

interface CommentsDrawerProps {
  visible: boolean;
  pinId: string | null;
  currentUser: UserProfile;
  onClose: () => void;
  locale?: "en" | "th";
  onOpenUserProfile?: (userId: string) => void;
}

export const CommentsDrawer: React.FC<CommentsDrawerProps> = ({
  visible,
  pinId,
  currentUser,
  onClose,
  locale = "en",
  onOpenUserProfile
}) => {
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentText, setCommentText] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const scrollViewRef = useRef<ScrollView>(null);

  useEffect(() => {
    if (!visible || !pinId) {
      setComments([]);
      return;
    }

    setIsLoading(true);
    const unsubscribe = subscribeToComments(
      pinId,
      (updatedComments) => {
        setComments(updatedComments);
        setIsLoading(false);
        // Scroll to bottom on load
        setTimeout(() => {
          scrollViewRef.current?.scrollToEnd({ animated: true });
        }, 100);
      },
      (err) => {
        console.warn("Failed to subscribe to comments:", err);
        setIsLoading(false);
      }
    );

    return () => unsubscribe();
  }, [visible, pinId]);

  const handleSendComment = async () => {
    if (!pinId || !commentText.trim() || isSending) return;

    const trimmedText = commentText.trim();
    setCommentText(""); // Clear input early

    // Optimistic Update: instantly append comment locally
    const optimisticComment: Comment = {
      commentId: `mock_${Date.now()}`,
      pinId,
      userId: currentUser.userId,
      username: currentUser.username,
      user_profile_pic: currentUser.profile_pic,
      text: trimmedText,
      timestamp: new Date()
    };

    setComments((prev) => [...prev, optimisticComment]);
    
    // Scroll to bottom
    setTimeout(() => {
      scrollViewRef.current?.scrollToEnd({ animated: true });
    }, 50);

    setIsSending(true);
    try {
      await addComment(pinId, {
        pinId,
        userId: currentUser.userId,
        username: currentUser.username,
        user_profile_pic: currentUser.profile_pic,
        text: trimmedText
      });
    } catch (err) {
      console.warn("Failed to submit comment:", err);
      // Revert optimistic addition on failure
      setComments((prev) => prev.filter((c) => c.commentId !== optimisticComment.commentId));
    } finally {
      setIsSending(false);
    }
  };

  const handleAvatarPress = (commentUserId: string) => {
    onClose();
    if (onOpenUserProfile) {
      onOpenUserProfile(commentUserId);
    }
  };

  if (!visible || !pinId) return null;

  return (
    <Modal
      animationType="slide"
      transparent={true}
      visible={visible}
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.modalContent}
          keyboardVerticalOffset={Platform.OS === "ios" ? 40 : 0}
        >
          <SafeAreaView style={{ flex: 1 }}>
            {/* Header */}
            <View style={styles.header}>
              <View style={styles.dragIndicator} />
              <Text style={styles.headerTitle}>{t(locale, "commentsTitle")}</Text>
              <TouchableOpacity style={styles.closeButton} onPress={onClose}>
                <Text style={styles.closeText}>✕</Text>
              </TouchableOpacity>
            </View>

            {/* Comments List */}
            {isLoading ? (
              <View style={styles.loaderContainer}>
                <ActivityIndicator size="small" color={PincTheme.colors.primary} />
              </View>
            ) : comments.length === 0 ? (
              <ScrollView 
                ref={scrollViewRef} 
                contentContainerStyle={styles.emptyContainer}
                showsVerticalScrollIndicator={false}
              >
                <Text style={styles.emptyIcon}>💬</Text>
                <Text style={styles.emptyText}>{t(locale, "noCommentsYet")}</Text>
              </ScrollView>
            ) : (
              <ScrollView
                ref={scrollViewRef}
                style={styles.feedContainer}
                contentContainerStyle={{ paddingBottom: 20 }}
                showsVerticalScrollIndicator={false}
              >
                {comments.map((comment) => {
                  const isOwnComment = comment.userId === currentUser.userId;
                  const commentDate = comment.timestamp instanceof Date ? comment.timestamp : new Date(comment.timestamp);
                  return (
                    <View key={comment.commentId} style={styles.commentCard}>
                      <TouchableOpacity onPress={() => handleAvatarPress(comment.userId)}>
                        <Image source={{ uri: comment.user_profile_pic }} style={styles.avatar} />
                      </TouchableOpacity>
                      <View style={styles.commentDetails}>
                        <View style={styles.commentHeader}>
                          <Text style={styles.commentUser}>@{comment.username}</Text>
                          {isOwnComment && (
                            <View style={styles.youBadge}>
                              <Text style={styles.youBadgeText}>YOU</Text>
                            </View>
                          )}
                          <Text style={styles.bulletSeparator}>•</Text>
                          <Text style={styles.commentTime}>
                            {commentDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                          </Text>
                        </View>
                        <Text style={styles.commentText}>{comment.text}</Text>
                      </View>
                    </View>
                  );
                })}
              </ScrollView>
            )}

            {/* Input Bar */}
            <View style={styles.inputContainer}>
              <Image source={{ uri: currentUser.profile_pic }} style={styles.inputAvatar} />
              <TextInput
                style={styles.textInput}
                placeholder={t(locale, "addCommentPlaceholder")}
                placeholderTextColor={PincTheme.colors.textTertiary}
                value={commentText}
                onChangeText={setCommentText}
                maxLength={200}
                multiline={false}
                returnKeyType="send"
                onSubmitEditing={handleSendComment}
              />
              <TouchableOpacity
                style={[
                  styles.sendButton,
                  !commentText.trim() && styles.sendButtonDisabled
                ]}
                onPress={handleSendComment}
                disabled={!commentText.trim() || isSending}
              >
                {isSending ? (
                  <ActivityIndicator size="small" color="#FFF" />
                ) : (
                  <Text style={styles.sendButtonText}>{t(locale, "sendComment")}</Text>
                )}
              </TouchableOpacity>
            </View>
          </SafeAreaView>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: PincTheme.colors.backdrop,
    justifyContent: "flex-end"
  },
  modalContent: {
    backgroundColor: PincTheme.colors.background,
    borderTopLeftRadius: PincTheme.borderRadius.lg,
    borderTopRightRadius: PincTheme.borderRadius.lg,
    height: "75%",
    ...PincTheme.shadows.lg
  },
  header: {
    alignItems: "center",
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: PincTheme.colors.border,
    position: "relative"
  },
  dragIndicator: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: PincTheme.colors.divider,
    marginBottom: 8
  },
  headerTitle: {
    fontSize: 15,
    fontFamily: PincTheme.fonts.heading,
    fontWeight: "700",
    color: PincTheme.colors.textPrimary
  },
  closeButton: {
    position: "absolute",
    right: 16,
    top: 14,
    padding: 4
  },
  closeText: {
    fontSize: 16,
    color: PincTheme.colors.textSecondary,
    fontWeight: "bold"
  },
  loaderContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center"
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 32
  },
  emptyIcon: {
    fontSize: 40,
    marginBottom: 12
  },
  emptyText: {
    fontSize: 13,
    fontFamily: PincTheme.fonts.body,
    color: PincTheme.colors.textSecondary,
    textAlign: "center"
  },
  feedContainer: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 16
  },
  commentCard: {
    flexDirection: "row",
    marginBottom: 16,
    alignItems: "flex-start"
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: PincTheme.colors.border
  },
  commentDetails: {
    flex: 1,
    marginLeft: 12,
    backgroundColor: PincTheme.colors.card,
    borderRadius: PincTheme.borderRadius.sm,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: PincTheme.colors.border
  },
  commentHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 4
  },
  commentUser: {
    fontSize: 12,
    fontFamily: PincTheme.fonts.heading,
    fontWeight: "700",
    color: PincTheme.colors.textPrimary
  },
  youBadge: {
    backgroundColor: PincTheme.colors.primaryLight,
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 4,
    marginLeft: 4
  },
  youBadgeText: {
    fontSize: 8,
    fontWeight: "bold",
    color: PincTheme.colors.primary
  },
  bulletSeparator: {
    fontSize: 10,
    color: PincTheme.colors.textTertiary,
    marginHorizontal: 6
  },
  commentTime: {
    fontSize: 10,
    fontFamily: PincTheme.fonts.body,
    color: PincTheme.colors.textTertiary
  },
  commentText: {
    fontSize: 12,
    fontFamily: PincTheme.fonts.body,
    color: PincTheme.colors.textPrimary,
    lineHeight: 16
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: PincTheme.colors.border,
    backgroundColor: PincTheme.colors.card
  },
  inputAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: PincTheme.colors.border
  },
  textInput: {
    flex: 1,
    height: 38,
    backgroundColor: PincTheme.colors.background,
    borderWidth: 1,
    borderColor: PincTheme.colors.border,
    borderRadius: PincTheme.borderRadius.round,
    paddingHorizontal: 16,
    marginLeft: 10,
    fontSize: 13,
    color: PincTheme.colors.textPrimary,
    fontFamily: PincTheme.fonts.body
  },
  sendButton: {
    backgroundColor: PincTheme.colors.primary,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: PincTheme.borderRadius.round,
    marginLeft: 10,
    justifyContent: "center",
    alignItems: "center"
  },
  sendButtonDisabled: {
    backgroundColor: PincTheme.colors.textTertiary
  },
  sendButtonText: {
    color: "#FFF",
    fontFamily: PincTheme.fonts.heading,
    fontWeight: "700",
    fontSize: 12
  }
});
