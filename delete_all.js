const { initializeApp } = require("firebase/app");
const { getFirestore, collection, getDocs, deleteDoc, doc } = require("firebase/firestore");

const firebaseConfig = {
  apiKey: "AIzaSyCVlaNuAkdkojlTH0-ubpuJaWXPylpd6IA",
  authDomain: "pinc-app-d2501.firebaseapp.com",
  projectId: "pinc-app-d2501",
  storageBucket: "pinc-app-d2501.firebasestorage.app",
  messagingSenderId: "929703082491",
  appId: "1:929703082491:web:cb4af54197a7b85f3f5335e",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function deleteAll() {
  const pinsSnap = await getDocs(collection(db, "pins"));
  for (const p of pinsSnap.docs) {
    await deleteDoc(doc(db, "pins", p.id));
    console.log("Deleted pin:", p.id);
  }
  
  const venuesSnap = await getDocs(collection(db, "venues"));
  for (const v of venuesSnap.docs) {
    await deleteDoc(doc(db, "venues", v.id));
    console.log("Deleted venue:", v.id);
  }
  
  console.log("Done deleting all pins and venues!");
  process.exit(0);
}

deleteAll().catch(console.error);
