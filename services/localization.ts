export const translations: { [locale: string]: { [key: string]: string } } = {
  en: {
    emptyChill: "Empty / Chill",
    moderateQueue: "Moderate Queue",
    crowdedLongLine: "Crowded / Long Line",
    aestheticTab: "📸 The Aesthetic",
    realityTab: "⚡ The Reality",
    aestheticSub: "IG Vibe (Curated)",
    realitySub: "X Speed (Live Check)",
    noVerifiedReports: "No verified reports yet.",
    firstCheckInPrompt: "Be the first to check in and report live conditions! 📍",
    peopleLiveLast2h: "of people live in the last 2h say this place is:",
    peopleOnSiteOverall: "of people on-site overall say this place is:",
    chillBadge: "CHILL 🟢",
    moderateBadge: "MODERATE 🟡",
    packedBadge: "PACKED 🔴",
    noLiveChecksToday: "No live checks today ☕",
    postFirstCheckIn: "Be the first to post a raw reality check for this venue using the Pinc Button below!",
    today: "Today",
    yesterday: "Yesterday",
    at: "at",
    verifiedLive: "Verified Live 📍",
    settingsTitle: "GDPR & Privacy Settings",
    locationTrackingLabel: "Location Proximity Tracking",
    locationTrackingDesc: "Required to verify if you are within 50m to post Verified checks. Disable to hopper privately.",
    deleteAccountBtn: "Delete Account & Data",
    deleteAccountConfirmTitle: "Delete Account?",
    deleteAccountConfirmMsg: "This action is permanent and complies with GDPR Article 17 (Right to Erasure). All your user profile data will be permanently wiped.",
    cancel: "Cancel",
    delete: "Delete",
    signOut: "Sign Out",
    languageLabel: "App Language"
  },
  th: {
    emptyChill: "ว่าง / ชิล",
    moderateQueue: "คิวปานกลาง",
    crowdedLongLine: "คนเยอะมาก / คิวยาว",
    aestheticTab: "📸 บรรยากาศ (สวยงาม)",
    realityTab: "⚡ ความเป็นจริง (ล่าสุด)",
    aestheticSub: "IG Vibe (คัดสรร)",
    realitySub: "X Speed (เช็คอินสด)",
    noVerifiedReports: "ยังไม่มีรายงานที่ยืนยันแล้ว",
    firstCheckInPrompt: "ร่วมเช็คอินและรายงานสถานการณ์สดเป็นคนแรก! 📍",
    peopleLiveLast2h: "ของคนที่อยู่หน้างานใน 2 ชม. ล่าสุดบอกว่าร้านนี้:",
    peopleOnSiteOverall: "ของคนที่อยู่หน้างานทั้งหมดบอกว่าร้านนี้:",
    chillBadge: "ชิลมาก 🟢",
    moderateBadge: "ปานกลาง 🟡",
    packedBadge: "แน่นมาก 🔴",
    noLiveChecksToday: "วันนี้ยังไม่มีการเช็คอินสด ☕",
    postFirstCheckIn: "เป็นคนแรกที่ส่งภาพจริงใจไม่แต่งของร้านนี้ด้วยปุ่ม PINC ด้านล่างกันเลย!",
    today: "วันนี้",
    yesterday: "เมื่อวานนี้",
    at: "เวลา",
    verifiedLive: "อยู่หน้างานจริง 📍",
    settingsTitle: "ความเป็นส่วนตัว GDPR & ตั้งค่า",
    locationTrackingLabel: "การติดตามตำแหน่งระบุตัวตน",
    locationTrackingDesc: "จำเป็นสำหรับตรวจสอบว่าคุณอยู่หน้างานจริงในระยะ 50ม. หรือไม่ ปิดเพื่อความเป็นส่วนตัวสูงสุด",
    deleteAccountBtn: "ลบและทำลายบัญชีผู้ใช้",
    deleteAccountConfirmTitle: "ลบบัญชีผู้ใช้?",
    deleteAccountConfirmMsg: "การดำเนินการนี้เป็นแบบถาวรและสอดคล้องกับ GDPR มาตรา 17 (สิทธิ์ในการถูกลืม) ข้อมูลส่วนตัวของคุณทั้งหมดจะถูกลบออกจากระบบอย่างถาวร",
    cancel: "ยกเลิก",
    delete: "ลบ",
    signOut: "ออกจากระบบ",
    languageLabel: "ภาษาของแอป"
  }
};

/**
 * Returns the translation string for the given locale and key.
 */
export function t(locale: "en" | "th", key: string): string {
  const dict = translations[locale] || translations.en;
  return dict[key] || key;
}
