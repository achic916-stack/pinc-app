import React from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  SafeAreaView
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { PincTheme } from '../styles/theme';

interface PrivacyPolicyModalProps {
  visible: boolean;
  onClose: () => void;
  locale?: 'th' | 'en';
}

export const PrivacyPolicyModal: React.FC<PrivacyPolicyModalProps> = ({
  visible,
  onClose,
  locale = 'en'
}) => {
  const isTh = locale === 'th';

  return (
    <Modal visible={visible} animationType="slide" transparent={false} onRequestClose={onClose}>
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>
            {isTh ? "นโยบายความเป็นส่วนตัว & ข้อตกลง EULA" : "Privacy Policy & EULA"}
          </Text>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
            <Ionicons name="close" size={24} color={PincTheme.colors.textPrimary} />
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.content} contentContainerStyle={{ paddingBottom: 40 }}>
          <Text style={styles.sectionTitle}>
            {isTh ? "1. นโยบายการใช้ข้อมูลตำแหน่ง (Location Data Privacy)" : "1. Location Data & Map Privacy"}
          </Text>
          <Text style={styles.paragraph}>
            {isTh
              ? "แอปพลิเคชัน pinc มีการเข้าถึงและใช้งานข้อมูลตำแหน่งพิกัด GPS (Precise Location) ของคุณเพื่อแสดงกิจกรรม หมุดเช็กอิน และบรรยากาศสดของสถานที่บนแผนที่ 3D ให้แก่ผู้ใช้อื่นในระบบ คุณสามารถเลือกเปิดใช้งานเซฟโซน (Safe Zone Privacy) เพื่อสุ่มเบี่ยงเบนพิกัด 500m หรือใช้โหมดโพสต์แบบนิรนาม (Anonymous Mode) ได้ตลอดเวลา"
              : "pinc accesses and processes your Precise Location data to display venue pins, live reality checks, and activity on the 3D public map for other users. You can enable Safe Zone Privacy (500m protection) or Anonymous Vibe Check mode anytime in settings to conceal your precise coordinates."}
          </Text>

          <Text style={styles.sectionTitle}>
            {isTh ? "2. การแชร์ข้อมูลรูปภาพและสื่อ (Media & Content Sharing)" : "2. Media Content Sharing & AI Blur"}
          </Text>
          <Text style={styles.paragraph}>
            {isTh
              ? "รูปภาพและวิดีโอที่คุณอัปโหลดจะถูกเผยแพร่แก่ผู้ใช้อื่นบนแผนที่และฟีดข่าว คุณสามารถเปิดสวิตช์ AI Media Privacy เพื่อเบลอใบหน้าบุคคลอื่นและป้ายทะเบียนรถในรูปภาพก่อนอัปโหลดได้ pinc ไม่มีการนำข้อมูลของคุณไปจำหน่ายแก่บุคคลที่สาม"
              : "Photos and videos uploaded by users are published to the map and public feed. You may toggle AI Media Privacy to automatically pixelate faces of bystanders and license plates before uploading. pinc does not sell or distribute your personal data to third parties."}
          </Text>

          <Text style={styles.sectionTitle}>
            {isTh ? "3. ข้อตกลงสิทธิ์การใช้งาน (EULA & Content Moderation)" : "3. End User License Agreement (EULA)"}
          </Text>
          <Text style={styles.paragraph}>
            {isTh
              ? "pinc รักษานโยบายการห้ามเนื้อหาที่ไม่เหมาะสมอย่างเคร่งครัด (Zero Tolerance Policy) ห้ามมิให้โพสต์เนื้อหาสนับสนุนความรุนแรง ลามกอนาจาร การกลั่นแกล้ง หรือข่าวเท็จ ผู้ละเมิดจะถูกระงับบัญชีใช้งานทันที ผู้ใช้สามารถกดรายงาน (Report) หรือบล็อก (Block) ผู้ใช้อื่นได้ตลอด 24 ชั่วโมง"
              : "pinc enforces a strict Zero-Tolerance Policy for objectionable content and abusive users. Posting explicit, violent, defamatory, or harassing content will result in immediate account termination. Users can Report or Block any inappropriate user or content 24/7."}
          </Text>
        </ScrollView>

        <TouchableOpacity style={styles.agreeBtn} onPress={onClose}>
          <Text style={styles.agreeBtnText}>
            {isTh ? "ตกลงและยอมรับ" : "I Agree & Accept"}
          </Text>
        </TouchableOpacity>
      </SafeAreaView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: PincTheme.colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: PincTheme.colors.border
  },
  headerTitle: { fontSize: 16, fontWeight: '700', color: PincTheme.colors.textPrimary },
  closeBtn: { padding: 4 },
  content: { flex: 1, paddingHorizontal: 20, paddingTop: 16 },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: PincTheme.colors.primary, marginTop: 16, marginBottom: 8 },
  paragraph: { fontSize: 13, color: PincTheme.colors.textSecondary, lineHeight: 20, marginBottom: 12 },
  agreeBtn: {
    backgroundColor: PincTheme.colors.primary,
    marginHorizontal: 20,
    marginVertical: 16,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center'
  },
  agreeBtnText: { color: '#FFF', fontSize: 15, fontWeight: '700' }
});
