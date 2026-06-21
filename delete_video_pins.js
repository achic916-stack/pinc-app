// Script to delete video pins from Firebase Firestore
const { initializeApp } = require("firebase/app");
const { getFirestore, collection, query, where, getDocs, deleteDoc, doc } = require("firebase/firestore");

const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY || "",
  authDomain: "pinc-app-d2501.firebaseapp.com",
  projectId: "pinc-app-d2501",
  storageBucket: "pinc-app-d2501.firebasestorage.app",
  messagingSenderId: "929703082491",
  appId: "1:929703082491:web:cb4af54197a7b85f3f5335e",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function deleteVideoPins() {
  console.log("Searching for video pins...");
  
  const pinsRef = collection(db, "pins");
  const q = query(pinsRef, where("media_type", "==", "video"));
  const snapshot = await getDocs(q);
  
  if (snapshot.empty) {
    console.log("No video pins found.");
    process.exit(0);
  }

  console.log(`Found ${snapshot.size} video pin(s):`);
  for (const docSnap of snapshot.docs) {
    const data = docSnap.data();
    console.log(`  - ID: ${docSnap.id} | User: ${data.username} | URL: ${data.image_url?.substring(0, 60)}...`);
  }

  console.log("\nDeleting all video pins...");
  for (const docSnap of snapshot.docs) {
    await deleteDoc(doc(db, "pins", docSnap.id));
    console.log(`  ✓ Deleted pin: ${docSnap.id}`);
  }

  console.log("\nDone! All video pins deleted.");
  process.exit(0);
}

deleteVideoPins().catch(err => {
  console.error("Error:", err);
  process.exit(1);
});
