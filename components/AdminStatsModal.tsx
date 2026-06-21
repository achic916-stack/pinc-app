import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  SafeAreaView,
  ScrollView,
  ActivityIndicator,
  Dimensions,
  Platform
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { PincTheme } from "../styles/theme";
import { db } from "../services/firebase";
import {
  collection,
  query,
  where,
  getDocs,
  getCountFromServer
} from "firebase/firestore";

interface AdminStatsModalProps {
  visible: boolean;
  onClose: () => void;
}

interface ProvinceStat {
  name: string;
  count: number;
}

interface StatsData {
  totalUsers: number;
  totalPins: number;
  uniqueCreators: number;
  totalSponsored: number;
  tier1: number;
  tier2: number;
  tier3: number;
  provincesBreakdown: ProvinceStat[];
}

const { width } = Dimensions.get("window");

export const AdminStatsModal: React.FC<AdminStatsModalProps> = ({
  visible,
  onClose
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<StatsData | null>(null);

  const fetchStats = async () => {
    setIsLoading(true);
    setError(null);
    try {
      // 1. Fetch total users
      const usersColl = collection(db, "users");
      const usersSnap = await getCountFromServer(usersColl);
      const totalUsersCount = usersSnap.data().count;

      // 2. Fetch total pins & unique creators
      const pinsColl = collection(db, "pins");
      const pinsSnap = await getDocs(pinsColl);
      const totalPinsCount = pinsSnap.size;

      const creatorSet = new Set<string>();
      pinsSnap.forEach((doc) => {
        const data = doc.data();
        if (data.userId) {
          creatorSet.add(data.userId);
        }
      });
      const uniqueCreatorsCount = creatorSet.size;

      // 3. Fetch sponsored venues
      const venuesColl = collection(db, "venues");
      const sponsoredQuery = query(venuesColl, where("is_sponsored", "==", true));
      const venuesSnap = await getDocs(sponsoredQuery);

      let t1 = 0; // Essential
      let t2 = 0; // Signature
      let t3 = 0; // Destination
      const provincesMap: { [key: string]: number } = {};

      venuesSnap.forEach((doc) => {
        const v = doc.data();
        const tier = v.sponsor_tier || 1;
        if (tier === 1) t1++;
        else if (tier === 2) t2++;
        else if (tier === 3) t3++;

        // Province aggregation
        let province = v.province;
        if (!province) {
          // Legacy parser based on description keywords
          const desc = (v.description || "").toLowerCase();
          if (desc.includes("กรุงเทพ") || desc.includes("bangkok") || desc.includes("กทม")) {
            province = "กรุงเทพมหานคร";
          } else if (desc.includes("เชียงใหม่") || desc.includes("chiang mai")) {
            province = "เชียงใหม่";
          } else if (desc.includes("ชลบุรี") || desc.includes("chonburi") || desc.includes("พัทยา") || desc.includes("pattaya")) {
            province = "ชลบุรี";
          } else if (desc.includes("ภูเก็ต") || desc.includes("phuket")) {
            province = "ภูเก็ต";
          } else if (desc.includes("นนทบุรี") || desc.includes("nonthaburi")) {
            province = "นนทบุรี";
          } else if (desc.includes("สมุทรปราการ") || desc.includes("samut prakan")) {
            province = "สมุทรปราการ";
          } else if (desc.includes("ปทุมธานี") || desc.includes("pathum thani")) {
            province = "ปทุมธานี";
          } else if (desc.includes("นครราชสีมา") || desc.includes("korat") || desc.includes("โคราช")) {
            province = "นครราชสีมา";
          } else if (desc.includes("ขอนแก่น") || desc.includes("khon kaen")) {
            province = "ขอนแก่น";
          } else if (desc.includes("สงขลา") || desc.includes("หาดใหญ่") || desc.includes("hat yai")) {
            province = "สงขลา";
          } else if (desc.includes("สุราษฎร์") || desc.includes("surat thani") || desc.includes("สมุย") || desc.includes("samui")) {
            province = "สุราษฎร์ธานี";
          } else if (desc.includes("หัวหิน") || desc.includes("hua hin") || desc.includes("ประจวบ") || desc.includes("prachuap")) {
            province = "ประจวบคีรีขันธ์";
          } else {
            province = "อื่นๆ / ไม่ระบุ";
          }
        }

        provincesMap[province] = (provincesMap[province] || 0) + 1;
      });

      const provincesBreakdown = Object.keys(provincesMap)
        .map((name) => ({
          name,
          count: provincesMap[name]
        }))
        .sort((a, b) => b.count - a.count);

      setStats({
        totalUsers: totalUsersCount,
        totalPins: totalPinsCount,
        uniqueCreators: uniqueCreatorsCount,
        totalSponsored: venuesSnap.size,
        tier1: t1,
        tier2: t2,
        tier3: t3,
        provincesBreakdown
      });
    } catch (err: any) {
      setError(err.message || "Failed to load database statistics.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (visible) {
      fetchStats();
    }
  }, [visible]);

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
            <View>
              <Text style={styles.headerTitle}>📊 สถิติระบบแอดมิน</Text>
              <Text style={styles.headerSubtitle}>
                รายงานสรุปการใช้งานและยอดผู้สมัครร้านค้า
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          {isLoading ? (
            <View style={styles.loaderContainer}>
              <ActivityIndicator size="large" color={PincTheme.colors.primary} />
              <Text style={styles.loaderText}>กำลังคำนวณข้อมูลสถิติ...</Text>
            </View>
          ) : error ? (
            <View style={styles.errorContainer}>
              <Text style={styles.errorText}>⚠️ เกิดข้อผิดพลาด: {error}</Text>
              <TouchableOpacity style={styles.retryBtn} onPress={fetchStats}>
                <Text style={styles.retryBtnText}>ลองใหม่อีกครั้ง</Text>
              </TouchableOpacity>
            </View>
          ) : stats ? (
            <ScrollView
              contentContainerStyle={styles.scrollContent}
              showsVerticalScrollIndicator={false}
            >
              {/* ── High Level Stats Grid ── */}
              <View style={styles.statsGrid}>
                {/* Users Count Card */}
                <View style={styles.statCard}>
                  <View style={[styles.iconCircle, { backgroundColor: "#E6F0FA" }]}>
                    <Ionicons name="people" size={20} color="#007AFF" />
                  </View>
                  <Text style={styles.statValue}>{stats.totalUsers}</Text>
                  <Text style={styles.statLabel}>ผู้ใช้งานลงทะเบียน</Text>
                </View>

                {/* Creators Count Card */}
                <View style={styles.statCard}>
                  <View style={[styles.iconCircle, { backgroundColor: "#FFF0F4" }]}>
                    <Ionicons name="pin" size={20} color="#FF4B72" />
                  </View>
                  <Text style={styles.statValue}>{stats.uniqueCreators}</Text>
                  <Text style={styles.statLabel}>จำนวนคนปักหมุด</Text>
                </View>

                {/* Pins Count Card */}
                <View style={styles.statCard}>
                  <View style={[styles.iconCircle, { backgroundColor: "#E8F5E9" }]}>
                    <Ionicons name="images" size={20} color="#4CAF50" />
                  </View>
                  <Text style={styles.statValue}>{stats.totalPins}</Text>
                  <Text style={styles.statLabel}>หมุดภาพ & วิดีโอ</Text>
                </View>

                {/* Package Shops Card */}
                <View style={styles.statCard}>
                  <View style={[styles.iconCircle, { backgroundColor: "#FFFDE7" }]}>
                    <Ionicons name="storefront" size={20} color="#FBC02D" />
                  </View>
                  <Text style={styles.statValue}>{stats.totalSponsored}</Text>
                  <Text style={styles.statLabel}>ร้านค้าสมัครแพ็กเกจ</Text>
                </View>
              </View>

              {/* ── Subscription Packages Tier Breakdown ── */}
              <View style={styles.sectionContainer}>
                <Text style={styles.sectionTitle}>🛍️ ยอดผู้สมัครแยกตามแพ็กเกจ</Text>
                
                <View style={styles.tierRow}>
                  <View style={styles.tierItem}>
                    <Text style={[styles.tierHeader, { color: "#777777" }]}>Silver (Essential)</Text>
                    <Text style={styles.tierValue}>{stats.tier1}</Text>
                    <Text style={styles.tierSubtext}>ร้านค้า</Text>
                  </View>
                  <View style={[styles.tierItem, { borderColor: "#FFC107" }]}>
                    <Text style={[styles.tierHeader, { color: "#D4A000" }]}>Gold (Signature)</Text>
                    <Text style={styles.tierValue}>{stats.tier2}</Text>
                    <Text style={styles.tierSubtext}>ร้านค้า</Text>
                  </View>
                  <View style={[styles.tierItem, { borderColor: "#FF4B72" }]}>
                    <Text style={[styles.tierHeader, { color: "#FF4B72" }]}>Pink (Destination)</Text>
                    <Text style={styles.tierValue}>{stats.tier3}</Text>
                    <Text style={styles.tierSubtext}>ร้านค้า</Text>
                  </View>
                </View>
              </View>

              {/* ── Province Grouping Breakdown ── */}
              <View style={styles.sectionContainer}>
                <Text style={styles.sectionTitle}>📍 จำนวนร้านค้าที่สมัคร แยกรายจังหวัด</Text>
                {stats.provincesBreakdown.length === 0 ? (
                  <View style={styles.emptyState}>
                    <Text style={styles.emptyStateText}>ยังไม่มีข้อมูลร้านค้าสมัครแพ็กเกจ</Text>
                  </View>
                ) : (
                  <View style={styles.tableCard}>
                    {stats.provincesBreakdown.map((item, index) => (
                      <View 
                        key={item.name} 
                        style={[
                          styles.tableRow, 
                          index === stats.provincesBreakdown.length - 1 && { borderBottomWidth: 0 }
                        ]}
                      >
                        <View style={styles.rowLeft}>
                          <Text style={styles.rowNumber}>#{index + 1}</Text>
                          <Text style={styles.rowName}>{item.name}</Text>
                        </View>
                        <View style={styles.rowRight}>
                          <Text style={styles.rowValue}>{item.count}</Text>
                          <Text style={styles.rowUnit}>ร้าน</Text>
                        </View>
                      </View>
                    ))}
                  </View>
                )}
              </View>

              {/* ── Installation & Downloads Explanation Guide ── */}
              <View style={[styles.sectionContainer, styles.guideContainer]}>
                <Text style={styles.guideTitle}>📲 การตรวจสอบจำนวนคนดาวน์โหลด/ติดตั้งแอป</Text>
                <Text style={styles.guideText}>
                  เนื่องจากแอปสโตร์ไม่ส่งข้อมูลดาวน์โหลดลงฐานข้อมูลโดยตรง แอดมินสามารถตรวจสอบจำนวนติดตั้ง (Installs) ได้จากช่องทางมาตรฐานเหล่านี้:
                </Text>
                
                <View style={styles.guideStep}>
                  <Text style={styles.stepNum}>1</Text>
                  <View style={styles.stepContent}>
                    <Text style={styles.stepTitle}>Google Analytics for Firebase</Text>
                    <Text style={styles.stepDesc}>
                      ล็อกอินเข้าไปที่ Firebase Console &gt; Analytics &gt; Events ตรวจสอบจำนวนครั้งที่เกิดอีเวนต์ <Text style={{fontWeight:"bold"}}>first_open</Text> (หมายถึงผู้ใช้เปิดใช้งานแอปหลังติดตั้งครั้งแรก)
                    </Text>
                  </View>
                </View>

                <View style={styles.guideStep}>
                  <Text style={styles.stepNum}>2</Text>
                  <View style={styles.stepContent}>
                    <Text style={styles.stepTitle}>Store Developer Consoles</Text>
                    <Text style={styles.stepDesc}>
                      - <Text style={{fontWeight:"bold"}}>Google Play Console:</Text> ตรวจสอบยอดดาวน์โหลดดิบ (Downloads) หรืออุปกรณ์ที่ใช้งานอยู่ (Active devices){"\n"}
                      - <Text style={{fontWeight:"bold"}}>App Store Connect (iOS):</Text> ตรวจสอบรายงาน App Units เพื่อดูจำนวนดาวน์โหลดครั้งแรก
                    </Text>
                  </View>
                </View>

                <View style={styles.guideStep}>
                  <Text style={styles.stepNum}>3</Text>
                  <View style={styles.stepContent}>
                    <Text style={styles.stepTitle}>Firebase Authentication</Text>
                    <Text style={styles.stepDesc}>
                      ดูในหน้าหลักของแอดมิน เพื่อตรวจสอบจำนวนบัญชีผู้ใช้จริงที่สร้างขึ้นมาสำเร็จในระบบ (สถิติปัจจุบัน: {stats.totalUsers} บัญชี)
                    </Text>
                  </View>
                </View>
              </View>

              <View style={styles.bottomSpacer} />
            </ScrollView>
          ) : null}
        </SafeAreaView>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end"
  },
  modalContent: {
    backgroundColor: PincTheme.colors.background,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    height: "90%"
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
    backgroundColor: PincTheme.colors.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24
  },
  headerTitle: {
    fontSize: 20,
    fontFamily: PincTheme.fonts.heading,
    fontWeight: "800",
    color: PincTheme.colors.textPrimary
  },
  headerSubtitle: {
    fontSize: 12,
    fontFamily: PincTheme.fonts.body,
    color: PincTheme.colors.textSecondary,
    marginTop: 4
  },
  closeBtn: {
    padding: 8,
    backgroundColor: PincTheme.colors.card,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: PincTheme.colors.border
  },
  closeBtnText: {
    fontSize: 14,
    fontWeight: "bold",
    color: PincTheme.colors.textSecondary
  },
  loaderContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center"
  },
  loaderText: {
    marginTop: 12,
    fontSize: 14,
    color: PincTheme.colors.textSecondary,
    fontFamily: PincTheme.fonts.body
  },
  errorContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24
  },
  errorText: {
    fontSize: 15,
    color: "#D32F2F",
    fontFamily: PincTheme.fonts.body,
    textAlign: "center",
    marginBottom: 16
  },
  retryBtn: {
    backgroundColor: PincTheme.colors.primary,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8
  },
  retryBtnText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "bold",
    fontFamily: PincTheme.fonts.heading
  },
  scrollContent: {
    padding: 20
  },
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    marginBottom: 24
  },
  statCard: {
    flex: 1,
    minWidth: (width - 40 - 12) / 2 - 6,
    backgroundColor: PincTheme.colors.card,
    borderRadius: 16,
    padding: 16,
    alignItems: "center",
    borderWidth: 1,
    borderColor: PincTheme.colors.border,
    ...PincTheme.shadows.sm
  },
  iconCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 8
  },
  statValue: {
    fontSize: 22,
    fontWeight: "900",
    color: PincTheme.colors.textPrimary,
    fontFamily: PincTheme.fonts.heading
  },
  statLabel: {
    fontSize: 11,
    color: PincTheme.colors.textSecondary,
    fontFamily: PincTheme.fonts.body,
    marginTop: 4,
    textAlign: "center"
  },
  sectionContainer: {
    marginBottom: 24
  },
  sectionTitle: {
    fontSize: 15,
    fontFamily: PincTheme.fonts.heading,
    fontWeight: "800",
    color: PincTheme.colors.textPrimary,
    marginBottom: 12
  },
  tierRow: {
    flexDirection: "row",
    gap: 10
  },
  tierItem: {
    flex: 1,
    backgroundColor: PincTheme.colors.card,
    borderWidth: 1.5,
    borderColor: "#E0E0E0",
    borderRadius: 12,
    padding: 12,
    alignItems: "center"
  },
  tierHeader: {
    fontSize: 11,
    fontWeight: "700",
    fontFamily: PincTheme.fonts.heading,
    marginBottom: 6,
    textAlign: "center"
  },
  tierValue: {
    fontSize: 20,
    fontWeight: "900",
    color: PincTheme.colors.textPrimary,
    fontFamily: PincTheme.fonts.heading
  },
  tierSubtext: {
    fontSize: 10,
    color: PincTheme.colors.textTertiary,
    fontFamily: PincTheme.fonts.body,
    marginTop: 2
  },
  emptyState: {
    padding: 24,
    backgroundColor: PincTheme.colors.card,
    borderRadius: 16,
    alignItems: "center",
    borderWidth: 1,
    borderColor: PincTheme.colors.border
  },
  emptyStateText: {
    fontSize: 13,
    color: PincTheme.colors.textTertiary,
    fontFamily: PincTheme.fonts.body
  },
  tableCard: {
    backgroundColor: PincTheme.colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: PincTheme.colors.border,
    paddingHorizontal: 16,
    ...PincTheme.shadows.sm
  },
  tableRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 14,
    borderBottomWidth: 0.5,
    borderBottomColor: PincTheme.colors.divider
  },
  rowLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8
  },
  rowNumber: {
    fontSize: 12,
    fontWeight: "700",
    color: PincTheme.colors.textTertiary,
    fontFamily: PincTheme.fonts.body
  },
  rowName: {
    fontSize: 14,
    fontWeight: "600",
    color: PincTheme.colors.textPrimary,
    fontFamily: PincTheme.fonts.body
  },
  rowRight: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 4
  },
  rowValue: {
    fontSize: 16,
    fontWeight: "800",
    color: PincTheme.colors.primary,
    fontFamily: PincTheme.fonts.heading
  },
  rowUnit: {
    fontSize: 11,
    color: PincTheme.colors.textSecondary,
    fontFamily: PincTheme.fonts.body
  },
  guideContainer: {
    backgroundColor: "#F9F9FB",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: PincTheme.colors.border,
    padding: 16
  },
  guideTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: PincTheme.colors.textPrimary,
    fontFamily: PincTheme.fonts.heading,
    marginBottom: 8
  },
  guideText: {
    fontSize: 12,
    color: PincTheme.colors.textSecondary,
    fontFamily: PincTheme.fonts.body,
    lineHeight: 18,
    marginBottom: 16
  },
  guideStep: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 16
  },
  stepContent: {
    flex: 1
  },
  stepNum: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: PincTheme.colors.primary,
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "bold",
    textAlign: "center",
    lineHeight: 24
  },
  stepTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: PincTheme.colors.textPrimary,
    fontFamily: PincTheme.fonts.heading,
    marginBottom: 4
  },
  stepDesc: {
    fontSize: 11,
    color: PincTheme.colors.textSecondary,
    fontFamily: PincTheme.fonts.body,
    lineHeight: 16
  },
  bottomSpacer: {
    height: Platform.OS === 'ios' ? 60 : 80
  }
});
