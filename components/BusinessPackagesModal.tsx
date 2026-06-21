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
import Purchases, { PurchasesPackage } from "react-native-purchases";
import * as ImagePicker from "expo-image-picker";
import { PincTheme } from "../styles/theme";
import { db, auth, uploadPinImage, encodeGeohash, claimEarlyBirdPackage } from "../services/firebase";
import { collection, addDoc, serverTimestamp, doc, updateDoc, getDoc } from "firebase/firestore";
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
  // Product IDs for Apple StoreKit / RevenueCat (In-App Purchase)
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

  const [isLoadingSubscriptions, setIsLoadingSubscriptions] = useState(false);
  const [isPurchasing, setIsPurchasing] = useState(false);
  const [storePrices, setStorePrices] = useState<Record<string, string>>({
    'com.achic.pinc.essential': '฿199',
    'com.achic.pinc.signature': '฿399',
    'com.achic.pinc.destination': '฿699',
  });

  const [earlyBirdQuota, setEarlyBirdQuota] = useState<number | null>(null);
  const [isClaimingEarlyBird, setIsClaimingEarlyBird] = useState(false);

  // Track the resolved Packages from RevenueCat
  const [rcPackages, setRcPackages] = useState<Record<'destination' | 'essential' | 'signature', PurchasesPackage | null>>({
    destination: null,
    essential: null,
    signature: null,
  });

  // Generic upload flow states for all packages
  const [selectedPackage, setSelectedPackage] = useState<'destination' | 'essential' | 'signature' | null>('destination');

  // Initialize and Fetch subscriptions on mount/visible
  useEffect(() => {
    let active = true;
    const fetchOfferings = async () => {
      if (!visible) return;
      setIsLoadingSubscriptions(true);
      
      // Fetch Early Bird Quota
      try {
        const campaignDoc = await getDoc(doc(db, "system", "campaigns"));
        if (campaignDoc.exists()) {
          const data = campaignDoc.data();
          const claimedCount = data?.early_bird?.claimedCount || 0;
          setEarlyBirdQuota(100 - claimedCount);
        } else {
          setEarlyBirdQuota(100);
        }
      } catch (err) {
        console.warn("Failed to fetch early bird quota", err);
      }

      try {
        console.log("RevenueCat: Fetching offerings...");
        const offerings = await Purchases.getOfferings();
        console.log("RevenueCat: Offerings fetched:", offerings);
        if (active && offerings.current && offerings.current.availablePackages.length > 0) {
          const packagesMap: Record<'destination' | 'essential' | 'signature', PurchasesPackage | null> = {
            destination: null,
            essential: null,
            signature: null,
          };
          const pricesMap: Record<string, string> = {
            'com.achic.pinc.destination': '฿299',
            'com.achic.pinc.essential': '฿199',
            'com.achic.pinc.signature': '฿399',
          };

          offerings.current.availablePackages.forEach((pkg) => {
            const prodId = pkg.product.identifier;
            if (prodId.startsWith('com.achic.pinc.destination')) {
              packagesMap.destination = pkg;
              pricesMap['com.achic.pinc.destination'] = pkg.product.priceString;
            } else if (prodId.startsWith('com.achic.pinc.essential')) {
              packagesMap.essential = pkg;
              pricesMap['com.achic.pinc.essential'] = pkg.product.priceString;
            } else if (prodId.startsWith('com.achic.pinc.signature')) {
              packagesMap.signature = pkg;
              pricesMap['com.achic.pinc.signature'] = pkg.product.priceString;
            }
          });

          setRcPackages(packagesMap);
          setStorePrices((prev) => ({ ...prev, ...pricesMap }));
        }
      } catch (err) {
        console.warn("RevenueCat: Error fetching offerings:", err);
      } finally {
        if (active) setIsLoadingSubscriptions(false);
      }
    };

    fetchOfferings();

    return () => {
      active = false;
    };
  }, [visible]);

  const handleSelectPackageTrigger = async () => {
    if (!selectedPackage) {
      Alert.alert(
        locale === "th" ? "กรุณาเลือกแพ็กเกจ" : "Please select a package",
        locale === "th" ? "กรุณาคลิกเลือกแพ็กเกจที่ต้องการก่อนทำรายการ" : "Please click to select a package first"
      );
      return;
    }

    const pkgToPurchase = rcPackages[selectedPackage];
    if (!pkgToPurchase) {
      Alert.alert(
        locale === "th" ? "ไม่พบข้อมูลแพ็กเกจ" : "Package Not Available",
        locale === "th" ? "ไม่พบการตั้งค่าแพ็กเกจนี้ในระบบการชำระเงิน กรุณาลองใหม่อีกครั้ง" : "This package is not configured in the payment system. Please try again."
      );
      return;
    }

    setIsPurchasing(true);
    try {
      console.log(`RevenueCat: Purchasing package: ${pkgToPurchase.product.identifier}`);
      const { customerInfo } = await Purchases.purchasePackage(pkgToPurchase);
      console.log("RevenueCat: Purchase successful, customerInfo:", customerInfo);
      
      // Verify active entitlement
      if (customerInfo.entitlements.active['premium'] !== undefined) {
        let tierNum = 1;
        if (selectedPackage === 'essential') tierNum = 1;
        else if (selectedPackage === 'signature') tierNum = 2;
        else if (selectedPackage === 'destination') tierNum = 3;

        const currentUserId = auth.currentUser?.uid;
        if (currentUserId) {
          const userRef = doc(db, "users", currentUserId);
          await updateDoc(userRef, {
            role: "PREMIUM_STORE",
            subscriptionStatus: "ACTIVE",
            subscriptionTier: tierNum,
            subscriptionProductId: pkgToPurchase.product.identifier,
            subscriptionExpiry: new Date(Date.now() + 30 * 24 * 3600 * 1000), // Fallback local expiry
          });
          console.log("RevenueCat: Firestore user updated successfully.");
        }

        setShowEssentialUpload(true);
        Alert.alert(
          locale === "th" ? "สมัครสมาชิกสำเร็จ!" : "Subscription Successful!",
          locale === "th"
            ? "ยินดีต้อนรับสู่ระบบพรีเมียม กรุณากรอกข้อมูลลงทะเบียนร้านค้าของคุณ"
            : "Welcome to Premium! Please enter your shop details to register."
        );
      } else {
        console.warn("RevenueCat: Purchase succeeded but entitlement 'premium' is not active.");
        Alert.alert(
          locale === "th" ? "ไม่มีสิทธิ์ใช้งาน" : "Entitlement Inactive",
          locale === "th"
            ? "ชำระเงินสำเร็จ แต่ระบบยังไม่เปิดใช้งานสิทธิ์ 'premium' กรุณาติดต่อทีมงาน"
            : "Payment completed but the 'premium' entitlement is not active. Please contact support."
        );
      }
    } catch (err: any) {
      console.log("RevenueCat: Purchase error:", err);
      // Catch user cancellation to prevent annoying alerts
      if (err.userCancelled) {
        console.log("RevenueCat: User cancelled purchase flow.");
      } else {
        Alert.alert(
          locale === "th" ? "การสมัครสมาชิกขัดข้อง" : "Subscription Failed",
          err.message || (locale === "th" ? "เกิดข้อผิดพลาดระหว่างทำรายการ" : "An error occurred during checkout.")
        );
      }
    } finally {
      setIsPurchasing(false);
    }
  };

  const handleClaimEarlyBird = async () => {
    const currentUserId = auth.currentUser?.uid;
    if (!currentUserId) {
      Alert.alert(locale === "th" ? "กรุณาเข้าสู่ระบบ" : "Please log in");
      return;
    }

    setIsClaimingEarlyBird(true);
    try {
      const success = await claimEarlyBirdPackage(currentUserId);
      if (success) {
        setEarlyBirdQuota(prev => (prev ? prev - 1 : 0));
        setShowEssentialUpload(true);
        Alert.alert(
          locale === "th" ? "จองสิทธิ์สำเร็จ!" : "Claim Successful!",
          locale === "th" 
            ? "คุณได้รับสิทธิ์ Premium ฟรี 3 เดือน สถานะตอนนี้คือ 'รอตรวจสอบ' กรุณากรอกข้อมูลหน้าร้านของคุณให้ครบถ้วนเพื่อรอแอดมินอนุมัติครับ" 
            : "You have claimed the 3 months free Premium! Your status is 'Pending Approval'. Please fill in your shop details to wait for admin approval."
        );
      } else {
        Alert.alert(
          locale === "th" ? "โควต้าเต็มแล้ว" : "Quota Full",
          locale === "th" ? "ขออภัย สิทธิ์โปรโมชั่น 100 ร้านแรกเต็มแล้วครับ" : "Sorry, the 100 early bird spots are full."
        );
        setEarlyBirdQuota(0);
      }
    } catch (err: any) {
      Alert.alert(locale === "th" ? "เกิดข้อผิดพลาด" : "Error", err.message);
    } finally {
      setIsClaimingEarlyBird(false);
    }
  };

  const handleRestorePurchase = async () => {
    setIsPurchasing(true);
    try {
      console.log("RevenueCat: Restoring purchases...");
      const customerInfo = await Purchases.restorePurchases();
      console.log("RevenueCat: Restore response:", customerInfo);

      if (customerInfo.entitlements.active['premium'] !== undefined) {
        const activeEntitlement = customerInfo.entitlements.active['premium'];
        const prodId = activeEntitlement.productIdentifier;
        
        let tier: 'essential' | 'signature' | 'destination' = 'essential';
        let tierNum = 1;
        if (prodId === 'com.achic.pinc.essential') {
          tier = 'essential';
          tierNum = 1;
        } else if (prodId === 'com.achic.pinc.signature') {
          tier = 'signature';
          tierNum = 2;
        } else if (prodId === 'com.achic.pinc.destination') {
          tier = 'destination';
          tierNum = 3;
        }

        const currentUserId = auth.currentUser?.uid;
        if (currentUserId) {
          const userRef = doc(db, "users", currentUserId);
          await updateDoc(userRef, {
            role: "PREMIUM_STORE",
            subscriptionStatus: "ACTIVE",
            subscriptionTier: tierNum,
            subscriptionProductId: prodId,
            subscriptionExpiry: activeEntitlement.expirationDate 
              ? new Date(activeEntitlement.expirationDate) 
              : new Date(Date.now() + 30 * 24 * 3600 * 1000),
          });
        }

        setSelectedPackage(tier);
        setShowEssentialUpload(true);

        Alert.alert(
          locale === "th" ? "กู้คืนสิทธิ์การซื้อสำเร็จ!" : "Restore Successful!",
          locale === "th"
            ? `พบข้อมูลการสมัครสมาชิกแพ็กเกจ ${tier.toUpperCase()} ที่ยังใช้งานได้ ระบบได้กู้คืนสิทธิ์ให้คุณเรียบร้อยแล้ว`
            : `Active subscription found for ${tier.toUpperCase()} package. Restored successfully.`
        );
      } else {
        Alert.alert(
          locale === "th" ? "ไม่พบสิทธิ์การซื้อ" : "No Purchase History Found",
          locale === "th"
            ? "ไม่พบข้อมูลการซื้อแพ็กเกจที่ยังใช้งานได้ในระบบ"
            : "No active subscriptions found for this account."
        );
      }
    } catch (err: any) {
      console.error("RevenueCat: Restore failed:", err);
      Alert.alert(
        locale === "th" ? "กู้คืนสิทธิ์ไม่สำเร็จ" : "Restore Failed",
        err.message || (locale === "th" ? "ไม่สามารถกู้คืนสิทธิ์การซื้อได้ในขณะนี้" : "Unable to restore purchases at this time.")
      );
    } finally {
      setIsPurchasing(false);
    }
  };

  const getButtonColor = () => {
    return "#FF4B72";
  };

  const getButtonTextColor = () => {
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
    return 999;
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
              quality: 1.0,
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
              quality: 1.0,
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
                    autoFocus={true}
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
                <Text style={styles.headerTitle}>{locale === "th" ? "สำหรับร้านค้า" : "For Business"}</Text>
                <Text style={styles.headerSubtitle}>
                  {locale === "th" ? "เพิ่มยอดขายด้วยพิกัดที่โดดเด่น" : "Boost sales with outstanding pin locations"}
                </Text>
              </View>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Early Bird Banner */}
          {earlyBirdQuota !== null && earlyBirdQuota > 0 && (
            <View style={{ backgroundColor: 'rgba(255, 75, 114, 0.1)', paddingVertical: 12, paddingHorizontal: 24, borderBottomWidth: 1, borderBottomColor: 'rgba(255, 75, 114, 0.2)' }}>
              <Text style={{ color: '#FF4B72', fontWeight: 'bold', fontSize: 13, textAlign: 'center', fontFamily: PincTheme.fonts.heading }}>
                {locale === "th" 
                  ? `🔥 แคมเปญ 100 ร้านแรก: สมัคร Premium ฟรี 3 เดือน! (เหลืออีก ${earlyBirdQuota} สิทธิ์)` 
                  : `🔥 Early Bird: Free 3 Months Premium! (Only ${earlyBirdQuota} spots left)`}
              </Text>
            </View>
          )}

          <ScrollView
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {/* Package 1: Destination (Only Package) */}
            <TouchableOpacity
              style={[
                styles.packageCard,
                { borderColor: "#FF4B72", borderWidth: 2.5, backgroundColor: "rgba(255, 75, 114, 0.03)" }
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
                      Pinc Business
                    </Text>
                    <Ionicons name="checkmark-circle" size={20} color="#FF4B72" />
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
                  <Text style={styles.promoPrice}>฿299</Text>
                  <Text style={styles.perMonth}>{locale === "th" ? "/เดือน" : "/month"}</Text>
                </View>
                <Text style={styles.originalPrice}>
                  {locale === "th" ? "อัปโหลดรูปภาพได้ไม่จำกัด" : "Unlimited photo uploads"}
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
                    {locale === "th" ? "✓ อัปโหลดรูปร้านค้าได้ไม่จำกัด" : "✓ Unlimited photo uploads"}
                  </Text>
                  <Text style={styles.featureItem}>
                    {locale === "th" ? "✓ หมุดสี่เหลี่ยมขอบสีชมพูสุดพรีเมียม" : "✓ Premium pink rectangular pin"}
                  </Text>
                  <Text style={styles.featureItem}>
                    {locale === "th" ? "✓ แสดงผลอันดับ 1 ในการค้นหา" : "✓ Top priority search ranking"}
                  </Text>
                </View>
              </View>
            </TouchableOpacity>

            <View style={styles.bottomSpacer} />
          </ScrollView>

          {/* Sticky Bottom Panel */}
          <View style={styles.stickyFooter}>
            {earlyBirdQuota !== null && earlyBirdQuota > 0 ? (
              <TouchableOpacity
                style={[
                  styles.stickySelectBtn,
                  { backgroundColor: "#FF4B72" },
                  isClaimingEarlyBird && styles.stickySelectBtnDisabled
                ]}
                onPress={handleClaimEarlyBird}
                disabled={isClaimingEarlyBird}
                activeOpacity={0.8}
              >
                {isClaimingEarlyBird ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={[styles.stickySelectBtnText, { color: "#FFFFFF" }]}>
                    {locale === "th" ? "รับสิทธิ์ฟรี 3 เดือน" : "Claim Free 3 Months"}
                  </Text>
                )}
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={[
                  styles.stickySelectBtn,
                  { backgroundColor: getButtonColor() },
                  (!selectedPackage || isPurchasing) && styles.stickySelectBtnDisabled
                ]}
                onPress={handleSelectPackageTrigger}
                disabled={!selectedPackage || isPurchasing}
                activeOpacity={0.8}
              >
                {isPurchasing ? (
                  <ActivityIndicator size="small" color={selectedPackage === 'signature' ? "#000000" : "#FFFFFF"} />
                ) : (
                  <Text style={[styles.stickySelectBtnText, { color: getButtonTextColor() }]}>
                    {locale === "th" ? "เลือกแพ็กเกจนี้" : "Select this package"}
                  </Text>
                )}
              </TouchableOpacity>
            )}
            
            <TouchableOpacity
              style={styles.restoreBtn}
              onPress={handleRestorePurchase}
              disabled={isPurchasing}
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
    backgroundColor: PincTheme.colors.card,
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
    backgroundColor: PincTheme.colors.card,
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
    backgroundColor: PincTheme.colors.card,
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
    color: PincTheme.colors.textPrimary,
  },
  bottomSpacer: {
    height: 40,
  },
  stickyFooter: {
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: PincTheme.colors.border,
    backgroundColor: PincTheme.colors.card,
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
    backgroundColor: PincTheme.colors.card,
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

export const BusinessPackagesModal = BusinessPackagesModalComponent;
