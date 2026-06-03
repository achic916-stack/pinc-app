/**
 * Pinc App Admin Statistics CLI Utility
 * Usage: node admin_stats.js
 */

const PROJECT_ID = "pinc-app-d2501";
const BASE_URL = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

// Helper to extract values from Firestore REST document structure
function mapFields(doc) {
  const fields = doc.fields || {};
  const obj = {};
  for (const key in fields) {
    const valObj = fields[key];
    if ("stringValue" in valObj) {
      obj[key] = valObj.stringValue;
    } else if ("booleanValue" in valObj) {
      obj[key] = valObj.booleanValue;
    } else if ("integerValue" in valObj) {
      obj[key] = parseInt(valObj.integerValue, 10);
    } else if ("doubleValue" in valObj) {
      obj[key] = parseFloat(valObj.doubleValue);
    } else if ("timestampValue" in valObj) {
      obj[key] = new Date(valObj.timestampValue);
    }
  }
  return obj;
}

async function fetchAllDocuments(collectionName) {
  let documents = [];
  let nextPageToken = "";
  
  do {
    const url = `${BASE_URL}/${collectionName}?pageSize=1000${nextPageToken ? `&pageToken=${nextPageToken}` : ""}`;
    try {
      const res = await fetch(url);
      if (!res.ok) {
        if (res.status === 404) {
          // Collection might not exist or be empty
          return [];
        }
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }
      const data = await res.json();
      if (data.documents) {
        documents = documents.concat(data.documents);
      }
      nextPageToken = data.nextPageToken || "";
    } catch (err) {
      console.error(`Error querying collection "${collectionName}":`, err.message);
      return [];
    }
  } while (nextPageToken);
  
  return documents;
}

// Fallback logic to extract province names from unstructured address descriptions
function parseProvinceFromDesc(desc) {
  const text = (desc || "").toLowerCase();
  if (text.includes("กรุงเทพ") || text.includes("bangkok") || text.includes("กทม")) return "กรุงเทพมหานคร";
  if (text.includes("เชียงใหม่") || text.includes("chiang mai")) return "เชียงใหม่";
  if (text.includes("ชลบุรี") || text.includes("chonburi") || text.includes("พัทยา") || text.includes("pattaya")) return "ชลบุรี";
  if (text.includes("ภูเก็ต") || text.includes("phuket")) return "ภูเก็ต";
  if (text.includes("นนทบุรี") || text.includes("nonthaburi")) return "นนทบุรี";
  if (text.includes("สมุทรปราการ") || text.includes("samut prakan")) return "สมุทรปราการ";
  if (text.includes("ปทุมธานี") || text.includes("pathum thani")) return "ปทุมธานี";
  if (text.includes("นครราชสีมา") || text.includes("korat") || text.includes("โคราช")) return "นครราชสีมา";
  if (text.includes("ขอนแก่น") || text.includes("khon kaen")) return "ขอนแก่น";
  if (text.includes("สงขลา") || text.includes("หาดใหญ่") || text.includes("hat yai")) return "สงขลา";
  if (text.includes("สุราษฎร์") || text.includes("surat thani") || text.includes("สมุย") || text.includes("samui")) return "สุราษฎร์ธานี";
  if (text.includes("หัวหิน") || text.includes("hua hin") || text.includes("ประจวบ") || text.includes("prachuap")) return "ประจวบคีรีขันธ์";
  return "อื่นๆ / ไม่ระบุ";
}

async function run() {
  console.log("==================================================");
  console.log("📊 กำลังประมวลผลข้อมูลสถิติ Pinc App (Firestore REST)...");
  console.log("==================================================\n");

  const [usersRaw, pinsRaw, venuesRaw] = await Promise.all([
    fetchAllDocuments("users"),
    fetchAllDocuments("pins"),
    fetchAllDocuments("venues")
  ]);

  const totalUsers = usersRaw.length;
  const totalPins = pinsRaw.length;

  // Calculate unique creators
  const creatorSet = new Set();
  pinsRaw.forEach(doc => {
    const data = mapFields(doc);
    if (data.userId) creatorSet.add(data.userId);
  });
  const uniqueCreators = creatorSet.size;

  // Process sponsored shops and provinces
  let totalSponsored = 0;
  let tier1 = 0; // Essential
  let tier2 = 0; // Signature
  let tier3 = 0; // Destination
  
  const provincesBreakdown = {};

  venuesRaw.forEach(doc => {
    const v = mapFields(doc);
    
    // Only count sponsored shops
    if (v.is_sponsored === true) {
      totalSponsored++;
      const tier = v.sponsor_tier || 1;
      if (tier === 1) tier1++;
      else if (tier === 2) tier2++;
      else if (tier === 3) tier3++;

      let province = v.province || parseProvinceFromDesc(v.description);
      provincesBreakdown[province] = (provincesBreakdown[province] || 0) + 1;
    }
  });

  // Sort provinces by shop count descending
  const sortedProvinces = Object.keys(provincesBreakdown)
    .map(name => ({ name, count: provincesBreakdown[name] }))
    .sort((a, b) => b.count - a.count);

  console.log("📈 --- สรุปภาพรวมการใช้งานหลัก ---");
  console.log(`- บัญชีผู้ใช้งานลงทะเบียนทั้งหมด: ${totalUsers} บัญชี`);
  console.log(`- จำนวนคนปักหมุดความทรงจำ (Creators): ${uniqueCreators} คน`);
  console.log(`- จำนวนภาพ/วิดีโอปักหมุดทั้งหมด: ${totalPins} หมุด`);
  console.log(`- จำนวนร้านค้าสมัครสปอนเซอร์ทั้งหมด: ${totalSponsored} ร้าน`);
  console.log("");

  console.log("🛍️ --- สรุปแพ็กเกจผู้สมัครสปอนเซอร์ ---");
  console.log(`- Silver (Essential - 199฿/เดือน): ${tier1} ร้าน`);
  console.log(`- Gold (Signature - 399฿/เดือน): ${tier2} ร้าน`);
  console.log(`- Pink (Destination - 699฿/เดือน): ${tier3} ร้าน`);
  console.log("");

  console.log("📍 --- สถิติจำนวนร้านค้าแยกรายจังหวัด ---");
  if (sortedProvinces.length === 0) {
    console.log("  (ไม่มีข้อมูลร้านค้าสมัครสปอนเซอร์)");
  } else {
    sortedProvinces.forEach((prov, idx) => {
      console.log(`  ${idx + 1}. จังหวัด ${prov.name}: ${prov.count} ร้าน`);
    });
  }
  
  console.log("\n==================================================");
  console.log("ℹ️ คำแนะนำเพิ่มเติม:");
  console.log("1. ยอดผู้ใช้และยอดหมุดความทรงจำเป็นการนับจริงจากฐานข้อมูล");
  console.log("2. ยอดคนดาวน์โหลดและติดตั้งแอป (Installs) กรุณาดูใน Play Console / App Store Connect หรือ Google Analytics (first_open)");
  console.log("==================================================");
}

run();
