import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  SafeAreaView,
  ScrollView,
  Dimensions,
  Image,
  TextInput,
  Alert,
  ActivityIndicator,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { PincTheme } from "../styles/theme";
import { db, auth, uploadPinImage, encodeGeohash } from "../services/firebase";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import * as Location from "expo-location";
import { compressImage } from "../services/imageCompressor";
import { SocialLinksInput, SocialLinksData } from "./SocialLinks";

const { width } = Dimensions.get("window");
const IMAGE_SIZE = (width - 24 * 2 - 12 * 2) / 3; // 3 columns with gaps

interface BusinessPackagesModalProps {
  visible: boolean;
  onClose: () => void;
}

export const BusinessPackagesModal: React.FC<BusinessPackagesModalProps> = ({
  visible,
  onClose,
}) => {
  // Generic upload flow states for all packages
  const [selectedPackage, setSelectedPackage] = useState<'essential' | 'signature' | 'destination' | null>(null);
  const [showEssentialUpload, setShowEssentialUpload] = useState(false);
  const [essentialImages, setEssentialImages] = useState<string[]>([]);
  const [shopName, setShopName] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [description, setDescription] = useState("");
  const [socialLinks, setSocialLinks] = useState<SocialLinksData>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const getMaxImages = () => {
    if (selectedPackage === 'essential') return 3;
    if (selectedPackage === 'signature') return 5;
    if (selectedPackage === 'destination') return 10;
    return 1;
  };

  const handlePickImage = async () => {
    const maxImages = getMaxImages();
    if (essentialImages.length >= maxImages) {
      Alert.alert(
        "ครบแล้ว", 
        `อัปโหลดได้สูงสุด ${maxImages} รูปสำหรับแพ็กเกจนี้`
      );
      return;
    }

    Alert.alert("เลือกรูปภาพ", "เลือกแหล่งที่มาของรูปภาพ", [
      {
        text: "📷 ถ่ายรูป",
        onPress: async () => {
          const { status } = await ImagePicker.requestCameraPermissionsAsync();
          if (status !== "granted") {
            Alert.alert("ไม่ได้รับอนุญาต", "กรุณาอนุญาตการเข้าถึงกล้อง");
            return;
          }
          const result = await ImagePicker.launchCameraAsync({
            allowsEditing: true,
            quality: 0.85,
          });
          if (!result.canceled && result.assets?.length > 0) {
            setEssentialImages((prev) => [...prev, result.assets[0].uri]);
          }
        },
      },
      {
        text: "🖼️ เลือกจากคลัง",
        onPress: async () => {
          const { status } =
            await ImagePicker.requestMediaLibraryPermissionsAsync();
          if (status !== "granted") {
            Alert.alert(
              "ไม่ได้รับอนุญาต",
              "กรุณาอนุญาตการเข้าถึงคลังรูปภาพ"
            );
            return;
          }
          const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            allowsEditing: true,
            quality: 0.85,
          });
          if (!result.canceled && result.assets?.length > 0) {
            setEssentialImages((prev) => [...prev, result.assets[0].uri]);
          }
        },
      },
      { text: "ยกเลิก", style: "cancel" },
    ]);
  };

  const handleRemoveImage = (index: number) => {
    setEssentialImages((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmitPackage = async () => {
    if (essentialImages.length === 0) {
      Alert.alert("กรุณาอัปโหลดรูปภาพ", "จำเป็นต้องอัปโหลดอย่างน้อย 1 รูป");
      return;
    }
    if (!shopName.trim()) {
      Alert.alert("กรุณากรอกชื่อร้าน", "ชื่อร้านค้าจำเป็นต้องกรอก");
      return;
    }

    setIsSubmitting(true);
    try {
      const currentUserId = auth.currentUser?.uid || "mock_owner";

      // 1. Compress all images
      const compressedUris = await Promise.all(
        essentialImages.map(uri => compressImage(uri))
      );

      // 2. Upload all images to Firebase Storage
      const uploadPromises = compressedUris.map(uri => uploadPinImage(uri, currentUserId));
      const uploadedUrls = await Promise.all(uploadPromises);

      // 3. Fetch current Location or default coordinates
      let latitude = 13.736717;
      let longitude = 100.560481;
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === "granted") {
          const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          latitude = loc.coords.latitude;
          longitude = loc.coords.longitude;
        }
      } catch (locErr) {
        console.warn("Could not get location during shop registration, using default.", locErr);
      }

      // Add a tiny random offset so they don't exactly stack at the default point
      latitude += (Math.random() - 0.5) * 0.003;
      longitude += (Math.random() - 0.5) * 0.003;

      const geohash = encodeGeohash(latitude, longitude, 9);
      
      // Determine sponsor tier based on package
      let tier = 1;
      if (selectedPackage === 'signature') tier = 2;
      else if (selectedPackage === 'destination') tier = 3;

      const venueData = {
        name: shopName.trim(),
        latitude,
        longitude,
        geohash,
        category: "café",
        aesthetic_rating: parseFloat((4.7 + Math.random() * 0.3).toFixed(1)), // 4.7 to 5.0
        crowd_status: "Green",
        cover_image: uploadedUrls[0],
        custom_icon_url: uploadedUrls[0], // Use the first uploaded image as custom icon/logo
        images: uploadedUrls,
        description: description.trim() + (phoneNumber.trim() ? `\nโทร: ${phoneNumber.trim()}` : ""),
        socialLinks: Object.keys(socialLinks).length > 0 ? socialLinks : undefined,
        is_sponsored: true,
        sponsor_tier: tier,
        subscription_status: 'ACTIVE',
        campaign_start_date: serverTimestamp(),
        campaign_end_date: new Date(Date.now() + 30 * 24 * 3600 * 1000)
      };

      // 4. Write to Firestore database!
      const venuesRef = collection(db, "venues");
      await addDoc(venuesRef, venueData);

      setIsSubmitting(false);
      Alert.alert(
        "✅ สมัครแพ็กเกจสำเร็จ!",
        `ร้านค้า "${shopName}" ของคุณเปิดใช้งานแพ็กเกจ ${selectedPackage?.toUpperCase()} เรียบร้อยแล้ว (โดยไม่เรียกเก็บค่าใช้จ่ายจริงเพื่อวัตถุประสงค์ในการทดสอบระบบ)\n\nตำแหน่งร้านหมุดรูปสี่เหลี่ยมพร้อมขอบสีสันตามธีมของแพ็กเกจ ได้ถูกปักขึ้นบนแผนที่ ณ พิกัดปัจจุบันของคุณแล้ว สามารถเปิดดูเพื่อทดสอบระบบได้ทันทีครับ`,
        [
          {
            text: "ตกลง",
            onPress: () => {
              setShowEssentialUpload(false);
              setEssentialImages([]);
              setShopName("");
              setPhoneNumber("");
              setDescription("");
              setSocialLinks({});
              setSelectedPackage(null);
              onClose();
            },
          },
        ]
      );
    } catch (err: any) {
      setIsSubmitting(false);
      console.error("Register package failed:", err);
      Alert.alert("เกิดข้อผิดพลาด", err.message || "ไม่สามารถสมัครแพ็กเกจได้ในขณะนี้");
    }
  };

  const handleCloseEssentialUpload = () => {
    if (essentialImages.length > 0 || shopName || phoneNumber) {
      Alert.alert("ยกเลิกการลงทะเบียน?", "ข้อมูลที่กรอกไว้จะหายไป", [
        { text: "กรอกต่อ", style: "cancel" },
        {
          text: "ยกเลิก",
          style: "destructive",
          onPress: () => {
            setShowEssentialUpload(false);
            setEssentialImages([]);
            setShopName("");
            setPhoneNumber("");
            setDescription("");
            setSocialLinks({});
            setSelectedPackage(null);
          },
        },
      ]);
    } else {
      setShowEssentialUpload(false);
      setSelectedPackage(null);
    }
  };

  // ────────── Generic Package Upload Screen ──────────
  const renderEssentialUpload = () => {
    const maxImages = selectedPackage === 'essential' ? 3 : 1;
    
    const getPackageTitle = () => {
      if (selectedPackage === 'essential') return "📸 Essential Package";
      if (selectedPackage === 'signature') return "⭐ Signature Package";
      if (selectedPackage === 'destination') return "✨ Destination Package";
      return "Package Registration";
    };

    const getPackageSubtitle = () => {
      return `อัปโหลดรูปภาพร้านค้า (สูงสุด ${maxImages} รูป)`;
    };

    const getImageSectionTitle = () => {
      return `รูปภาพร้านค้า (${essentialImages.length}/${maxImages})`;
    };

    return (
      <Modal
        animationType="slide"
        transparent={true}
        visible={showEssentialUpload}
        onRequestClose={handleCloseEssentialUpload}
      >
        <View style={styles.modalOverlay}>
          <SafeAreaView style={styles.modalContent}>
            {/* Header */}
            <View style={styles.header}>
              <View style={styles.headerLeft}>
                <Text style={styles.headerTitle}>{getPackageTitle()}</Text>
                <Text style={styles.headerSubtitle}>
                  {getPackageSubtitle()}
                </Text>
              </View>
              <TouchableOpacity
                onPress={handleCloseEssentialUpload}
                style={styles.closeBtn}
              >
                <Text style={styles.closeBtnText}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView
              contentContainerStyle={styles.scrollContent}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              {/* ── Shop Info Inputs ── */}
              <View style={uploadStyles.inputSection}>
                <Text style={uploadStyles.sectionTitle}>ข้อมูลร้านค้า</Text>

                <Text style={uploadStyles.inputLabel}>ชื่อร้านค้า</Text>
                <TextInput
                  style={uploadStyles.textInput}
                  value={shopName}
                  onChangeText={setShopName}
                  placeholder={selectedPackage === 'essential' ? "เช่น Coffee House Café" : "เช่น Golden Roast Coffee"}
                  placeholderTextColor={PincTheme.colors.textTertiary}
                  maxLength={40}
                />

                <Text style={uploadStyles.inputLabel}>เบอร์โทรศัพท์ (ถ้ามี)</Text>
                <TextInput
                  style={uploadStyles.textInput}
                  value={phoneNumber}
                  onChangeText={setPhoneNumber}
                  placeholder="เช่น 081-234-5678"
                  placeholderTextColor={PincTheme.colors.textTertiary}
                  keyboardType="phone-pad"
                  maxLength={15}
                />

                <Text style={uploadStyles.inputLabel}>รายละเอียด / ที่อยู่ / โปรโมชั่น</Text>
                <TextInput
                  style={[uploadStyles.textInput, { height: 80, textAlignVertical: 'top' }]}
                  value={description}
                  onChangeText={setDescription}
                  placeholder="พิมพ์รายละเอียดของร้านค้า โปรโมชั่น หรือที่อยู่ที่นี่..."
                  placeholderTextColor={PincTheme.colors.textTertiary}
                  multiline={true}
                  maxLength={200}
                />

                <SocialLinksInput socialLinks={socialLinks} onChange={setSocialLinks} />
              </View>

              {/* ── Image Upload Section ── */}
              <View style={uploadStyles.inputSection}>
                <Text style={uploadStyles.sectionTitle}>
                  {getImageSectionTitle()}
                </Text>
                <Text
                  style={[
                    uploadStyles.inputLabel,
                    { marginBottom: 12, marginTop: 0 },
                  ]}
                >
                  รูปภาพแรกที่เลือก จะถูกนำไปใช้เป็น "หน้าปก" หรือ "โลโก้" บนแผนที่
                </Text>

                <View style={uploadStyles.imageGrid}>
                  {/* Uploaded images with overlay */}
                  {essentialImages.map((uri, index) => (
                    <View key={index} style={uploadStyles.imageCard}>
                      <Image
                        source={{ uri }}
                        style={uploadStyles.uploadedImage}
                        resizeMode="cover"
                      />
                      {/* Overlay with shop name & phone */}
                      <View style={uploadStyles.imageOverlay}>
                        {shopName ? (
                          <Text
                            style={uploadStyles.overlayShopName}
                            numberOfLines={1}
                          >
                            {shopName}
                          </Text>
                        ) : null}
                        {phoneNumber ? (
                          <Text
                            style={uploadStyles.overlayPhone}
                            numberOfLines={1}
                          >
                            📞 {phoneNumber}
                          </Text>
                        ) : null}
                      </View>
                      {/* Remove button */}
                      <TouchableOpacity
                        style={uploadStyles.removeBtn}
                        onPress={() => handleRemoveImage(index)}
                      >
                        <Text style={uploadStyles.removeBtnText}>✕</Text>
                      </TouchableOpacity>
                    </View>
                  ))}

                  {/* Add image button */}
                  {essentialImages.length < maxImages && (
                    <TouchableOpacity
                      style={uploadStyles.addImageBtn}
                      onPress={handlePickImage}
                      activeOpacity={0.7}
                    >
                      <Text style={uploadStyles.addImageIcon}>＋</Text>
                      <Text style={uploadStyles.addImageText}>
                        เพิ่มรูป
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>

              {/* ── Preview Section ── */}
              {essentialImages.length > 0 && (shopName || phoneNumber) && (
                <View style={uploadStyles.previewSection}>
                  <Text style={uploadStyles.sectionTitle}>
                    🔍 ตัวอย่างการแสดงผล
                  </Text>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={{ gap: 12 }}
                  >
                    {essentialImages.map((uri, index) => (
                      <View key={`preview-${index}`} style={uploadStyles.previewCard}>
                        <Image
                          source={{ uri }}
                          style={uploadStyles.previewImage}
                          resizeMode="cover"
                        />
                        <View style={uploadStyles.previewOverlay}>
                          {shopName ? (
                            <Text
                              style={uploadStyles.previewShopName}
                              numberOfLines={1}
                            >
                              {shopName}
                            </Text>
                          ) : null}
                          {phoneNumber ? (
                            <Text
                              style={uploadStyles.previewPhone}
                              numberOfLines={1}
                            >
                              📞 {phoneNumber}
                            </Text>
                          ) : null}
                        </View>
                      </View>
                    ))}
                  </ScrollView>
                </View>
              )}

              {/* ── Submit Button ── */}
              <TouchableOpacity
                style={[
                  uploadStyles.submitBtn,
                  (essentialImages.length === 0 ||
                    !shopName.trim()) &&
                  uploadStyles.submitBtnDisabled,
                ]}
                onPress={handleSubmitPackage}
                disabled={
                  isSubmitting ||
                  essentialImages.length === 0 ||
                  !shopName.trim()
                }
                activeOpacity={0.8}
              >
                {isSubmitting ? (
                  <ActivityIndicator size="small" color="#FFF" />
                ) : (
                  <Text style={uploadStyles.submitBtnText}>
                    ✅ ส่งข้อมูลลงทะเบียน
                  </Text>
                )}
              </TouchableOpacity>

              <Text style={uploadStyles.disclaimer}>
                * ระบบการสมัครบริการนี้เป็นแพ็กเกจเสมือนจริงเพื่อการทดสอบเท่านั้น
              </Text>

              <View style={styles.bottomSpacer} />
            </ScrollView>
          </SafeAreaView>
        </View>
      </Modal>
    );
  };

  // ────────── Main Packages List ──────────
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
              <Text style={styles.headerSubtitle}>
                เพิ่มยอดขายด้วยพิกัดที่โดดเด่น
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {/* Package 1: Essential */}
            <View style={[styles.packageCard, { borderColor: "#A6A6A6" }]}>
              <View
                style={[
                  styles.packageHeader,
                  { backgroundColor: "rgba(166, 166, 166, 0.1)" },
                ]}
              >
                <View>
                  <Text style={[styles.packageName, { color: "#777777" }]}>
                    Essential
                  </Text>
                  <Text style={styles.packageTagline}>
                    เรียบง่าย แต่มีตัวตน
                  </Text>
                </View>
                <View
                  style={[styles.iconPlaceholder, { borderColor: "#A6A6A6" }]}
                />
              </View>
              <View style={styles.packageBody}>
                <View style={styles.priceContainer}>
                  <Text style={styles.promoPrice}>฿199</Text>
                  <Text style={styles.perMonth}>/เดือน</Text>
                </View>
                <Text style={styles.originalPrice}>ปกติ ฿399/เดือน</Text>

                <View style={styles.featuresList}>
                  <Text style={styles.featureItem}>
                    ✓ โชว์ชื่อร้านบนแผนที่ตลอดเวลา
                  </Text>
                  <Text style={styles.featureItem}>
                    ✓ หมุดกรอบสีเงิน (Silver)
                  </Text>
                  <Text style={styles.featureItem}>
                    ✓ แสดงผลในการค้นหาระดับมาตรฐาน
                  </Text>
                  <Text style={styles.featureItem}>
                    ✓ อัปโหลดรูปร้านค้าได้ 3 รูป
                  </Text>
                </View>

                <TouchableOpacity
                  style={[styles.selectBtn, { backgroundColor: "#A6A6A6" }]}
                  onPress={() => {
                    setSelectedPackage('essential');
                    setShowEssentialUpload(true);
                  }}
                >
                  <Text style={styles.selectBtnText}>เลือกแพ็กเกจนี้</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Package 2: Signature */}
            <View
              style={[
                styles.packageCard,
                { borderColor: "#FFC107", borderWidth: 2 },
              ]}
            >
              {/* Recommend Badge */}
              <View style={styles.recommendBadge}>
                <Text style={styles.recommendBadgeText}>
                  ⭐ คุ้มค่าที่สุด (BEST VALUE)
                </Text>
              </View>

              <View
                style={[
                  styles.packageHeader,
                  { backgroundColor: "rgba(255, 193, 7, 0.1)" },
                ]}
              >
                <View>
                  <Text style={[styles.packageName, { color: "#D4A000" }]}>
                    Signature
                  </Text>
                  <Text style={styles.packageTagline}>
                    สร้างภาพจำแบรนด์
                  </Text>
                </View>
                <View
                  style={[
                    styles.iconPlaceholder,
                    { borderColor: "#FFC107", borderWidth: 2 },
                  ]}
                />
              </View>
              <View style={styles.packageBody}>
                <View style={styles.priceContainer}>
                  <Text style={styles.promoPrice}>฿399</Text>
                  <Text style={styles.perMonth}>/เดือน</Text>
                </View>
                <Text style={styles.originalPrice}>ปกติ ฿599/เดือน</Text>

                <View style={styles.featuresList}>
                  <Text style={[styles.featureItem, { fontWeight: "700" }]}>
                    ✓ ใส่โลโก้ร้านบนหมุดแผนที่ได้
                  </Text>
                  <Text style={styles.featureItem}>
                    ✓ โชว์ชื่อร้านบนแผนที่ตลอดเวลา
                  </Text>
                  <Text style={styles.featureItem}>
                    ✓ หมุดกรอบสีทอง (Gold) หนากว่าปกติ
                  </Text>
                  <Text style={styles.featureItem}>
                    ✓ โอกาสโชว์ในการค้นหาที่มากกว่า
                  </Text>
                </View>

                <TouchableOpacity
                  style={[styles.selectBtn, { backgroundColor: "#FFC107" }]}
                  onPress={() => {
                    setSelectedPackage('signature');
                    setShowEssentialUpload(true);
                  }}
                >
                  <Text style={[styles.selectBtnText, { color: "#000" }]}>
                    เลือกแพ็กเกจนี้
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Package 3: Destination */}
            <View
              style={[
                styles.packageCard,
                { borderColor: "#FF4B72", borderWidth: 2.5 },
              ]}
            >
              <View
                style={[
                  styles.packageHeader,
                  { backgroundColor: "rgba(255, 75, 114, 0.1)" },
                ]}
              >
                <View>
                  <Text style={[styles.packageName, { color: "#FF4B72" }]}>
                    Destination
                  </Text>
                  <Text style={styles.packageTagline}>
                    เปลี่ยนยอดวิวเป็นยอดขาย
                  </Text>
                </View>
                <View
                  style={[
                    styles.iconPlaceholder,
                    { borderColor: "#FF4B72", borderWidth: 2.5 },
                  ]}
                />
              </View>
              <View style={styles.packageBody}>
                <View style={styles.priceContainer}>
                  <Text style={styles.promoPrice}>฿699</Text>
                  <Text style={styles.perMonth}>/เดือน</Text>
                </View>
                <Text style={styles.originalPrice}>ปกติ ฿899/เดือน</Text>

                <View style={styles.featuresList}>
                  <Text
                    style={[
                      styles.featureItem,
                      { fontWeight: "bold", color: "#FF4B72" },
                    ]}
                  >
                    ✨ เอฟเฟกต์วงคลื่นเรดาร์ (Radar Pulse)
                  </Text>
                  <Text style={[styles.featureItem, { fontWeight: "700" }]}>
                    ✓ ใส่โลโก้ร้านบนหมุดแผนที่ได้
                  </Text>
                  <Text style={styles.featureItem}>
                    ✓ หมุดกรอบสีชมพู (Pink) สุดพรีเมียม
                  </Text>
                  <Text style={styles.featureItem}>
                    ✓ แสดงผลอันดับ 1 ในการค้นหา (Top Priority)
                  </Text>
                </View>

                <TouchableOpacity
                  style={[styles.selectBtn, { backgroundColor: "#FF4B72" }]}
                  onPress={() => {
                    setSelectedPackage('destination');
                    setShowEssentialUpload(true);
                  }}
                >
                  <Text style={styles.selectBtnText}>เลือกแพ็กเกจนี้</Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.bottomSpacer} />
          </ScrollView>
        </SafeAreaView>
      </View>

      {/* Essential Upload Sub-Modal */}
      {renderEssentialUpload()}
    </Modal>
  );
};

// ══════════════════════════════════════════
// Styles: Main Package List
// ══════════════════════════════════════════
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

// ══════════════════════════════════════════
// Styles: Essential Upload Screen
// ══════════════════════════════════════════
const uploadStyles = StyleSheet.create({
  inputSection: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 17,
    fontFamily: PincTheme.fonts.heading,
    fontWeight: "800",
    color: PincTheme.colors.textPrimary,
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: PincTheme.colors.textSecondary,
    fontFamily: PincTheme.fonts.body,
    letterSpacing: 0.5,
    marginBottom: 8,
    marginTop: 12,
  },
  textInput: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1.5,
    borderColor: PincTheme.colors.border,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    fontFamily: PincTheme.fonts.body,
    color: PincTheme.colors.textPrimary,
  },
  imageGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  imageCard: {
    width: IMAGE_SIZE,
    height: IMAGE_SIZE,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: "#F5F5F5",
    ...PincTheme.shadows.sm,
  },
  uploadedImage: {
    width: "100%",
    height: "100%",
  },
  imageOverlay: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "rgba(0, 0, 0, 0.55)",
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  overlayShopName: {
    color: "#FFFFFF",
    fontSize: 10,
    fontFamily: PincTheme.fonts.heading,
    fontWeight: "800",
  },
  overlayPhone: {
    color: "rgba(255, 255, 255, 0.9)",
    fontSize: 8,
    fontFamily: PincTheme.fonts.body,
    fontWeight: "600",
    marginTop: 1,
  },
  removeBtn: {
    position: "absolute",
    top: 4,
    right: 4,
    backgroundColor: "rgba(255, 59, 48, 0.9)",
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  removeBtnText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "bold",
  },
  addImageBtn: {
    width: IMAGE_SIZE,
    height: IMAGE_SIZE,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: PincTheme.colors.border,
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FAFAFA",
  },
  addImageIcon: {
    fontSize: 28,
    color: PincTheme.colors.textTertiary,
    marginBottom: 4,
  },
  addImageText: {
    fontSize: 11,
    color: PincTheme.colors.textTertiary,
    fontFamily: PincTheme.fonts.body,
    fontWeight: "600",
  },
  previewSection: {
    marginBottom: 24,
  },
  previewCard: {
    width: width - 48 - 24,
    height: 200,
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: "#F5F5F5",
    ...PincTheme.shadows.md,
  },
  previewImage: {
    width: "100%",
    height: "100%",
  },
  previewOverlay: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  previewShopName: {
    color: "#FFFFFF",
    fontSize: 18,
    fontFamily: PincTheme.fonts.heading,
    fontWeight: "800",
  },
  previewPhone: {
    color: "rgba(255, 255, 255, 0.9)",
    fontSize: 14,
    fontFamily: PincTheme.fonts.body,
    fontWeight: "600",
    marginTop: 2,
  },
  submitBtn: {
    backgroundColor: "#A6A6A6",
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: "center",
    ...PincTheme.shadows.md,
  },
  submitBtnDisabled: {
    opacity: 0.5,
  },
  submitBtnText: {
    color: "#FFFFFF",
    fontFamily: PincTheme.fonts.heading,
    fontWeight: "800",
    fontSize: 17,
  },
  disclaimer: {
    fontSize: 11,
    color: PincTheme.colors.textTertiary,
    fontFamily: PincTheme.fonts.body,
    textAlign: "center",
    marginTop: 12,
  },
});
