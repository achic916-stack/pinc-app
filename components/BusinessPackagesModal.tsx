import React from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  SafeAreaView,
  ScrollView,
  Dimensions,
} from "react-native";
import { PincTheme } from "../styles/theme";

const { width } = Dimensions.get("window");

interface BusinessPackagesModalProps {
  visible: boolean;
  onClose: () => void;
}

export const BusinessPackagesModal: React.FC<BusinessPackagesModalProps> = ({
  visible,
  onClose,
}) => {
  return (
    <Modal
      animationType="slide"
      transparent={true}
      visible={visible}
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <SafeAreaView style={styles.modalContent}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <Text style={styles.headerTitle}>🏪 สำหรับร้านค้า</Text>
              <Text style={styles.headerSubtitle}>เพิ่มยอดขายด้วยพิกัดที่โดดเด่น</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {/* Package 1: Silver Starter */}
            <View style={[styles.packageCard, { borderColor: "#A6A6A6" }]}>
              <View style={[styles.packageHeader, { backgroundColor: "rgba(166, 166, 166, 0.1)" }]}>
                <View>
                  <Text style={[styles.packageName, { color: "#777777" }]}>Essential</Text>
                  <Text style={styles.packageTagline}>เรียบง่าย แต่มีตัวตน</Text>
                </View>
                <View style={[styles.iconPlaceholder, { borderColor: "#A6A6A6" }]} />
              </View>
              <View style={styles.packageBody}>
                <View style={styles.priceContainer}>
                  <Text style={styles.promoPrice}>฿199</Text>
                  <Text style={styles.perMonth}>/เดือน</Text>
                </View>
                <Text style={styles.originalPrice}>ปกติ ฿500/เดือน</Text>
                
                <View style={styles.featuresList}>
                  <Text style={styles.featureItem}>✓ โชว์ชื่อร้านบนแผนที่ตลอดเวลา</Text>
                  <Text style={styles.featureItem}>✓ หมุดกรอบสีเงิน (Silver)</Text>
                  <Text style={styles.featureItem}>✓ แสดงผลในการค้นหาระดับมาตรฐาน</Text>
                </View>

                <TouchableOpacity style={[styles.selectBtn, { backgroundColor: "#A6A6A6" }]}>
                  <Text style={styles.selectBtnText}>เลือกแพ็กเกจนี้</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Package 2: Gold Premium */}
            <View style={[styles.packageCard, { borderColor: "#FFC107", borderWidth: 2 }]}>
              {/* Recommend Badge */}
              <View style={styles.recommendBadge}>
                <Text style={styles.recommendBadgeText}>⭐ คุ้มค่าที่สุด (BEST VALUE)</Text>
              </View>
              
              <View style={[styles.packageHeader, { backgroundColor: "rgba(255, 193, 7, 0.1)" }]}>
                <View>
                  <Text style={[styles.packageName, { color: "#D4A000" }]}>Signature</Text>
                  <Text style={styles.packageTagline}>สร้างภาพจำแบรนด์</Text>
                </View>
                <View style={[styles.iconPlaceholder, { borderColor: "#FFC107", borderWidth: 2 }]} />
              </View>
              <View style={styles.packageBody}>
                <View style={styles.priceContainer}>
                  <Text style={styles.promoPrice}>฿599</Text>
                  <Text style={styles.perMonth}>/เดือน</Text>
                </View>
                <Text style={styles.originalPrice}>ปกติ ฿1,500/เดือน</Text>
                
                <View style={styles.featuresList}>
                  <Text style={[styles.featureItem, { fontWeight: "700" }]}>✓ ใส่โลโก้ร้านบนหมุดแผนที่ได้</Text>
                  <Text style={styles.featureItem}>✓ โชว์ชื่อร้านบนแผนที่ตลอดเวลา</Text>
                  <Text style={styles.featureItem}>✓ หมุดกรอบสีทอง (Gold) หนากว่าปกติ</Text>
                  <Text style={styles.featureItem}>✓ โอกาสโชว์ในการค้นหาที่มากกว่า</Text>
                </View>

                <TouchableOpacity style={[styles.selectBtn, { backgroundColor: "#FFC107" }]}>
                  <Text style={[styles.selectBtnText, { color: "#000" }]}>เลือกแพ็กเกจนี้</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Package 3: Pink Ultimate */}
            <View style={[styles.packageCard, { borderColor: "#FF4B72", borderWidth: 2.5 }]}>
              <View style={[styles.packageHeader, { backgroundColor: "rgba(255, 75, 114, 0.1)" }]}>
                <View>
                  <Text style={[styles.packageName, { color: "#FF4B72" }]}>Destination</Text>
                  <Text style={styles.packageTagline}>เปลี่ยนยอดวิวเป็นยอดขาย</Text>
                </View>
                <View style={[styles.iconPlaceholder, { borderColor: "#FF4B72", borderWidth: 2.5 }]} />
              </View>
              <View style={styles.packageBody}>
                <View style={styles.priceContainer}>
                  <Text style={styles.promoPrice}>฿1,499</Text>
                  <Text style={styles.perMonth}>/เดือน</Text>
                </View>
                <Text style={styles.originalPrice}>ปกติ ฿3,500/เดือน</Text>
                
                <View style={styles.featuresList}>
                  <Text style={[styles.featureItem, { fontWeight: "bold", color: "#FF4B72" }]}>
                    ✨ เอฟเฟกต์วงคลื่นเรดาร์ (Radar Pulse)
                  </Text>
                  <Text style={[styles.featureItem, { fontWeight: "700" }]}>✓ ใส่โลโก้ร้านบนหมุดแผนที่ได้</Text>
                  <Text style={styles.featureItem}>✓ หมุดกรอบสีชมพู (Pink) สุดพรีเมียม</Text>
                  <Text style={styles.featureItem}>✓ แสดงผลอันดับ 1 ในการค้นหา (Top Priority)</Text>
                </View>

                <TouchableOpacity style={[styles.selectBtn, { backgroundColor: "#FF4B72" }]}>
                  <Text style={styles.selectBtnText}>เลือกแพ็กเกจนี้</Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.bottomSpacer} />
          </ScrollView>
        </SafeAreaView>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: PincTheme.colors.background,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    height: "90%",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: PincTheme.colors.border,
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  headerLeft: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 22,
    fontFamily: PincTheme.fonts.heading,
    fontWeight: "800",
    color: PincTheme.colors.textPrimary,
  },
  headerSubtitle: {
    fontSize: 13,
    fontFamily: PincTheme.fonts.body,
    color: PincTheme.colors.textSecondary,
    marginTop: 4,
  },
  closeBtn: {
    padding: 8,
    backgroundColor: PincTheme.colors.card,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: PincTheme.colors.border,
  },
  closeBtnText: {
    fontSize: 16,
    fontWeight: "bold",
    color: PincTheme.colors.textSecondary,
  },
  scrollContent: {
    padding: 24,
  },
  packageCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    borderWidth: 1.5,
    marginBottom: 24,
    overflow: "hidden",
    ...PincTheme.shadows.md,
  },
  packageHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
  },
  packageName: {
    fontSize: 20,
    fontFamily: PincTheme.fonts.heading,
    fontWeight: "800",
  },
  packageTagline: {
    fontSize: 12,
    fontFamily: PincTheme.fonts.body,
    color: PincTheme.colors.textSecondary,
    marginTop: 4,
  },
  iconPlaceholder: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1.5,
    backgroundColor: "#FFFFFF",
  },
  packageBody: {
    padding: 20,
  },
  priceContainer: {
    flexDirection: "row",
    alignItems: "baseline",
  },
  promoPrice: {
    fontSize: 28,
    fontFamily: PincTheme.fonts.heading,
    fontWeight: "900",
    color: PincTheme.colors.textPrimary,
  },
  perMonth: {
    fontSize: 14,
    fontFamily: PincTheme.fonts.body,
    color: PincTheme.colors.textSecondary,
    marginLeft: 4,
    fontWeight: "600",
  },
  originalPrice: {
    fontSize: 12,
    fontFamily: PincTheme.fonts.body,
    color: PincTheme.colors.textTertiary,
    textDecorationLine: "line-through",
    marginTop: 2,
    marginBottom: 16,
  },
  featuresList: {
    gap: 10,
    marginBottom: 24,
  },
  featureItem: {
    fontSize: 13,
    fontFamily: PincTheme.fonts.body,
    color: PincTheme.colors.textPrimary,
  },
  selectBtn: {
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  selectBtnText: {
    color: "#FFFFFF",
    fontFamily: PincTheme.fonts.heading,
    fontWeight: "800",
    fontSize: 16,
  },
  recommendBadge: {
    position: "absolute",
    top: 0,
    right: 0,
    backgroundColor: "#FFC107",
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderBottomLeftRadius: 12,
    zIndex: 10,
  },
  recommendBadgeText: {
    fontSize: 10,
    fontFamily: PincTheme.fonts.heading,
    fontWeight: "900",
    color: "#000000",
  },
  bottomSpacer: {
    height: 40,
  },
});
