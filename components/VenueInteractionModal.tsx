import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  Modal,
  TextInput,
  TouchableOpacity,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Image,
  StyleSheet
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { PincTheme } from '../styles/theme';
import {
  VenueMessage,
  subscribeToVenueMessages,
  sendVenueMessage,
  pinVenueMessage,
  deleteVenueMessage
} from '../services/firebase';

interface Props {
  visible: boolean;
  onClose: () => void;
  venueId: string;
  venueName: string;
  mode: 'chat' | 'board';
  currentUser: {
    userId: string;
    username: string;
    profilePic: string;
  };
  isOwner: boolean;
  locale?: 'th' | 'en';
}

export const VenueInteractionModal: React.FC<Props> = ({
  visible,
  onClose,
  venueId,
  venueName,
  mode,
  currentUser,
  isOwner,
  locale = 'th'
}) => {
  const [messages, setMessages] = useState<VenueMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const flatListRef = useRef<FlatList>(null);

  useEffect(() => {
    if (visible && venueId) {
      const unsubscribe = subscribeToVenueMessages(venueId, mode, (msgs) => {
        setMessages(msgs);
        setTimeout(() => {
          flatListRef.current?.scrollToEnd({ animated: true });
        }, 300);
      });
      return () => unsubscribe();
    }
  }, [visible, venueId, mode]);

  const handleSend = async () => {
    if (!inputText.trim()) return;
    const text = inputText.trim();
    
    if (!venueId) {
      Alert.alert("Debug", "venueId is missing");
      return;
    }
    if (!currentUser?.userId) {
      Alert.alert("Debug", "userId is missing");
      return;
    }

    setInputText('');
    try {
      await sendVenueMessage({
        venueId,
        senderId: currentUser.userId,
        senderName: currentUser.username || 'User',
        senderProfilePic: currentUser.profilePic || '',
        text,
        type: mode,
        isPinned: false
      });
    } catch (err: any) {
      console.error("Error sending message:", err);
      Alert.alert("Error", "Could not send message: " + err.message);
    }
  };

  const handleLongPress = (msg: VenueMessage) => {
    if (!isOwner) return; // Only owner can manage messages
    
    Alert.alert(
      locale === 'th' ? "จัดการข้อความ" : "Manage Message",
      locale === 'th' ? "เลือกสิ่งที่ต้องการทำ" : "Choose an action",
      [
        {
          text: msg.isPinned ? (locale === 'th' ? "เลิกปักหมุด" : "Unpin") : (locale === 'th' ? "ปักหมุดข้อความ" : "Pin Message"),
          onPress: () => pinVenueMessage(msg.id!, !msg.isPinned)
        },
        {
          text: locale === 'th' ? "ลบข้อความ" : "Delete Message",
          style: 'destructive',
          onPress: () => {
            Alert.alert(
              locale === 'th' ? "ยืนยัน" : "Confirm",
              locale === 'th' ? "ต้องการลบข้อความนี้ใช่หรือไม่?" : "Are you sure you want to delete?",
              [
                { text: locale === 'th' ? "ยกเลิก" : "Cancel", style: 'cancel' },
                { text: locale === 'th' ? "ลบ" : "Delete", style: 'destructive', onPress: () => deleteVenueMessage(msg.id!) }
              ]
            );
          }
        },
        {
          text: locale === 'th' ? "ปิด" : "Cancel",
          style: 'cancel'
        }
      ]
    );
  };

  const pinnedMessages = messages.filter(m => m.isPinned);
  const title = mode === 'chat'
    ? (locale === 'th' ? 'ห้องแชท: ' : 'Chat: ') + venueName
    : (locale === 'th' ? 'กระดานข่าว: ' : 'Board: ') + venueName;

  const canType = mode === 'chat' || (mode === 'board' && isOwner);

  const renderMessage = ({ item }: { item: VenueMessage }) => {
    const isMe = item.senderId === currentUser.userId;

    return (
      <TouchableOpacity 
        onLongPress={() => handleLongPress(item)}
        activeOpacity={0.8}
        style={[styles.msgContainer, isMe ? styles.msgRight : styles.msgLeft]}
      >
        {!isMe && (
          <Image 
            source={{ uri: item.senderProfilePic || 'https://via.placeholder.com/40' }} 
            style={styles.avatar}
          />
        )}
        <View style={{ maxWidth: '80%' }}>
          {!isMe && <Text style={styles.senderName}>{item.senderName}</Text>}
          <View style={[styles.bubble, isMe ? styles.bubbleRight : styles.bubbleLeft]}>
            <Text style={styles.msgText}>{item.text}</Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  if (!visible) return null;

  return (
    <KeyboardAvoidingView 
      style={[styles.container, StyleSheet.absoluteFill, { zIndex: 1000, elevation: 10 }]} 
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
            <Ionicons name="chevron-down" size={28} color={PincTheme.colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.title} numberOfLines={1}>{title}</Text>
          <View style={{ width: 40 }} />
        </View>

        {/* Pinned Messages Area */}
        {pinnedMessages.length > 0 && (
          <View style={styles.pinnedContainer}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
              <Ionicons name="pin" size={14} color="#FFD700" style={{ marginRight: 4 }} />
              <Text style={{ fontSize: 12, fontWeight: 'bold', color: '#FFD700' }}>
                {locale === 'th' ? "ข้อความปักหมุด" : "Pinned Messages"}
              </Text>
            </View>
            {pinnedMessages.map((msg) => (
              <Text key={`pin-${msg.id}`} style={styles.pinnedText} numberOfLines={2}>
                <Text style={{ fontWeight: 'bold' }}>{msg.senderName}: </Text>
                {msg.text}
              </Text>
            ))}
          </View>
        )}

        {/* Message List */}
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={item => item.id || Math.random().toString()}
          renderItem={renderMessage}
          contentContainerStyle={{ padding: 16 }}
        />

        {/* Input Area */}
        {canType ? (
          <View style={styles.inputContainer}>
            <TextInput
              style={styles.input}
              placeholder={locale === 'th' ? "พิมพ์ข้อความ..." : "Type a message..."}
              placeholderTextColor={PincTheme.colors.textTertiary}
              value={inputText}
              onChangeText={setInputText}
              multiline
            />
            <TouchableOpacity 
              style={[styles.sendBtn, !inputText.trim() && { opacity: 0.5 }]} 
              onPress={handleSend}
              disabled={!inputText.trim()}
            >
              <Ionicons name="send" size={20} color="#FFF" />
            </TouchableOpacity>
          </View>
        ) : (
          <View style={[styles.inputContainer, { justifyContent: 'center' }]}>
            <Text style={{ color: PincTheme.colors.textSecondary, fontStyle: 'italic', fontSize: 13 }}>
              {locale === 'th' ? "เฉพาะเจ้าของร้านที่สามารถพิมพ์ประกาศได้" : "Only the owner can post announcements."}
            </Text>
          </View>
        )}
      </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: PincTheme.colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'ios' ? 50 : 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: PincTheme.colors.border,
    backgroundColor: PincTheme.colors.backgroundSecondary,
  },
  closeBtn: {
    width: 40,
    alignItems: 'flex-start',
  },
  title: {
    fontSize: 16,
    fontWeight: 'bold',
    color: PincTheme.colors.textPrimary,
    flex: 1,
    textAlign: 'center',
  },
  pinnedContainer: {
    backgroundColor: 'rgba(255, 215, 0, 0.1)',
    borderBottomWidth: 1,
    borderBottomColor: '#FFD700',
    padding: 12,
  },
  pinnedText: {
    color: PincTheme.colors.textPrimary,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 2,
  },
  msgContainer: {
    flexDirection: 'row',
    marginBottom: 16,
    alignItems: 'flex-end',
  },
  msgLeft: {
    justifyContent: 'flex-start',
  },
  msgRight: {
    justifyContent: 'flex-end',
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    marginRight: 8,
  },
  senderName: {
    fontSize: 11,
    color: PincTheme.colors.textSecondary,
    marginBottom: 4,
    marginLeft: 4,
  },
  bubble: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 18,
  },
  bubbleLeft: {
    backgroundColor: PincTheme.colors.card,
    borderBottomLeftRadius: 4,
  },
  bubbleRight: {
    backgroundColor: PincTheme.colors.primary,
    borderBottomRightRadius: 4,
  },
  msgText: {
    color: PincTheme.colors.textPrimary,
    fontSize: 14,
    lineHeight: 20,
  },
  inputContainer: {
    flexDirection: 'row',
    padding: 12,
    paddingBottom: Platform.OS === 'ios' ? 32 : 12,
    borderTopWidth: 1,
    borderTopColor: PincTheme.colors.border,
    backgroundColor: PincTheme.colors.backgroundSecondary,
    alignItems: 'flex-end',
  },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 100,
    backgroundColor: PincTheme.colors.card,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
    color: PincTheme.colors.textPrimary,
    marginRight: 8,
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: PincTheme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  }
});
