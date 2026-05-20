import { initializeApp, getApps, getApp } from "firebase/app";
import { 
  getFirestore, 
  collection, 
  doc, 
  setDoc,
  getDoc,
  addDoc, 
  getDocs, 
  query, 
  where, 
  orderBy, 
  onSnapshot,
  Timestamp,
  serverTimestamp,
  deleteDoc
} from "firebase/firestore";
import { getStorage, ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { 
  getAuth, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signOut,
  User,
  deleteUser
} from "firebase/auth";

// ==========================================
// FIREBASE CLIENT CONFIGURATION
// ==========================================
const firebaseConfig = {
  apiKey: "YOUR_API_KEY_HERE",
  authDomain: "pinc-app-12345.firebaseapp.com",
  projectId: "pinc-app-12345",
  storageBucket: "pinc-app-12345.appspot.com",
  messagingSenderId: "1234567890",
  appId: "1:1234567890:web:abcdef123456789"
};

// Initialize Firebase
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
export const db = getFirestore(app);
export const auth = getAuth(app);
export const storage = getStorage(app);

// ==========================================
// INTERFACES & SCHEMAS
// ==========================================
export interface UserProfile {
  userId: string;
  username: string;
  profile_pic: string;
  bio: string;
  created_at: Date;
}

export interface Venue {
  venueId: string;
  name: string;
  latitude: number;
  longitude: number;
  geohash: string;
  category: string;
  aesthetic_rating: number;
  crowd_status: "Green" | "Yellow" | "Red" | "green" | "yellow" | "red";
  cover_image: string;
  distance?: number;
  is_sponsored?: boolean;
  sponsor_tier?: number;
  custom_icon_url?: string;
  campaign_start_date?: Date | Timestamp;
  campaign_end_date?: Date | Timestamp;
  last_updated?: Date | Timestamp;
}

/**
 * Checks if a venue's sponsored campaign is currently active based on date bounds.
 */
export function isCampaignActive(venue: Venue): boolean {
  if (!venue.is_sponsored) return false;
  const now = new Date();
  
  const start = venue.campaign_start_date instanceof Date 
    ? venue.campaign_start_date 
    : (venue.campaign_start_date as any)?.toDate 
      ? (venue.campaign_start_date as any).toDate() 
      : null;
      
  const end = venue.campaign_end_date instanceof Date 
    ? venue.campaign_end_date 
    : (venue.campaign_end_date as any)?.toDate 
      ? (venue.campaign_end_date as any).toDate() 
      : null;

  if (!start || !end) return false;
  return now >= start && now <= end;
}

export interface Pin {
  pinId?: string;
  userId: string;
  username: string;
  user_profile_pic: string;
  venueId: string;
  image_url: string;
  text_content: string;
  timestamp: Date;
  latitude: number;
  longitude: number;
  geohash: string;
  is_live: boolean;
  is_live_verified: boolean;
  report_type: "aesthetic" | "live_status";
  live_crowd_vote?: "chill" | "moderate" | "packed";
  user_aesthetic_rating?: number; // Optional user aesthetic rating review
}

// ==========================================
// AUTHENTICATION SERVICES
// ==========================================

/**
 * Registers a new user with Firebase Auth and creates a profile document in Firestore.
 */
export async function signUpUser(params: {
  email: string;
  password: string;
  username: string;
  bio: string;
  profilePicUri?: string;
}): Promise<UserProfile> {
  const { email, password, username, bio, profilePicUri } = params;

  // 1. Create auth user
  const userCredential = await createUserWithEmailAndPassword(auth, email, password);
  const user = userCredential.user;

  let profilePicUrl = "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&q=80";

  // 2. Upload profile pic if provided
  if (profilePicUri) {
    try {
      profilePicUrl = await uploadProfileImage(profilePicUri, user.uid);
    } catch (err) {
      console.warn("Failed to upload custom avatar, falling back to default.", err);
    }
  }

  // 3. Create profile document in Firestore
  const profileData = {
    userId: user.uid,
    username: username.toLowerCase().trim(),
    bio: bio || "Cafe hopper & travel enthusiast ☕✨",
    profile_pic: profilePicUrl,
    created_at: serverTimestamp()
  };

  await setDoc(doc(db, "users", user.uid), profileData);

  return {
    userId: user.uid,
    username: profileData.username,
    bio: profileData.bio,
    profile_pic: profileData.profile_pic,
    created_at: new Date()
  };
}

/**
 * Signs in a user with email and password.
 */
export async function signInUser(email: string, password: string): Promise<User> {
  const userCredential = await signInWithEmailAndPassword(auth, email, password);
  return userCredential.user;
}

/**
 * Signs out the current user.
 */
export async function signOutUser(): Promise<void> {
  await signOut(auth);
}

/**
 * Fetches user profile details from Firestore.
 */
export async function fetchUserProfile(userId: string): Promise<UserProfile | null> {
  const docRef = doc(db, "users", userId);
  const docSnap = await getDoc(docRef);

  if (docSnap.exists()) {
    const data = docSnap.data();
    return {
      userId: docSnap.id,
      username: data.username,
      profile_pic: data.profile_pic,
      bio: data.bio,
      created_at: (data.created_at as Timestamp)?.toDate() || new Date()
    };
  }
  return null;
}

/**
 * GDPR Article 17 compliant Account Deletion.
 * Erases the user's profile document from the Firestore database, then deletes the Firebase Auth record.
 */
export async function deleteUserAccount(userId: string): Promise<void> {
  const currentUser = auth.currentUser;
  if (!currentUser) throw new Error("No authenticated user found.");

  // 1. Delete user profile document from Firestore
  const docRef = doc(db, "users", userId);
  await deleteDoc(docRef);

  // 2. Delete the actual Firebase Authentication user profile
  await deleteUser(currentUser);
}

// ==========================================
// CLIENT SERVICES & REALTIME LISTENERS
// ==========================================

/**
 * Encodes lat/lng to standard 9-character geohash
 */
export function encodeGeohash(latitude: number, longitude: number, precision = 9): string {
  const BASE32 = "0123456789bcdefghjkmnpqrstuvwxyz";
  const BITS = [16, 8, 4, 2, 1];
  let latMin = -90, latMax = 90;
  let lonMin = -180, lonMax = 180;
  let hash = "";
  let bit = 0;
  let ch = 0;
  let even = true;

  while (hash.length < precision) {
    if (even) {
      const mid = (lonMin + lonMax) / 2;
      if (longitude > mid) {
        ch |= BITS[bit];
        lonMin = mid;
      } else {
        lonMax = mid;
      }
    } else {
      const mid = (latMin + latMax) / 2;
      if (latitude > mid) {
        ch |= BITS[bit];
        latMin = mid;
      } else {
        latMax = mid;
      }
    }
    even = !even;
    if (bit < 4) {
      bit++;
    } else {
      hash += BASE32.charAt(ch);
      bit = 0;
      ch = 0;
    }
  }
  return hash;
}

/**
 * Calculates Haversine distance between two coordinates in meters.
 */
export function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3; // Earth's radius in meters
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

export function subscribeToVenues(onUpdate: (venues: Venue[]) => void) {
  const q = query(collection(db, "venues"));
  return onSnapshot(q, (snapshot) => {
    const venues: Venue[] = [];
    snapshot.forEach((doc) => {
      const data = doc.data();
      venues.push({
        venueId: doc.id,
        ...data,
        campaign_start_date: data.campaign_start_date ? (data.campaign_start_date as Timestamp).toDate() : undefined,
        campaign_end_date: data.campaign_end_date ? (data.campaign_end_date as Timestamp).toDate() : undefined,
      } as Venue);
    });
    onUpdate(venues);
  });
}

/**
 * Subscribes to pins for a specific venue, ordered by timestamp (newest first).
 */
export function subscribeToVenuePins(venueId: string, onUpdate: (pins: Pin[]) => void) {
  const q = query(
    collection(db, "pins"),
    where("venueId", "==", venueId),
    orderBy("timestamp", "desc")
  );
  return onSnapshot(q, (snapshot) => {
    const pins: Pin[] = [];
    snapshot.forEach((doc) => {
      const data = doc.data();
      pins.push({
        pinId: doc.id,
        ...data,
        timestamp: (data.timestamp as Timestamp)?.toDate() || new Date()
      } as Pin);
    });
    onUpdate(pins);
  });
}

/**
 * Uploads a profile picture to Storage and returns download URL.
 */
export async function uploadProfileImage(uri: string, userId: string): Promise<string> {
  const response = await fetch(uri);
  const blob = await response.blob();
  const storageRef = ref(storage, `users/${userId}/avatar.jpg`);
  await uploadBytes(storageRef, blob);
  return getDownloadURL(storageRef);
}

/**
 * Uploads a raw photo to Firebase Storage and returns the download URL.
 */
export async function uploadPinImage(uri: string, userId: string): Promise<string> {
  const response = await fetch(uri);
  const blob = await response.blob();
  
  const filename = `${userId}_${Date.now()}.jpg`;
  const storageRef = ref(storage, `pins/${userId}/${filename}`);
  
  await uploadBytes(storageRef, blob);
  return getDownloadURL(storageRef);
}

/**
 * Creates a new Pin (post) linked to a venue.
 * Computes live verification dynamically (distance <= 50m).
 */
export async function createPin(params: {
  userId: string;
  username: string;
  user_profile_pic: string;
  venueId: string;
  venueCoords: { latitude: number; longitude: number };
  imageUri: string;
  textContent: string;
  userCoords: { latitude: number; longitude: number };
  aestheticRating?: number; // Optional user aesthetic rating
  reportType: "aesthetic" | "live_status";
  liveCrowdVote?: "chill" | "moderate" | "packed";
}): Promise<string> {
  const { 
    userId, 
    username, 
    user_profile_pic, 
    venueId, 
    venueCoords, 
    imageUri, 
    textContent, 
    userCoords,
    aestheticRating,
    reportType,
    liveCrowdVote
  } = params;

  // 1. Upload photo
  const imageUrl = await uploadPinImage(imageUri, userId);

  // 2. Determine "Live Reality Check" proximity verification (<= 50 meters)
  const distance = calculateDistance(
    userCoords.latitude,
    userCoords.longitude,
    venueCoords.latitude,
    venueCoords.longitude
  );
  const isLive = distance <= 50;

  // 3. Create document properties
  const geohash = encodeGeohash(userCoords.latitude, userCoords.longitude, 9);
  
  const pinData: any = {
    userId,
    username,
    user_profile_pic,
    venueId,
    image_url: imageUrl,
    text_content: textContent,
    timestamp: serverTimestamp(),
    latitude: userCoords.latitude,
    longitude: userCoords.longitude,
    geohash,
    is_live: isLive,
    is_live_verified: isLive,
    report_type: reportType,
    live_crowd_vote: liveCrowdVote || null
  };

  if (typeof aestheticRating === "number") {
    pinData.user_aesthetic_rating = aestheticRating;
  }

  // 4. Save to Firestore
  const docRef = await addDoc(collection(db, "pins"), pinData);
  return docRef.id;
}

// ==========================================
// INITIAL DATABASE SEED UTILITY
// ==========================================

/**
 * Checks if venues are loaded, and if empty, seeds initial local spot venues.
 */
export async function seedInitialVenues(): Promise<void> {
  const venuesRef = collection(db, "venues");
  const querySnapshot = await getDocs(venuesRef);

  // If already seeded, skip!
  if (querySnapshot.size > 0) return;

  const defaultVenues: Omit<Venue, "venueId">[] = [
    {
      name: "Fika & Co. Minimalist Cafe",
      latitude: 13.736717,
      longitude: 100.560481,
      geohash: encodeGeohash(13.736717, 100.560481, 9),
      category: "café",
      aesthetic_rating: 4.8,
      crowd_status: "Yellow",
      cover_image: "https://images.unsplash.com/photo-1554118811-1e0d58224f24?auto=format&fit=crop&w=600&q=80",
      is_sponsored: true,
      sponsor_tier: 2,
      custom_icon_url: "https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?auto=format&fit=crop&w=150&q=80",
      campaign_start_date: Timestamp.fromDate(new Date(Date.now() - 7 * 24 * 3600 * 1000)),
      campaign_end_date: Timestamp.fromDate(new Date(Date.now() + 30 * 24 * 3600 * 1000))
    },
    {
      name: "Hands and Heart Roastery",
      latitude: 13.738102,
      longitude: 100.558914,
      geohash: encodeGeohash(13.738102, 100.558914, 9),
      category: "café",
      aesthetic_rating: 4.7,
      crowd_status: "Green",
      cover_image: "https://images.unsplash.com/photo-1521017432531-fbd92d768814?auto=format&fit=crop&w=600&q=80"
    },
    {
      name: "The Patchwork Green Garden",
      latitude: 13.735102,
      longitude: 100.562145,
      geohash: encodeGeohash(13.735102, 100.562145, 9),
      category: "tourist_attraction",
      aesthetic_rating: 4.5,
      crowd_status: "Red",
      cover_image: "https://images.unsplash.com/photo-1513836279014-a89f7a76ae86?auto=format&fit=crop&w=600&q=80"
    }
  ];

  console.log("Seeding initial café venues data into Firestore...");
  for (const venue of defaultVenues) {
    await addDoc(venuesRef, venue);
  }
}
