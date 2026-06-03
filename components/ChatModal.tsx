import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  Modal,
  FlatList,
  TouchableOpacity,
  SafeAreaView,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Image,
} from "react-native";
import { ChatMessage, getChatId, subscribeToMessages, sendMessage } from "../services/firebase";
import { PincTheme } from "../styles/theme";

interface ChatModalProps {
  visible: boolean;
  currentUserId: string;
  targetUserId: string;
  targetUsername: string;
  targetProfilePic: string;
  onClose: () => void;
}

export const ChatModal: React.FC<ChatModalProps> = ({
  visible,
  currentUserId,
  targetUserId,
  targetUsername,
  targetProfilePic,
  onClose
}) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState("");

  const chatId = visible ? getChatId(currentUserId, targetUserId) : "invalid_chat_id";

  useEffect(() => {
    if (!visible || !currentUserId || !targetUserId || chatId === "invalid_chat_id") {
      setMessages([]);
      return;
    }

    let unsubscribe: (() => void) | undefined;
    try {
      unsubscribe = subscribeToMessages(chatId, (newMessages) => {
        setMessages(newMessages);
      }, (err) => {
        console.warn("Chat messages subscription failed:", err);
      });
    } catch (err) {
      console.warn("Failed to set up chat subscription:", err);
    }

    return () => {
      if (unsubscribe) {
        try { unsubscribe(); } catch (_) {}
      }
    };
  }, [visible, chatId, currentUserId, targetUserId]);

  const handleSend = useCallback(async () => {
    const trimmed = inputText.trim();
    if (!trimmed || !currentUserId || !targetUserId || chatId === "invalid_chat_id") return;

    setInputText(""); // Optimistic clear
    try {
      await sendMessage(chatId, currentUserId, trimmed);
    } catch (err) {
      console.warn("Failed to send message:", err);
    }
  }, [inputText, currentUserId, targetUserId, chatId]);

  const handleClose = useCallback(() => {
    onClose();
  }, [onClose]);

  // Let <Modal onRequestClose> handle Android back button instead of BackHandler
  // to avoid conflicts with parent modals.

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={false}
      onRequestClose={handleClose}
    >
      <SafeAreaView style={styles.modalContent}>
        <View style={styles.header}>
          <TouchableOpacity onPress={handleClose} style={styles.backBtn}>
            <Text style={styles.backBtnText}>‹ Back</Text>
          </TouchableOpacity>
          <View style={styles.headerTitleContainer}>
            <Image 
              source={{ uri: targetProfilePic || "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&q=80" }} 
              style={styles.headerAvatar} 
            />
            <Text style={styles.headerTitle}>@{targetUsername}</Text>
          </View>
          <View style={{ width: 60 }} />
        </View>

        <KeyboardAvoidingView 
          style={{ flex: 1 }} 
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <FlatList
            data={messages}
            keyExtractor={item => item.id}
            contentContainerStyle={styles.messageList}
            renderItem={({ item }) => {
              const isMe = item.senderId === currentUserId;
              return (
                <View style={[styles.messageBubble, isMe ? styles.messageMe : styles.messageThem]}>
                  <Text style={[styles.messageText, isMe ? styles.messageTextMe : styles.messageTextThem]}>
                    {item.text}
                  </Text>
                </View>
              );
            }}
          />

          <View style={styles.inputContainer}>
            <TextInput
              style={styles.input}
              placeholder="Message..."
              value={inputText}
              onChangeText={setInputText}
              onSubmitEditing={handleSend}
            />
            <TouchableOpacity style={styles.sendBtn} onPress={handleSend} disabled={!inputText.trim()}>
              <Text style={[styles.sendBtnText, !inputText.trim() && { opacity: 0.5 }]}>Send</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalContent: {
    flex: 1,
    backgroundColor: "#F8F8F8"
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderColor: "#E0E0E0"
  },
  backBtn: {
    width: 60
  },
  backBtnText: {
    fontSize: 16,
    color: PincTheme.colors.primary,
    fontWeight: "bold"
  },
  headerTitleContainer: {
    flexDirection: "row",
    alignItems: "center"
  },
  headerAvatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
    marginRight: 8,
    backgroundColor: "#E0E0E0"
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: "bold",
    color: PincTheme.colors.textPrimary
  },
  messageList: {
    padding: 16,
    paddingBottom: 24
  },
  messageBubble: {
    maxWidth: "75%",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    marginBottom: 8
  },
  messageMe: {
    alignSelf: "flex-end",
    backgroundColor: PincTheme.colors.primary,
    borderBottomRightRadius: 4
  },
  messageThem: {
    alignSelf: "flex-start",
    backgroundColor: "#E0E0E0",
    borderBottomLeftRadius: 4
  },
  messageText: {
    fontSize: 15,
    lineHeight: 20
  },
  messageTextMe: {
    color: "#FFFFFF"
  },
  messageTextThem: {
    color: "#333333"
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    backgroundColor: "#FFFFFF",
    borderTopWidth: 1,
    borderColor: "#E0E0E0"
  },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 100,
    backgroundColor: "#F0F0F0",
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 10,
    fontSize: 15
  },
  sendBtn: {
    marginLeft: 12,
    padding: 8
  },
  sendBtnText: {
    color: PincTheme.colors.primary,
    fontWeight: "bold",
    fontSize: 16
  }
});
