import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Modal,
  FlatList,
  TouchableOpacity,
  SafeAreaView,
  ActivityIndicator,
  Image,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { PincTheme } from "../styles/theme";
import {
  subscribeToActiveChats,
  markChatAsRead,
  fetchUserProfile,
  UserProfile,
} from "../services/firebase";
import { ChatModal } from "./ChatModal";

interface ChatInboxModalProps {
  visible: boolean;
  currentUserId: string;
  onClose: () => void;
  locale?: "en" | "th";
}

export const ChatInboxModal: React.FC<ChatInboxModalProps> = ({
  visible,
  currentUserId,
  onClose,
  locale = "en",
}) => {
  const [chats, setChats] = useState<any[]>([]);
  const [userProfiles, setUserProfiles] = useState<{ [userId: string]: UserProfile }>({});
  const [loading, setLoading] = useState(true);
  const [selectedChatUser, setSelectedChatUser] = useState<UserProfile | null>(null);

  // Subscribe to active chats
  useEffect(() => {
    if (!visible || !currentUserId) return;

    setLoading(true);
    const unsubscribe = subscribeToActiveChats(
      currentUserId,
      (activeChats) => {
        // Sort by lastTimestamp desc
        const sorted = [...activeChats].sort((a, b) => (b.lastTimestamp || 0) - (a.lastTimestamp || 0));
        setChats(sorted);
        setLoading(false);

        // Fetch missing user profiles
        sorted.forEach(async (chat) => {
          const otherUserId = chat.participants.find((id: string) => id !== currentUserId);
          if (otherUserId && !userProfiles[otherUserId]) {
            try {
              const profile = await fetchUserProfile(otherUserId);
              if (profile) {
                setUserProfiles((prev) => ({
                  ...prev,
                  [otherUserId]: profile,
                }));
              }
            } catch (err) {
              console.warn("Failed to fetch user profile for chat list:", err);
            }
          }
        });
      },
      (error) => {
        console.warn("Active chats subscription failed:", error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [visible, currentUserId]);

  const handleOpenChat = async (chat: any) => {
    const otherUserId = chat.participants.find((id: string) => id !== currentUserId);
    const otherProfile = userProfiles[otherUserId];
    if (otherProfile) {
      // Mark as read
      await markChatAsRead(chat.id, currentUserId);
      setSelectedChatUser(otherProfile);
    }
  };

  const renderChatItem = ({ item }: { item: any }) => {
    const otherUserId = item.participants.find((id: string) => id !== currentUserId);
    const profile = userProfiles[otherUserId];
    const unreadCount = item[`unreadCount_${currentUserId}`] || 0;

    // Format timestamp
    let timeStr = "";
    if (item.lastTimestamp) {
      const diffMs = Date.now() - item.lastTimestamp;
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMins / 60);
      const diffDays = Math.floor(diffHours / 24);

      if (diffMins < 1) {
        timeStr = locale === "th" ? "เมื่อครู่" : "now";
      } else if (diffMins < 60) {
        timeStr = locale === "th" ? `${diffMins} นาที` : `${diffMins}m`;
      } else if (diffHours < 24) {
        timeStr = locale === "th" ? `${diffHours} ชม.` : `${diffHours}h`;
      } else {
        timeStr = locale === "th" ? `${diffDays} วัน` : `${diffDays}d`;
      }
    }

    return (
      <TouchableOpacity
        style={styles.chatRow}
        onPress={() => handleOpenChat(item)}
        activeOpacity={0.7}
      >
        <Image
          source={{
            uri: profile?.profile_pic || "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&q=80",
          }}
          style={styles.chatAvatar}
        />
        <View style={styles.chatInfo}>
          <Text style={styles.chatUsername} numberOfLines={1}>
            {profile ? `@${profile.username}` : "..."}
          </Text>
          <Text
            style={[styles.chatLastMessage, unreadCount > 0 && styles.chatLastMessageUnread]}
            numberOfLines={1}
          >
            {item.lastMessage || ""}
          </Text>
        </View>
        <View style={styles.chatMeta}>
          <Text style={styles.chatTime}>{timeStr}</Text>
          {unreadCount > 0 && (
            <View style={styles.unreadBadge}>
              <Text style={styles.unreadBadgeText}>{unreadCount}</Text>
            </View>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <Modal
      animationType="slide"
      transparent={true}
      visible={visible}
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <SafeAreaView style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>
              {locale === "th" ? "ข้อความ" : "Messages"}
            </Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Ionicons name="close" size={24} color={PincTheme.colors.textPrimary} />
            </TouchableOpacity>
          </View>

          {loading ? (
            <View style={styles.centerContainer}>
              <ActivityIndicator size="large" color={PincTheme.colors.primary} />
            </View>
          ) : chats.length === 0 ? (
            <View style={styles.centerContainer}>
              <Ionicons name="chatbubbles-outline" size={48} color={PincTheme.colors.textTertiary} />
              <Text style={styles.emptyText}>
                {locale === "th" ? "ยังไม่มีการสนทนา" : "No conversations yet"}
              </Text>
            </View>
          ) : (
            <FlatList
              data={chats}
              keyExtractor={(item) => item.id}
              renderItem={renderChatItem}
              contentContainerStyle={styles.listContent}
            />
          )}

          {/* Chat details modal popup */}
          {selectedChatUser && (
            <ChatModal
              visible={selectedChatUser !== null}
              currentUserId={currentUserId}
              targetUserId={selectedChatUser.userId}
              targetUsername={selectedChatUser.username}
              targetProfilePic={selectedChatUser.profile_pic}
              onClose={() => setSelectedChatUser(null)}
            />
          )}
        </SafeAreaView>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: PincTheme.colors.background,
    borderTopLeftRadius: PincTheme.borderRadius.lg,
    borderTopRightRadius: PincTheme.borderRadius.lg,
    height: "90%",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: PincTheme.colors.border,
  },
  modalTitle: {
    fontFamily: PincTheme.fonts.heading,
    fontSize: 18,
    fontWeight: "700",
    color: PincTheme.colors.textPrimary,
  },
  closeButton: {
    padding: 4,
  },
  centerContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 12,
  },
  emptyText: {
    fontSize: 14,
    color: PincTheme.colors.textTertiary,
    fontFamily: PincTheme.fonts.body,
  },
  listContent: {
    paddingVertical: 8,
  },
  chatRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: PincTheme.colors.border,
  },
  chatAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: PincTheme.colors.border,
  },
  chatInfo: {
    flex: 1,
    marginLeft: 14,
    justifyContent: "center",
  },
  chatUsername: {
    fontSize: 14,
    fontWeight: "700",
    color: PincTheme.colors.textPrimary,
    fontFamily: PincTheme.fonts.heading,
  },
  chatLastMessage: {
    fontSize: 12,
    color: PincTheme.colors.textSecondary,
    fontFamily: PincTheme.fonts.body,
    marginTop: 4,
  },
  chatLastMessageUnread: {
    fontWeight: "700",
    color: PincTheme.colors.textPrimary,
  },
  chatMeta: {
    alignItems: "flex-end",
    justifyContent: "center",
    marginLeft: 10,
  },
  chatTime: {
    fontSize: 10,
    color: PincTheme.colors.textTertiary,
    fontFamily: PincTheme.fonts.body,
    marginBottom: 4,
  },
  unreadBadge: {
    backgroundColor: PincTheme.colors.primary,
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 6,
  },
  unreadBadgeText: {
    color: "#FFF",
    fontSize: 10,
    fontWeight: "bold",
  },
});
