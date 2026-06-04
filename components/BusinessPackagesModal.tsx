import React, { useState, useEffect } from "react";
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
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { withIAPContext, useIAP } from "react-native-iap";
import * as ImagePicker from "expo-image-picker";
import { PincTheme } from "../styles/theme";
import { db, auth, uploadPinImage, encodeGeohash } from "../services/firebase";
import { collection, addDoc, serverTimestamp, doc, updateDoc } from "firebase/firestore";
import * as Location from "expo-location";
import { compressImage } from "../services/imageCompressor";
import { SocialLinksInput, SocialLinksData } from "./SocialLinks";

const { width } = Dimensions.get("window");
const IMAGE_SIZE = (width - 24 * 2 - 12 * 2) / 3; // 3 columns with gaps

interface BusinessPackagesModalProps {
  visible: boolean;
  onClose: () => void;
  locale?: string;
}

export const BusinessPackagesModalComponent: React.FC<BusinessPackagesModalProps> = ({
  visible,
  onClose,
  locale = "th",
}) => {
  // Product IDs for Apple StoreKit (In-App Purchase)
  const subscriptionSkus = Platform.select({
    ios: [
      "com.achic.pinc.essential",
      "com.achic.pinc.signature",
      "com.achic.pinc.destination"
    ],
    android: [
      "com.achic.pinc.essential",
      "com.achic.pinc.signature",
      "com.achic.pinc.destination"
    ]
  }) || [];

  const {
    connected,
    currentPurchase,
    currentPurchaseError,
    finishTransaction,
    getSubscriptions,
    requestSubscription,
  } = useIAP();

  const [isLoadingSubscriptions, setIsLoadingSubscriptions] = useState(false);
  const [storePrices, setStorePrices] = useState<Record<string, string>>({
    'com.achic.pinc.essential': '฿199',
    'com.achic.pinc.signature': '฿399',
    'com.achic.pinc.destination': '฿699',
  });

  // Generic upload flow states for all packages
  const [selectedPackage, setSelectedPackage] = useState<'essential' | 'signature' | 'destination' | null>(null);

  // Initialize and Fetch subscriptions on mount/visible
  useEffect(() => {
    let active = true;
    const initIAP = async () => {
      if (!visible) return;
      setIsLoadingSubscriptions(true);
      try {
        console.log("IAP: Fetching subscriptions...");
        const subs: any = await getSubscriptions({ skus: subscriptionSkus });
        console.log("IAP: Subscriptions fetched:", subs);
        if (active && subs && subs.length > 0) {
          const prices: Record<string, string> = {};
          subs.forEach((sub: any) => {
            if (sub.productId) {
              prices[sub.productId] = sub.localizedPrice || (sub as any).price || '฿' + (sub as any).priceString;
            }
          });
          setStorePrices((prev) => ({ ...prev, ...prices }));
        }
      } catch (err) {
        console.warn("IAP: Error fetching subscriptions:", err);
      } finally {
        if (active) setIsLoadingSubscriptions(false);
      }
    };

    initIAP();

    return () => {
      active = false;
    };
  }, [visible, connected]);

  // Monitor purchases
  useEffect(() => {
    const handlePurchase = async () => {
      if (currentPurchase) {
        const purchase = currentPurchase;
        console.log("IAP: Successful purchase detected:", purchase);
        
        let tier: 'essential' | 'signature' | 'destination' | null = null;
        let tierNum = 1;
        if (purchase.productId === 'com.achic.pinc.essential') {
          tier = 'essential';
          tierNum = 1;
        } else if (purchase.productId === 'com.achic.pinc.signature') {
          tier = 'signature';
          tierNum = 2;
        } else if (purchase.productId === 'com.achic.pinc.destination') {
          tier = 'destination';
          tierNum = 3;
        }

        if (tier) {
          try {
            const currentUserId = auth.currentUser?.uid;
            if (currentUserId) {
              const userRef = doc(db, "users", currentUserId);
              await updateDoc(userRef, {
                role: "PREMIUM_STORE",
                subscriptionStatus: "ACTIVE",
                subscriptionTier: tierNum,
                subscriptionProductId: purchase.productId,
                lastTransactionId: purchase.transactionId,
                subscriptionExpiry: new Date(Date.now() + 30 * 24 * 3600 * 1000),
              });
              console.log("IAP: User document updated in Firestore successfully.");
            }
            
            await finishTransaction({ purchase, isConsumable: false });
            console.log("IAP: Transaction finished in StoreKit.");

            setSelectedPackage(tier);
            setShowEssentialUpload(true);
            
            Alert.alert(
              locale === "th" ? "จ่ายเงินสำเร็จ!" : "Payment Successful!",
              locale === "th"
                ? "การชำระเงินเสร็จสิ้นแล้ว กรุณากรอกข้อมูลเพื่อลงทะเบียนร้านค้าของคุณ"
                : "Payment completed successfully. Please fill in the details to register your shop."
            );
          } catch (err: any) {
            console.error("IAP: Error handling successful purchase:", err);
            Alert.alert("Error", err.message || "Failed to update subscription status");
          }
        }
      }
    };

    handlePurchase();
  }, [currentPurchase]);

  // Monitor purchase errors
  useEffect(() => {
    if (currentPurchaseError) {
      console.warn("IAP: Purchase error:", currentPurchaseError);
      const isCancel = currentPurchaseError.code === 'E_USER_CANCELLED' || 
                       currentPurchaseError.message?.includes('cancel') ||
                       currentPurchaseError.message?.includes('cancelled');
      if (!isCancel) {
        Alert.alert(
          locale === "th" ? "การซื้อล้มเหลว" : "Purchase Failed",
          currentPurchaseError.message || (locale === "th" ? "เกิดข้อผิดพลาดในการทำรายการ" : "An error occurred during transaction")
        );
      }
    }
  }, [currentPurchaseError]);

  const handleRestorePurchase = async () => {
    try {
      console.log("IAP: Restoring purchases...");
      const { getAvailablePurchases } = require('react-native-iap');
      const purchases: any[] = await getAvailablePurchases();
      console.log("IAP: Restored purchases:", purchases);
      
      if (purchases && purchases.length > 0) {
        const subPurchases = purchases.filter((p: any) => 
          subscriptionSkus.includes(p.productId)
        );
        
        if (subPurchases.length > 0) {
          subPurchases.sort((a: any, b: any) => Number(b.transactionDate) - Number(a.transactionDate));
          const latestPurchase = subPurchases[0];
          
          let tier: 'essential' | 'signature' | 'destination' | null = null;
          let tierNum = 1;
          if (latestPurchase.productId === 'com.achic.pinc.essential') {
            tier = 'essential';
            tierNum = 1;
          } else if (latestPurchase.productId === 'com.achic.pinc.signature') {
            tier = 'signature';
            tierNum = 2;
          } else if (latestPurchase.productId === 'com.achic.pinc.destination') {
            tier = 'destination';
            tierNum = 3;
          }

          if (tier) {
            const currentUserId = auth.currentUser?.uid;
            if (currentUserId) {
              const userRef = doc(db, "users", currentUserId);
              await updateDoc(userRef, {
                role: "PREMIUM_STORE",
                subscriptionStatus: "ACTIVE",
                subscriptionTier: tierNum,
                subscriptionProductId: latestPurchase.productId,
                lastTransactionId: latestPurchase.transactionId,
                subscriptionExpiry: new Date(Date.now() + 30 * 24 * 3600 * 1000),
              });
            }

            try {
              await finishTransaction({ purchase: latestPurchase, isConsumable: false });
            } catch (finishErr) {
              console.warn("IAP: Restored purchase finishTransaction warn:", finishErr);
            }

            setSelectedPackage(tier);
            setShowEssentialUpload(true);
            
            Alert.alert(
              locale === "th" ? "กู้คืนสำเร็จ!" : "Restore Successful!",
              locale === "th"
                ? `พบข้อมูลการสมัครสมาชิกแพ็กเกจ ${tier.toUpperCase()} ก่อนหน้านี้ ระบบได้กู้คืนสิทธิ์ให้คุณเรียบร้อยแล้ว`
                : `Found previous subscription for ${tier.toUpperCase()} package. Restored successfully.`
            );
            return;
          }
        }
      }

      Alert.alert(
        locale === "th" ? "ไม่พบประวัติการซื้อ" : "No Purchase History Found",
        locale === "th"
          ? "ไม่พบข้อมูลการซื้อแพ็กเกจที่ยังใช้งานได้ในบัญชี Apple ID นี้"
          : "No active subscriptions found for this Apple ID."
      );
    } catch (err: any) {
      console.error("IAP: Restore failed:", err);
      Alert.alert(
        locale === "th" ? "กู้คืนไม่สำเร็จ" : "Restore Failed",
        err.message || (locale === "th" ? "ไม่สามารถกู้คืนสิทธิ์ได้ในขณะนี้" : "Unable to restore purchases at this time")
      );
    }
  };

  const getSkuFromPackageType = (type: 'essential' | 'signature' | 'destination' | null) => {
    if (type === 'essential') return 'com.achic.pinc.essential';
    if (type === 'signature') return 'com.achic.pinc.signature';
    if (type === 'destination') return 'com.achic.pinc.destination';
    return '';
  };

  const handleSelectPackageTrigger = async () => {
    if (!selectedPackage) {
      Alert.alert(
        locale === "th" ? "กรุณาเลือกแพ็กเกจ" : "Please select a package",
        locale === "th" ? "กรุณาคลิกเลือกแพ็กเกจที่ต้องการก่อนทำรายการ" : "Please click to select a package first"
      );
      return;
    }

    const sku = getSkuFromPackageType(selectedPackage);
    if (!sku) return;

    try {
      console.log(`IAP: Requesting subscription for SKU: ${sku}`);
      await requestSubscription({ sku });
    } catch (err: any) {
      console.error("IAP: Request subscription error:", err);
      Alert.alert(
        locale === "th" ? "การสั่งซื้อขัดข้อง" : "Purchase Request Failed",
        err.message || (locale === "th" ? "ไม่สามารถเชื่อมต่อกับ App Store ได้" : "Could not connect to App Store")
      );
    }
  };

  const getButtonColor = () => {
    if (selectedPackage === 'essential') return "#777777";
    if (selectedPackage === 'signature') return "#FFC107";
    if (selectedPackage === 'destination') return "#FF4B72";
    return "#E0E0E0";
  };

  const getButtonTextColor = () => {
    if (selectedPackage === 'signature') return "#000000";
    return "#FFFFFF";
  };
  const [showEssentialUpload, setShowEssentialUpload] = useState(false);
  const [essentialImages, setEssentialImages] = useState<string[]>([]);
  const [shopName, setShopName] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [description, setDescription] = useState("");
  const [socialLinks, setSocialLinks] = useState<SocialLinksData>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedProvince, setSelectedProvince] = useState("กรุงเทพมหานคร");
  const [customProvince, setCustomProvince] = useState("");

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
        locale === "th" ? "ครบแล้ว" : "Limit reached", 
        locale === "th" ? `อัปโหลดได้สูงสุด ${maxImages} รูปสำหรับแพ็กเกจนี้` : `You can upload up to ${maxImages} images for this package`
      );
      return;
    }

    Alert.alert(
      locale === "th" ? "เลือกรูปภาพ" : "Select Image", 
      locale === "th" ? "เลือกแหล่งที่มาของรูปภาพ" : "Choose image source", 
      [
        {
          text: locale === "th" ? "📷 ถ่ายรูป" : "📷 Take Photo",
          onPress: async () => {
            const { status } = await ImagePicker.requestCameraPermissionsAsync();
            if (status !== "granted") {
              Alert.alert(
                locale === "th" ? "ไม่ได้รับอนุญาต" : "Permission Denied", 
                locale === "th" ? "กรุณาอนุญาตการเข้าถึงกล้อง" : "Please allow camera access"
              );
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
          text: locale === "th" ? "🖼️ เลือกจากคลัง" : "🖼️ Choose from Gallery",
          onPress: async () => {
            const { status } =
              await ImagePicker.requestMediaLibraryPermissionsAsync();
            if (status !== "granted") {
              Alert.alert(
                locale === "th" ? "ไม่ได้รับอนุญาต" : "Permission Denied",
                locale === "th" ? "กรุณาอนุญาตการเข้าถึงคลังรูปภาพ" : "Please allow library access"
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
        { text: locale === "th" ? "ยกเลิก" : "Cancel", style: "cancel" },
      ]
    );
  };

  const handleRemoveImage = (index: number) => {
    setEssentialImages((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmitPackage = async () => {
    if (essentialImages.length === 0) {
      Alert.alert(
        locale === "th" ? "กรุณาอัปโหลดรูปภาพ" : "Please upload images", 
        locale === "th" ? "จำเป็นต้องอัปโหลดอย่างน้อย 1 รูป" : "At least 1 image is required"
      );
      return;
    }
    if (!shopName.trim()) {
      Alert.alert(
        locale === "th" ? "กรุณากรอกชื่อร้าน" : "Please enter shop name", 
        locale === "th" ? "ชื่อร้านค้าจำเป็นต้องกรอก" : "Shop name is required"
      );
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

      const geohash = encodeGeohash(latitude, longitude, 9);
      
      // Determine sponsor tier based on package
      let tier = 1;
      if (selectedPackage === 'essential') tier = 1;
      else if (selectedPackage === 'signature') tier = 2;
      else if (selectedPackage === 'destination') tier = 3;

      const finalProvince = selectedProvince === "อื่นๆ"
        ? (customProvince.trim() || "อื่นๆ")
        : selectedProvince;

      const venueData = {
        name: shopName.trim(),
        ownerId: currentUserId,
        latitude,
        longitude,
        geohash,
        category: "café",
        aesthetic_rating: parseFloat((4.7 + Math.random() * 0.3).toFixed(1)), // 4.7 to 5.0
        crowd_status: "Green",
        cover_image: uploadedUrls[0],
        custom_icon_url: uploadedUrls[0], // Use the first uploaded image as custom icon/logo
        images: uploadedUrls,
        description: description.trim() + (phoneNumber.trim() ? (locale === "th" ? `\nโทร: ${phoneNumber.trim()}` : `\nTel: ${phoneNumber.trim()}`) : ""),
        is_sponsored: true,
        sponsor_tier: tier,
        subscription_status: 'ACTIVE',
        province: finalProvince,
        campaign_start_date: serverTimestamp(),
        campaign_end_date: new Date(Date.now() + 30 * 24 * 3600 * 1000)
      };

      if (Object.keys(socialLinks).length > 0) {
        (venueData as any).socialLinks = socialLinks;
      }

      // 4. Write to Firestore database!
      const venuesRef = collection(db, "venues");
      await addDoc(venuesRef, venueData);

      setIsSubmitting(false);
      Alert.alert(
        locale === "th" ? "✅ สมัครแพ็กเกจสำเร็จ!" : "✅ Subscription Successful!",
        locale === "th" 
          ? `ร้านค้า "${shopName}" ของคุณเปิดใช้งานแพ็กเกจ ${selectedPackage?.toUpperCase()} เรียบร้อยแล้ว (โดยไม่เรียกเก็บค่าใช้จ่ายจริงเพื่อวัตถุประสงค์ในการทดสอบระบบ)\n\nตำแหน่งร้านหมุดรูปสี่เหลี่ยมพร้อมขอบสีสันตามธีมของแพ็กเกจ ได้ถูกปักขึ้นบนแผนที่ ณ พิกัดปัจจุบันของคุณแล้ว สามารถเปิดดูเพื่อทดสอบระบบได้ทันทีครับ`
          : `Your shop "${shopName}" has successfully activated the ${selectedPackage?.toUpperCase()} package (No real charges apply; for testing purposes only).\n\nA square-shaped map pin with themed borders has been placed at your current location. You can view it on the map now to test!`,
        [
          {
            text: locale === "th" ? "ตกลง" : "OK",
            onPress: () => {
              setShowEssentialUpload(false);
              setEssentialImages([]);
              setShopName("");
              setPhoneNumber("");
              setDescription("");
              setSocialLinks({});
              setSelectedPackage(null);
              setSelectedProvince("กรุงเทพมหานคร");
              setCustomProvince("");
              onClose();
            },
          },
        ]
      );
    } catch (err: any) {
      setIsSubmitting(false);
      console.error("Register package failed:", err);
      Alert.alert(
        locale === "th" ? "เกิดข้อผิดพลาด" : "Error Occurred", 
        err.message || (locale === "th" ? "ไม่สามารถสมัครแพ็กเกจได้ในขณะนี้" : "Unable to subscribe to package at this time")
      );
    }
  };

  const handleCloseEssentialUpload = () => {
    if (essentialImages.length > 0 || shopName || phoneNumber) {
      Alert.alert(
        locale === "th" ? "ยกเลิกการลงทะเบียน?" : "Cancel registration?", 
        locale === "th" ? "ข้อมูลที่กรอกไว้จะหายไป" : "All entered information will be lost", 
        [
          { text: locale === "th" ? "กรอกต่อ" : "Continue", style: "cancel" },
          {
            text: locale === "th" ? "ยกเลิก" : "Cancel",
            style: "destructive",
            onPress: () => {
              setShowEssentialUpload(false);
              setEssentialImages([]);
              setShopName("");
              setPhoneNumber("");
              setDescription("");
              setSocialLinks({});
              setSelectedPackage(null);
              setSelectedProvince("กรุงเทพมหานคร");
              setCustomProvince("");
            },
          },
        ]
      );
    } else {
      setShowEssentialUpload(false);
      setSelectedPackage(null);
    }
  };

  // ────────── Generic Package Upload Screen ──────────
  const renderEssentialUpload = () => {
    const maxImages = getMaxImages();
    
    const getPackageTitle = () => {
      if (selectedPackage === 'essential') return "📸 Essential Package";
      if (selectedPackage === 'signature') return "⭐ Signature Package";
      if (selectedPackage === 'destination') return "✨ Destination Package";
      return "Package Registration";
    };

    const getPackageSubtitle = () => {
      return locale === "th" 
        ? `อัปโหลดรูปภาพร้านค้า (สูงสุด ${maxImages} รูป)`
        : `Upload shop images (Max ${maxImages} images)`;
    };

    const getImageSectionTitle = () => {
      return locale === "th"
        ? `รูปภาพร้านค้า (${essentialImages.length}/${maxImages})`
        : `Shop Images (${essentialImages.length}/${maxImages})`;
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
                <Text style={uploadStyles.sectionTitle}>{locale === "th" ? "ข้อมูลร้านค้า" : "Shop Information"}</Text>

                <Text style={uploadStyles.inputLabel}>{locale === "th" ? "ชื่อร้านค้า" : "Shop Name"}</Text>
                <TextInput
                  style={uploadStyles.textInput}
                  value={shopName}
                  onChangeText={setShopName}
                  placeholder={selectedPackage === 'essential' ? (locale === "th" ? "เช่น Coffee House Café" : "e.g. Coffee House Café") : (locale === "th" ? "เช่น Golden Roast Coffee" : "e.g. Golden Roast Coffee")}
                  placeholderTextColor={PincTheme.colors.textTertiary}
                  maxLength={40}
                />

                <Text style={uploadStyles.inputLabel}>{locale === "th" ? "เบอร์โทรศัพท์ (ถ้ามี)" : "Phone Number (Optional)"}</Text>
                <TextInput
                  style={uploadStyles.textInput}
                  value={phoneNumber}
                  onChangeText={setPhoneNumber}
                  placeholder={locale === "th" ? "เช่น 081-234-5678" : "e.g. 081-234-5678"}
                  placeholderTextColor={PincTheme.colors.textTertiary}
                  keyboardType="phone-pad"
                  maxLength={15}
                />

                <Text style={uploadStyles.inputLabel}>{locale === "th" ? "รายละเอียด / ที่อยู่ / โปรโมชั่น" : "Description / Address / Promotion"}</Text>
                <TextInput
                  style={[uploadStyles.textInput, { height: 80, textAlignVertical: 'top' }]}
                  value={description}
                  onChangeText={setDescription}
                  placeholder={locale === "th" ? "พิมพ์รายละเอียดของร้านค้า โปรโมชั่น หรือที่อยู่ที่นี่..." : "Type shop details, promotions, or address here..."}
                  placeholderTextColor={PincTheme.colors.textTertiary}
                  multiline={true}
                  maxLength={200}
                />

                <Text style={uploadStyles.inputLabel}>{locale === "th" ? "จังหวัดที่ตั้งของร้านค้า" : "Shop Province"}</Text>
                <View style={provinceStyles.badgeContainer}>
                  {THAI_PROVINCES.map((prov) => (
                    <TouchableOpacity
                      key={prov}
                      style={[
                        provinceStyles.badge,
                        selectedProvince === prov && provinceStyles.badgeActive
                      ]}
                      onPress={() => setSelectedProvince(prov)}
                    >
                      <Text
                        style={[
                          provinceStyles.badgeText,
                          selectedProvince === prov && provinceStyles.badgeTextActive
                        ]}
                      >
                        {locale === "th" ? prov : (PROVINCE_MAP_EN[prov] || prov)}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {selectedProvince === "อื่นๆ" && (
                  <TextInput
                    style={[uploadStyles.textInput, { marginTop: 10 }]}
                    value={customProvince}
                    onChangeText={setCustomProvince}
                    placeholder={locale === "th" ? "ระบุชื่อจังหวัดของคุณ เช่น นครปฐม" : "Specify your province, e.g. Nakhon Pathom"}
                    placeholderTextColor={PincTheme.colors.textTertiary}
                    maxLength={30}
                  />
                )}

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
                  {locale === "th" ? "รูปภาพแรกที่เลือก จะถูกนำไปใช้เป็น \"หน้าปก\" หรือ \"โลโก้\" บนแผนที่" : "The first selected image will be used as the \"cover\" or \"logo\" on the map"}
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
                        {locale === "th" ? "เพิ่มรูป" : "Add Image"}
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>

              {/* ── Preview Section ── */}
              {essentialImages.length > 0 && (shopName || phoneNumber) && (
                <View style={uploadStyles.previewSection}>
                  <Text style={uploadStyles.sectionTitle}>
                    {locale === "th" ? "🔍 ตัวอย่างการแสดงผล" : "🔍 Preview"}
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
                    {locale === "th" ? "✅ ส่งข้อมูลลงทะเบียน" : "✅ Submit Registration"}
                  </Text>
                )}
              </TouchableOpacity>

              <Text style={uploadStyles.disclaimer}>
                {locale === "th" 
                  ? "* ระบบการสมัครบริการนี้เป็นแพ็กเกจเสมือนจริงเพื่อการทดสอบเท่านั้น" 
                  : "* This subscription system is a mock-up for testing purposes only"}
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
            <View style={{ flexDirection: "row", alignItems: "center", flex: 1 }}>
              <Ionicons name="storefront-outline" size={24} color="#FF4B72" style={{ marginRight: 12 }} />
              <View style={styles.headerLeft}>
                <Text style={styles.headerTitle}>{locale === "th" ? "🏪 สำหรับร้านค้า" : "🏪 For Business"}</Text>
                <Text style={styles.headerSubtitle}>
                  {locale === "th" ? "เพิ่มยอดขายด้วยพิกัดที่โดดเด่น" : "Boost sales with outstanding pin locations"}
                </Text>
              </View>
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
            <TouchableOpacity
              style={[
                styles.packageCard,
                { borderColor: "#E5E5E5", borderWidth: 1.5 },
                selectedPackage === 'essential' && { borderColor: "#A6A6A6", borderWidth: 2.5, backgroundColor: "rgba(166, 166, 166, 0.03)" }
              ]}
              onPress={() => setSelectedPackage('essential')}
              activeOpacity={0.9}
            >
              <View
                style={[
                  styles.packageHeader,
                  { backgroundColor: "rgba(166, 166, 166, 0.08)" },
                ]}
              >
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <Text style={[styles.packageName, { color: "#777777" }]}>
                      Essential
                    </Text>
                    {selectedPackage === 'essential' && (
                      <Ionicons name="checkmark-circle" size={20} color="#A6A6A6" />
                    )}
                  </View>
                  <Text style={styles.packageTagline}>
                    {locale === "th" ? "เรียบง่าย แต่มีตัวตน" : "Simple yet visible"}
                  </Text>
                </View>
                <View
                  style={[styles.iconPlaceholder, { borderColor: "#A6A6A6" }]}
                />
              </View>
              <View style={styles.packageBody}>
                <View style={styles.priceContainer}>
                  <Text style={styles.promoPrice}>{storePrices['com.achic.pinc.essential']}</Text>
                  <Text style={styles.perMonth}>{locale === "th" ? "/เดือน" : "/month"}</Text>
                </View>
                <Text style={styles.originalPrice}>
                  {locale === "th" ? "ปกติ ฿399/เดือน" : "Regular ฿399/month"}
                </Text>

                <View style={styles.featuresList}>
                  <Text style={styles.featureItem}>
                    {locale === "th" ? "✓ โชว์ชื่อร้านบนแผนที่ตลอดเวลา" : "✓ Always show shop name on map"}
                  </Text>
                  <Text style={styles.featureItem}>
                    {locale === "th" ? "✓ หมุดกรอบสีเงิน (Silver)" : "✓ Silver border pin"}
                  </Text>
                  <Text style={styles.featureItem}>
                    {locale === "th" ? "✓ แสดงผลในการค้นหาระดับมาตรฐาน" : "✓ Standard search visibility"}
                  </Text>
                  <Text style={styles.featureItem}>
                    {locale === "th" ? "✓ อัปโหลดรูปร้านค้าได้ 3 รูป" : "✓ Upload up to 3 shop photos"}
                  </Text>
                </View>
              </View>
            </TouchableOpacity>

            {/* Package 2: Signature */}
            <TouchableOpacity
              style={[
                styles.packageCard,
                { borderColor: "#E5E5E5", borderWidth: 1.5 },
                selectedPackage === 'signature' && { borderColor: "#FFC107", borderWidth: 2.5, backgroundColor: "rgba(255, 193, 7, 0.03)" }
              ]}
              onPress={() => setSelectedPackage('signature')}
              activeOpacity={0.9}
            >
              {/* Recommend Badge */}
              <View style={styles.recommendBadge}>
                <Text style={styles.recommendBadgeText}>
                  {locale === "th" ? "⭐ คุ้มค่าที่สุด (BEST VALUE)" : "⭐ BEST VALUE"}
                </Text>
              </View>

              <View
                style={[
                  styles.packageHeader,
                  { backgroundColor: "rgba(255, 193, 7, 0.08)" },
                ]}
              >
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <Text style={[styles.packageName, { color: "#D4A000" }]}>
                      Signature
                    </Text>
                    {selectedPackage === 'signature' && (
                      <Ionicons name="checkmark-circle" size={20} color="#FFC107" />
                    )}
                  </View>
                  <Text style={styles.packageTagline}>
                    {locale === "th" ? "สร้างภาพจำแบรนด์" : "Build brand recognition"}
                  </Text>
                </View>
                <View
                  style={[
                    styles.iconPlaceholder,
                    { borderColor: "#FFC107", borderWidth: 1.5 },
                  ]}
                />
              </View>
              <View style={styles.packageBody}>
                <View style={styles.priceContainer}>
                  <Text style={styles.promoPrice}>{storePrices['com.achic.pinc.signature']}</Text>
                  <Text style={styles.perMonth}>{locale === "th" ? "/เดือน" : "/month"}</Text>
                </View>
                <Text style={styles.originalPrice}>
                  {locale === "th" ? "ปกติ ฿599/เดือน" : "Regular ฿599/month"}
                </Text>

                <View style={styles.featuresList}>
                  <Text style={[styles.featureItem, { fontWeight: "700" }]}>
                    {locale === "th" ? "✓ อัปโหลดรูปร้านค้าได้ 5 รูป" : "✓ Upload up to 5 shop photos"}
                  </Text>
                  <Text style={styles.featureItem}>
                    {locale === "th" ? "✓ โชว์ชื่อร้านบนแผนที่ตลอดเวลา" : "✓ Always show shop name on map"}
                  </Text>
                  <Text style={styles.featureItem}>
                    {locale === "th" ? "✓ หมุดกรอบสีทอง (Gold) หนากว่าปกติ" : "✓ Gold border pin (thicker)"}
                  </Text>
                  <Text style={styles.featureItem}>
                    {locale === "th" ? "✓ โอกาสโชว์ในการค้นหาที่มากกว่า" : "✓ Higher search visibility"}
                  </Text>
                </View>
              </View>
            </TouchableOpacity>

            {/* Package 3: Destination */}
            <TouchableOpacity
              style={[
                styles.packageCard,
                { borderColor: "#E5E5E5", borderWidth: 1.5 },
                selectedPackage === 'destination' && { borderColor: "#FF4B72", borderWidth: 2.5, backgroundColor: "rgba(255, 75, 114, 0.03)" }
              ]}
              onPress={() => setSelectedPackage('destination')}
              activeOpacity={0.9}
            >
              <View
                style={[
                  styles.packageHeader,
                  { backgroundColor: "rgba(255, 75, 114, 0.08)" },
                ]}
              >
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <Text style={[styles.packageName, { color: "#FF4B72" }]}>
                      Destination
                    </Text>
                    {selectedPackage === 'destination' && (
                      <Ionicons name="checkmark-circle" size={20} color="#FF4B72" />
                    )}
                  </View>
                  <Text style={styles.packageTagline}>
                    {locale === "th" ? "เปลี่ยนยอดวิวเป็นยอดขาย" : "Convert views into sales"}
                  </Text>
                </View>
                <View
                  style={[
                    styles.iconPlaceholder,
                    { borderColor: "#FF4B72", borderWidth: 1.5 },
                  ]}
                />
              </View>
              <View style={styles.packageBody}>
                <View style={styles.priceContainer}>
                  <Text style={styles.promoPrice}>{storePrices['com.achic.pinc.destination']}</Text>
                  <Text style={styles.perMonth}>{locale === "th" ? "/เดือน" : "/month"}</Text>
                </View>
                <Text style={styles.originalPrice}>
                  {locale === "th" ? "ปกติ ฿899/เดือน" : "Regular ฿899/month"}
                </Text>

                <View style={styles.featuresList}>
                  <Text
                    style={[
                      styles.featureItem,
                      { fontWeight: "bold", color: "#FF4B72" },
                    ]}
                  >
                    {locale === "th" ? "✨ ขอเส้นทางได้" : "✨ Get directions"}
                  </Text>
                  <Text style={[styles.featureItem, { fontWeight: "700" }]}>
                    {locale === "th" ? "✓ อัปโหลดรูปร้านค้าได้ 10 รูป" : "✓ Upload up to 10 shop photos"}
                  </Text>
                  <Text style={styles.featureItem}>
                    {locale === "th" ? "✓ หมุดกรอบสีชมพู (Pink) สุดพรีเมียม" : "✓ Premium pink border pin"}
                  </Text>
                  <Text style={styles.featureItem}>
                    {locale === "th" ? "✓ แสดงผลอันดับ 1 ในการค้นหา (Top Priority)" : "✓ Top priority search ranking"}
                  </Text>
                </View>
              </View>
            </TouchableOpacity>

            <View style={styles.bottomSpacer} />
          </ScrollView>

          {/* Sticky Bottom Panel */}
          <View style={styles.stickyFooter}>
            <TouchableOpacity
              style={[
                styles.stickySelectBtn,
                { backgroundColor: getButtonColor() },
                !selectedPackage && styles.stickySelectBtnDisabled
              ]}
              onPress={handleSelectPackageTrigger}
              disabled={!selectedPackage}
              activeOpacity={0.8}
            >
              <Text style={[styles.stickySelectBtnText, { color: getButtonTextColor() }]}>
                {locale === "th" ? "เลือกแพ็กเกจนี้" : "Select this package"}
              </Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={styles.restoreBtn}
              onPress={handleRestorePurchase}
              activeOpacity={0.7}
            >
              <Text style={styles.restoreBtnText}>
                {locale === "th" ? "กู้คืนสิทธิ์การซื้อ (Restore Purchase)" : "Restore Purchase"}
              </Text>
            </TouchableOpacity>
          </View>
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
  stickyFooter: {
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: PincTheme.colors.border,
    backgroundColor: "#FFFFFF",
    ...PincTheme.shadows.md,
  },
  stickySelectBtn: {
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: "center",
    ...PincTheme.shadows.md,
  },
  stickySelectBtnDisabled: {
    backgroundColor: "#E0E0E0",
    shadowOpacity: 0,
    elevation: 0,
  },
  stickySelectBtnText: {
    fontFamily: PincTheme.fonts.heading,
    fontWeight: "800",
    fontSize: 16,
  },
  restoreBtn: {
    alignItems: "center",
    marginTop: 12,
    paddingVertical: 4,
  },
  restoreBtnText: {
    fontSize: 12,
    color: PincTheme.colors.textSecondary,
    fontFamily: PincTheme.fonts.body,
    fontWeight: "600",
    textDecorationLine: "underline",
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

// ══════════════════════════════════════════
// Province Config and Styles
// ══════════════════════════════════════════
const THAI_PROVINCES = [
  "กรุงเทพมหานคร",
  "เชียงใหม่",
  "ชลบุรี",
  "ภูเก็ต",
  "นนทบุรี",
  "สมุทรปราการ",
  "ปทุมธานี",
  "นครราชสีมา",
  "ขอนแก่น",
  "สงขลา",
  "สุราษฎร์ธานี",
  "ประจวบคีรีขันธ์",
  "อื่นๆ"
];

const PROVINCE_MAP_EN: Record<string, string> = {
  "กรุงเทพมหานคร": "Bangkok",
  "เชียงใหม่": "Chiang Mai",
  "ชลบุรี": "Chonburi",
  "ภูเก็ต": "Phuket",
  "นนทบุรี": "Nonthaburi",
  "สมุทรปราการ": "Samut Prakan",
  "ปทุมธานี": "Pathum Thani",
  "นครราชสีมา": "Nakhon Ratchasima",
  "ขอนแก่น": "Khon Kaen",
  "สงขลา": "Songkhla",
  "สุราษฎร์ธานี": "Surat Thani",
  "ประจวบคีรีขันธ์": "Prachuap Khiri Khan",
  "อื่นๆ": "Others"
};

const provinceStyles = StyleSheet.create({
  badgeContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginVertical: 8,
  },
  badge: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: "#F5F5F5",
    borderWidth: 1,
    borderColor: PincTheme.colors.border,
  },
  badgeActive: {
    backgroundColor: PincTheme.colors.primaryLight,
    borderColor: PincTheme.colors.primary,
  },
  badgeText: {
    fontSize: 12,
    fontFamily: PincTheme.fonts.body,
    color: PincTheme.colors.textSecondary,
    fontWeight: "600",
  },
  badgeTextActive: {
    color: PincTheme.colors.primary,
    fontWeight: "700",
  },
});

export const BusinessPackagesModal = withIAPContext(BusinessPackagesModalComponent);
