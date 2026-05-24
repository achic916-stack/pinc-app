import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, Modal, FlatList, TouchableOpacity, SafeAreaView, ActivityIndicator } from "react-native";
import { Image } from "expo-image";
import { UserProfile, getFollowingList, getFollowersList } from "../services/firebase";
import { PincTheme } from "../styles/theme";

interface UserListModalProps {
  visible: boolean;
  userId: string;
  type: "followers" | "following" | null;
  onClose: () => void;
  onSelectUser: (userId: string) => void;
  locale?: "en" | "th";
}

export const UserListModal: React.FC<UserListModalProps> = ({
  visible,
  userId,
  type,
  onClose,
  onSelectUser,
  locale = "en"
}) => {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!visible || !userId || !type) return;

    const fetchUsers = async () => {
      setIsLoading(true);
      try {
        if (type === "followers") {
          const followers = await getFollowersList(userId);
          setUsers(followers);
        } else {
          const following = await getFollowingList(userId);
          setUsers(following);
        }
      } catch (err) {
        console.warn("Failed to fetch user list:", err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchUsers();
  }, [visible, userId, type]);

  const title = type === "followers" 
    ? (locale === "th" ? "ผู้ติดตาม" : "Followers")
    : (locale === "th" ? "กำลังติดตาม" : "Following");

  return (
    <Modal visible={visible} animationType="slide" transparent={true} onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <SafeAreaView style={styles.modalContent}>
          <View style={styles.header}>
            <Text style={styles.title}>{title}</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          {isLoading ? (
            <ActivityIndicator size="small" color={PincTheme.colors.primary} style={{ marginTop: 40 }} />
          ) : users.length === 0 ? (
            <Text style={styles.emptyText}>
              {locale === "th" ? "ไม่มีข้อมูล" : "No users found"}
            </Text>
          ) : (
            <FlatList
              data={users}
              keyExtractor={(item) => item.userId}
              renderItem={({ item }) => (
                <TouchableOpacity 
                  style={styles.userRow}
                  onPress={() => {
                    onClose();
                    onSelectUser(item.userId);
                  }}
                >
                  <Image source={{ uri: item.profile_pic }} style={styles.avatar} />
                  <View style={styles.userInfo}>
                    <Text style={styles.username}>@{item.username}</Text>
                    {item.bio ? <Text style={styles.bio} numberOfLines={1}>{item.bio}</Text> : null}
                  </View>
                </TouchableOpacity>
              )}
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
    backgroundColor: PincTheme.colors.backdrop,
    justifyContent: "flex-end"
  },
  modalContent: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    height: "60%",
    padding: 16
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderColor: "#F0F0F0"
  },
  title: {
    fontSize: 18,
    fontWeight: "bold",
    color: PincTheme.colors.textPrimary
  },
  closeBtn: {
    padding: 4
  },
  closeBtnText: {
    fontSize: 18,
    fontWeight: "bold",
    color: PincTheme.colors.textSecondary
  },
  emptyText: {
    textAlign: "center",
    color: PincTheme.colors.textSecondary,
    marginTop: 40
  },
  userRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderColor: "#F0F0F0"
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: "#E0E0E0"
  },
  userInfo: {
    marginLeft: 12,
    flex: 1
  },
  username: {
    fontSize: 16,
    fontWeight: "bold",
    color: PincTheme.colors.textPrimary
  },
  bio: {
    fontSize: 13,
    color: PincTheme.colors.textSecondary,
    marginTop: 2
  }
});
