const { initializeApp } = require('firebase/app');
const { getAuth, createUserWithEmailAndPassword } = require('firebase/auth');
const { getFirestore, doc, setDoc } = require('firebase/firestore');

const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY || "",
  authDomain: "pinc-app-d2501.firebaseapp.com",
  projectId: "pinc-app-d2501",
  storageBucket: "pinc-app-d2501.firebasestorage.app",
  messagingSenderId: "929703082491",
  appId: "1:929703082491:web:cb4af54197a7b85f3f5335e",
  measurementId: "G-9FJVD6RCDH"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const email = "apple_test@pinc.com";
const password = "password123";
const username = "apple_test";
const bio = "Cafe hopper & Apple tester ☕✨";
const profilePicUrl = "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&q=80";

async function main() {
  console.log("Creating demo account...");
  try {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;
    console.log("Auth user created. UID:", user.uid);

    const profileData = {
      userId: user.uid,
      username: username,
      bio: bio,
      profile_pic: profilePicUrl,
      created_at: new Date()
    };

    await setDoc(doc(db, "users", user.uid), profileData);
    console.log("Firestore profile document created successfully!");
    console.log("\n--- Demo Account Created ---");
    console.log("Email Address:", email);
    console.log("Password:", password);
    console.log("Username:", username);
  } catch (err) {
    console.error("Error creating demo account:", err.message || err);
  }
}

main();
