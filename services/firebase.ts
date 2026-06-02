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
  deleteDoc,
  runTransaction,
  arrayUnion,
  arrayRemove,
  getCountFromServer,
  updateDoc,
  writeBatch
} from "firebase/firestore";
import { getStorage, ref, uploadBytes, getDownloadURL, uploadString } from "firebase/storage";
import * as FileSystem from 'expo-file-system';
import { 
  // @ts-ignore
  initializeAuth,
  // @ts-ignore
  getReactNativePersistence,
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  User,
  deleteUser
} from "firebase/auth";
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ==========================================
// FIREBASE CLIENT CONFIGURATION
// ==========================================
const firebaseConfig = {
  apiKey: "AIzaSyCVlaNuAkdkojlTH0-ubpuJaWXPylpd6IA",
  authDomain: "pinc-app-d2501.firebaseapp.com",
  projectId: "pinc-app-d2501",
  storageBucket: "pinc-app-d2501.firebasestorage.app",
  messagingSenderId: "929703082491",
  appId: "1:929703082491:web:cb4af54197a7b85f3f5335e",
  measurementId: "G-9FJVD6RCDH"
};

// Initialize Firebase
export const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
export const db = getFirestore(app);
export const auth = initializeAuth(app, {
  persistence: Platform.OS === 'web' ? undefined : getReactNativePersistence(AsyncStorage)
});
export const storage = getStorage(app);

// ==========================================
// INTERFACES & SCHEMAS
// ==========================================
export interface UserProfile {
  userId: string;
  username: string;
  profile_pic: string;
  bio: string;
  role?: "USER" | "ADMIN" | "PREMIUM_STORE";
  created_at: Date;
  socialLinks?: {
    instagramUrl?: string;
    facebookUrl?: string;
    tiktokUrl?: string;
  };
}

export interface Venue {
  venueId: string;
  ownerId?: string;
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
  subscription_status?: 'ACTIVE' | 'GRACE_PERIOD' | 'EXPIRED' | 'NONE';
  currentPeriodEnd?: Date | Timestamp | null;
  gracePeriodEnd?: Date | Timestamp | null;
  cancelAtPeriodEnd?: boolean;
  stripeSubscriptionId?: string;
  images?: string[];
  description?: string;
  socialLinks?: {
    instagramUrl?: string;
    facebookUrl?: string;
    tiktokUrl?: string;
  };
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
  post_type: "standard" | "live_news";
  expiresAt?: Date | null;
  situation_details?: string;
  is_live: boolean;
  is_live_verified: boolean;
  report_type: "aesthetic" | "live_status";
  live_crowd_vote?: "chill" | "moderate" | "packed";
  user_aesthetic_rating?: number; // Optional user aesthetic rating review
  likes?: string[]; // Array of userIds who liked this pin
  media_type?: "image" | "video";
  likesCount?: number;
  commentsCount?: number;
  music_title?: string;
  music_url?: string;
  post_duration?: "permanent" | "24h";
  thumbnail_url?: string;
  socialLinks?: {
    instagramUrl?: string;
    facebookUrl?: string;
    tiktokUrl?: string;
  };
}

export interface Comment {
  commentId?: string;
  pinId: string;
  userId: string;
  username: string;
  user_profile_pic: string;
  text: string;
  timestamp: Date;
}


// ==========================================
// PROMISE TIMEOUT UTILITY
// ==========================================

/**
 * Wraps a promise with a timeout. If the promise does not resolve within the specified timeout,
 * it rejects with a timeout error. Useful for preventing Firestore queries from hanging indefinitely
 * on offline or uninitialized databases.
 */
export function withTimeout<T>(promise: Promise<T>, timeoutMs: number = 3000, errorMsg: string = "Request timed out"): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(errorMsg));
    }, timeoutMs);
    
    promise
      .then((res) => {
        clearTimeout(timer);
        resolve(res);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
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
    } catch (err: any) {
      console.error("Avatar upload failed:", err);
      throw new Error(
        `Failed to upload profile picture. Please verify that your Storage bucket is initialized.\n\nDetail: ${err.message || err}`
      );
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

  await withTimeout(setDoc(doc(db, "users", user.uid), profileData), 5000, "Firestore database write timed out during registration.");

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
 * Fetches user profile from Firestore.
 */
export async function fetchUserProfile(userId: string): Promise<UserProfile | null> {
  const docRef = doc(db, "users", userId);
  const docSnap = await withTimeout(getDoc(docRef), 3000, "Firestore database profile fetch timed out.");
  if (docSnap.exists()) {
    const data = docSnap.data();
    return {
      userId: data.userId || docSnap.id,
      username: data.username,
      bio: data.bio,
      profile_pic: data.profile_pic,
      created_at: (data.created_at as Timestamp)?.toDate() || new Date()
    } as UserProfile;
  }
  return null;
}

/**
 * Updates a user profile in Firestore.
 * Also synchronizes the username across all pins created by this user.
 */
export async function updateUserProfile(userId: string, data: Partial<UserProfile>): Promise<void> {
  const docRef = doc(db, "users", userId);
  await withTimeout(updateDoc(docRef, data), 5000, "Updating profile timed out.");

  // If username is changed, update it in all their pins
  if (data.username) {
    try {
      const pinsQuery = query(collection(db, "pins"), where("userId", "==", userId));
      const pinsSnapshot = await getDocs(pinsQuery);
      
      if (!pinsSnapshot.empty) {
        const batch = writeBatch(db);
        pinsSnapshot.docs.forEach((pinDoc) => {
          batch.update(pinDoc.ref, { username: data.username });
        });
        await batch.commit();
      }
    } catch (err) {
      console.warn("Failed to synchronize username in pins:", err);
    }
  }
}

/**
 * Retrieves the followers and following counts for a user.
 */
export async function getUserStats(userId: string): Promise<{ followersCount: number; followingCount: number }> {
  try {
    const followsColl = collection(db, "follows");
    const [followersSnap, followingSnap] = await Promise.all([
      getCountFromServer(query(followsColl, where("followingId", "==", userId))),
      getCountFromServer(query(followsColl, where("followerId", "==", userId)))
    ]);
    return {
      followersCount: followersSnap.data().count,
      followingCount: followingSnap.data().count
    };
  } catch (err) {
    console.warn("Failed to get user stats:", err);
    return { followersCount: 0, followingCount: 0 };
  }
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
  await withTimeout(deleteDoc(docRef), 3000, "Firestore profile erasure timed out.");

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

export function subscribeToVenues(onUpdate: (venues: Venue[]) => void, onError?: (error: any) => void) {
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
  }, (error) => {
    console.warn("Firestore subscribeToVenues failed:", error);
    if (onError) {
      onError(error);
    }
  });
}

/**
 * Subscribes to pins for a specific venue, ordered by timestamp (newest first).
 */
export function subscribeToVenuePins(venueId: string, onUpdate: (pins: Pin[]) => void, onError?: (error: any) => void) {
  const q = query(
    collection(db, "pins"),
    where("venueId", "==", venueId),
    orderBy("timestamp", "desc")
  );
  return onSnapshot(q, (snapshot) => {
    const pins: Pin[] = [];
    snapshot.forEach((doc) => {
      const data = doc.data();
      const timestamp = (data.timestamp as Timestamp)?.toDate() || new Date();

      // Filter out 24h posts that have expired
      if (data.post_duration === "24h") {
        const diffHours = (new Date().getTime() - timestamp.getTime()) / (1000 * 60 * 60);
        if (diffHours > 24) return;
      }

      pins.push({
        pinId: doc.id,
        ...data,
        timestamp
      } as Pin);
    });
    onUpdate(pins);
  }, (error) => {
    console.warn("Firestore subscribeToVenuePins failed:", error);
    if (onError) {
      onError(error);
    }
  });
}

/**
 * Converts a local URI to a Blob using fetch or XMLHttpRequest as a fallback.
 */
export async function uriToBlob(uri: string): Promise<Blob> {
  try {
    const response = await fetch(uri);
    return await response.blob();
  } catch (err) {
    console.warn("fetch uriToBlob failed, falling back to XMLHttpRequest:", err);
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.onload = function () {
        resolve(xhr.response);
      };
      xhr.onerror = function (e) {
        console.error("XMLHttpRequest uriToBlob failed for uri:", uri, e);
        reject(new TypeError("Network request failed"));
      };
      xhr.responseType = "blob";
      xhr.open("GET", uri, true);
      xhr.send(null);
    });
  }
}

/**
 * Uploads a profile picture to Storage and returns download URL.
 */
export async function uploadProfileImage(uri: string, userId: string): Promise<string> {
  const auth = getAuth();
  const token = await auth.currentUser?.getIdToken();
  const filePath = `users/${userId}/avatar.jpg`;
  
  const url = `https://firebasestorage.googleapis.com/v0/b/pinc-app-d2501.firebasestorage.app/o?name=${encodeURIComponent(filePath)}`;
  
  const uploadResult = await FileSystem.uploadAsync(url, uri, {
    httpMethod: 'POST',
    uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'image/jpeg',
    }
  });

  if (uploadResult.status !== 200) {
    throw new Error(`Profile upload failed: ${uploadResult.body}`);
  }

  const responseObj = JSON.parse(uploadResult.body);
  const downloadToken = responseObj.downloadTokens;
  return `https://firebasestorage.googleapis.com/v0/b/pinc-app-d2501.firebasestorage.app/o/${encodeURIComponent(filePath)}?alt=media&token=${downloadToken}`;
}

/**
 * Uploads a raw media (photo or video) to Firebase Storage and returns the download URL.
 */
export async function uploadPinImage(uri: string, userId: string): Promise<string> {
  const auth = getAuth();
  const token = await auth.currentUser?.getIdToken();
  
  // Determine correct file extension based on URI mimetype/filename
  let fileExt = ".jpg";
  let contentType = "image/jpeg";
  
  if (uri.toLowerCase().endsWith(".mp4") || uri.toLowerCase().endsWith(".mov")) {
    fileExt = ".mp4";
    contentType = "video/mp4";
  } else if (uri.toLowerCase().endsWith(".png")) {
    fileExt = ".png";
    contentType = "image/png";
  } else if (uri.toLowerCase().endsWith(".gif")) {
    fileExt = ".gif";
    contentType = "image/gif";
  } else {
    const cleanUri = uri.split("?")[0];
    const dotIndex = cleanUri.lastIndexOf(".");
    if (dotIndex !== -1 && cleanUri.length - dotIndex <= 6) {
      fileExt = cleanUri.substring(dotIndex);
    }
  }
  
  const filename = `${userId}_${Date.now()}${fileExt}`;
  const filePath = `pins/${userId}/${filename}`;
  
  const url = `https://firebasestorage.googleapis.com/v0/b/pinc-app-d2501.firebasestorage.app/o?name=${encodeURIComponent(filePath)}`;
  
  const uploadResult = await FileSystem.uploadAsync(url, uri, {
    httpMethod: 'POST',
    uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': contentType,
    }
  });

  if (uploadResult.status !== 200) {
    throw new Error(`Media upload failed: ${uploadResult.body}`);
  }

  const responseObj = JSON.parse(uploadResult.body);
  const downloadToken = responseObj.downloadTokens;
  return `https://firebasestorage.googleapis.com/v0/b/pinc-app-d2501.firebasestorage.app/o/${encodeURIComponent(filePath)}?alt=media&token=${downloadToken}`;
}

/**
 * Checks an image against Google Cloud Vision API for safety (Explicit/Violence).
 * Throws an error if the image is flagged.
 */
export async function checkImageSafety(base64Image: string): Promise<void> {
  const API_KEY = "AIzaSyAWu8nAniIvvtBTkpmcilS0l5hl6lEXkmY";
  const url = `https://vision.googleapis.com/v1/images:annotate?key=${API_KEY}`;
  
  const body = {
    requests: [
      {
        image: {
          content: base64Image
        },
        features: [
          {
            type: "SAFE_SEARCH_DETECTION"
          }
        ]
      }
    ]
  };

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    let errMsg = "Failed to reach AI Safety Filter. Please try again.";
    try {
      const errData = await response.json();
      if (errData?.error?.message) {
        errMsg += `\n\nDetail: ${errData.error.message}`;
        if (errData.error.message.toLowerCase().includes("billing")) {
          errMsg += "\n\nTip: Please enable billing on your Google Cloud Console project or check your Vision API billing status.";
        }
      }
    } catch (_) {
      errMsg += ` (HTTP ${response.status}: ${response.statusText})`;
    }
    throw new Error(errMsg);
  }

  const data = await response.json();
  const safeSearch = data.responses?.[0]?.safeSearchAnnotation;
  
  if (safeSearch) {
    const isExplicit = ["LIKELY", "VERY_LIKELY"].includes(safeSearch.adult);
    const isViolent = ["LIKELY", "VERY_LIKELY"].includes(safeSearch.violence);
    const isRacy = ["LIKELY", "VERY_LIKELY"].includes(safeSearch.racy);

    if (isExplicit || isViolent || isRacy) {
      throw new Error("Warning: This image violates our safety guidelines and cannot be posted.");
    }
  }
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
  imageUri?: string | null;
  textContent: string;
  userCoords: { latitude: number; longitude: number };
  aestheticRating?: number; // Optional user aesthetic rating
  reportType: "aesthetic" | "live_status";
  liveCrowdVote?: "chill" | "moderate" | "packed";
  postType?: "standard" | "live_news";
  situationDetails?: string;
  mediaType?: "image" | "video";
  musicTitle?: string;
  musicUrl?: string;
  postDuration?: "permanent" | "24h";
  thumbnailUri?: string | null;
  postDelayMins?: number;
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
    liveCrowdVote,
    postType = "standard",
    situationDetails = "",
    mediaType = "image",
    musicTitle = "",
    musicUrl = "",
    postDuration = "permanent",
    thumbnailUri
  } = params;

  // 1. Upload media to Firebase Storage
  let imageUrl = "";
  if (imageUri) {
    try {
      imageUrl = await uploadPinImage(imageUri, userId);
    } catch (uploadErr: any) {
      console.error("Firebase Storage upload failed:", uploadErr);
      throw new Error(
        `Failed to upload media to Firebase Storage. Please verify that your Storage bucket is initialized in your Firebase Console.\n\nDetail: ${uploadErr.message || uploadErr}`
      );
    }
  }

  // 1.5 Upload thumbnail if provided
  let thumbnailUrl = "";
  if (thumbnailUri) {
    try {
      thumbnailUrl = await uploadPinImage(thumbnailUri, userId);
    } catch (err) {
      console.warn("Failed to upload thumbnail:", err);
    }
  }

  // 2. Determine "Live Reality Check" proximity verification (<= 50 meters)
  const distance = calculateDistance(
    userCoords.latitude,
    userCoords.longitude,
    venueCoords.latitude,
    venueCoords.longitude
  );
  const isLive = distance <= 50;

  // 2.5 Calculate Time-Decay logic (expiresAt)
  let computedExpiresAt: Date | null = null;
  if (postDuration === "24h" || postDuration !== "permanent") {
    const now = new Date();
    if (postType === "standard") {
      computedExpiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24 hours
    } else if (postType === "live_news") {
      computedExpiresAt = new Date(now.getTime() + 6 * 60 * 60 * 1000); // 6 hours
    }
  }

  const finalTimestamp = params.postDelayMins 
    ? Timestamp.fromDate(new Date(Date.now() + params.postDelayMins * 60000))
    : serverTimestamp();

  // 3. Create document properties
  const geohash = encodeGeohash(userCoords.latitude, userCoords.longitude, 9);
  
  const pinData: any = {
    userId,
    username,
    user_profile_pic,
    venueId,
    image_url: imageUrl,
    text_content: textContent,
    timestamp: finalTimestamp,
    latitude: userCoords.latitude,
    longitude: userCoords.longitude,
    geohash,
    post_type: postType,
    post_duration: postDuration,
    situation_details: situationDetails,
    is_live: isLive,
    is_live_verified: isLive,
    report_type: reportType,
    live_crowd_vote: liveCrowdVote || null,
    media_type: mediaType,
    likesCount: 0,
    commentsCount: 0,
    music_title: musicTitle,
    music_url: musicUrl,
    thumbnail_url: thumbnailUrl || null,
    expiresAt: computedExpiresAt
  };

  if (typeof aestheticRating === "number") {
    pinData.user_aesthetic_rating = aestheticRating;
  }

  // 4. Save to Firestore
  const docRef = await withTimeout(addDoc(collection(db, "pins"), pinData), 5000, "Firestore connection timed out while creating pin.");
  return docRef.id;
}

// ==========================================
// SOCIAL FOLLOW SERVICES
// ==========================================

/**
 * Follows a user in Firestore.
 */
export async function followUser(followerId: string, followingId: string): Promise<void> {
  const followDocId = `${followerId}_${followingId}`;
  await withTimeout(
    setDoc(doc(db, "follows", followDocId), {
      followerId,
      followingId,
      timestamp: serverTimestamp()
    }),
    3000,
    "Following user operation timed out."
  );
}

/**
 * Unfollows a user in Firestore.
 */
export async function unfollowUser(followerId: string, followingId: string): Promise<void> {
  const followDocId = `${followerId}_${followingId}`;
  await withTimeout(
    deleteDoc(doc(db, "follows", followDocId)),
    3000,
    "Unfollowing user operation timed out."
  );
}

/**
 * Checks if a follower is actively following a user.
 */
export async function checkIsFollowing(followerId: string, followingId: string): Promise<boolean> {
  const followDocId = `${followerId}_${followingId}`;
  const docSnap = await withTimeout(
    getDoc(doc(db, "follows", followDocId)),
    3000,
    "Checking follow status timed out."
  );
  return docSnap.exists();
}

/**
 * Toggles follow status for a user using the followerId_followingId composite document ID pattern.
 * If following, it unfollows; if not following, it follows.
 * Returns true if now following, false if unfollowed.
 */
export async function toggleFollow(followerId: string, followingId: string): Promise<boolean> {
  const isFollowing = await checkIsFollowing(followerId, followingId);
  if (isFollowing) {
    await unfollowUser(followerId, followingId);
    return false;
  } else {
    await followUser(followerId, followingId);
    return true;
  }
}

/**
 * Retrieves the profiles list of users followerId is following.
 */
export async function getFollowingList(followerId: string): Promise<UserProfile[]> {
  const q = query(collection(db, "follows"), where("followerId", "==", followerId));
  const querySnapshot = await withTimeout(getDocs(q), 3000, "Fetching following IDs list timed out.");
  const followingIds: string[] = [];
  querySnapshot.forEach((doc) => {
    followingIds.push(doc.data().followingId);
  });
  
  if (followingIds.length === 0) return [];
  
  // Fetch profiles in parallel
  const fetchPromises = followingIds.map(id => fetchUserProfile(id));
  const fetchedProfiles = await Promise.all(fetchPromises);
  return fetchedProfiles.filter((p): p is UserProfile => p !== null);
}

/**
 * Retrieves the profiles list of users who follow the given user.
 */
export async function getFollowersList(userId: string): Promise<UserProfile[]> {
  const q = query(collection(db, "follows"), where("followingId", "==", userId));
  const querySnapshot = await withTimeout(getDocs(q), 3000, "Fetching followers IDs list timed out.");
  const followerIds: string[] = [];
  querySnapshot.forEach((doc) => {
    followerIds.push(doc.data().followerId);
  });
  
  if (followerIds.length === 0) return [];
  
  // Fetch profiles in parallel
  const fetchPromises = followerIds.map(id => fetchUserProfile(id));
  const fetchedProfiles = await Promise.all(fetchPromises);
  return fetchedProfiles.filter((p): p is UserProfile => p !== null);
}

/**
 * Subscribes to the list of user IDs that followerId is following in real-time.
 */
export function subscribeToFollowingIds(followerId: string, onUpdate: (ids: string[]) => void, onError?: (error: any) => void) {
  const q = query(collection(db, "follows"), where("followerId", "==", followerId));
  return onSnapshot(q, (snapshot) => {
    const followingIds: string[] = [];
    snapshot.forEach((doc) => {
      followingIds.push(doc.data().followingId);
    });
    onUpdate(followingIds);
  }, (error) => {
    console.warn("Firestore subscribeToFollowingIds failed:", error);
    if (onError) onError(error);
  });
}

/**
 * Subscribes to the chronological pins posted by a specific user.
 */
export function subscribeToUserPins(userId: string, onUpdate: (pins: Pin[]) => void, onError?: (error: any) => void) {
  const q = query(
    collection(db, "pins"),
    where("userId", "==", userId),
    orderBy("timestamp", "desc")
  );
  return onSnapshot(q, (snapshot) => {
    const pins: Pin[] = [];
    snapshot.forEach((doc) => {
      const data = doc.data();
      const timestamp = (data.timestamp as Timestamp)?.toDate() || new Date();

      // Filter out 24h posts that have expired
      if (data.post_duration === "24h") {
        const diffHours = (new Date().getTime() - timestamp.getTime()) / (1000 * 60 * 60);
        if (diffHours > 24) return;
      }

      pins.push({
        pinId: doc.id,
        ...data,
        timestamp
      } as Pin);
    });
    onUpdate(pins);
  }, (error) => {
    console.warn("Firestore subscribeToUserPins failed:", error);
    if (onError) onError(error);
  });
}

/**
 * Subscribes to all pins in the database in real-time, ordered by timestamp desc.
 */
export function subscribeToAllPins(onUpdate: (pins: Pin[]) => void, onError?: (error: any) => void) {
  const q = query(
    collection(db, "pins"),
    orderBy("timestamp", "desc")
  );
  return onSnapshot(q, (snapshot) => {
    const pins: Pin[] = [];
    snapshot.forEach((doc) => {
      const data = doc.data();
      const timestamp = (data.timestamp as Timestamp)?.toDate() || new Date();

      // Filter out 24h posts that have expired
      if (data.post_duration === "24h") {
        const diffHours = (new Date().getTime() - timestamp.getTime()) / (1000 * 60 * 60);
        if (diffHours > 24) return;
      }

      pins.push({
        pinId: doc.id,
        ...data,
        timestamp
      } as Pin);
    });
    onUpdate(pins);
  }, (error) => {
    console.warn("Firestore subscribeToAllPins failed:", error);
    if (onError) onError(error);
  });
}

/**
 * Toggles like status for a pin. Stores likes inside the pin document's 'likes' array field.
 * Returns true if the pin is now liked by the user, false if unliked.
 */
export async function deletePin(pinId: string) {
  try {
    const docRef = doc(db, "pins", pinId);
    await deleteDoc(docRef);
  } catch (error) {
    console.error(`Firestore deletePin failed for pin ${pinId}:`, error);
    throw error;
  }
}

export async function toggleLikePin(pinId: string, userId: string): Promise<boolean> {
  const pinRef = doc(db, "pins", pinId);
  let isLikedNow = false;

  await withTimeout(
    runTransaction(db, async (transaction) => {
      const pinDoc = await transaction.get(pinRef);
      if (!pinDoc.exists()) {
        throw new Error("Pin does not exist");
      }

      const likesArray = pinDoc.data().likes || [];
      if (likesArray.includes(userId)) {
        transaction.update(pinRef, {
          likes: arrayRemove(userId)
        });
        isLikedNow = false;
      } else {
        transaction.update(pinRef, {
          likes: arrayUnion(userId)
        });
        isLikedNow = true;
      }
    }),
    5000,
    "Toggling like operation timed out."
  );

  return isLikedNow;
}

/**
 * Adds a new comment document to the sub-collection 'comments' under the target pin.
 * Returns the comment's new document ID.
 */
export async function addComment(pinId: string, comment: Omit<Comment, "commentId" | "timestamp">): Promise<string> {
  const commentsCollectionRef = collection(db, "pins", pinId, "comments");
  const docRef = await withTimeout(
    addDoc(commentsCollectionRef, {
      ...comment,
      timestamp: serverTimestamp()
    }),
    5000,
    "Adding comment operation timed out."
  );
  return docRef.id;
}

/**
 * Subscribes to the comments of a specific pin in ascending chronological order.
 */
export function subscribeToComments(pinId: string, onUpdate: (comments: Comment[]) => void, onError?: (error: any) => void) {
  const q = query(
    collection(db, "pins", pinId, "comments"),
    orderBy("timestamp", "asc")
  );
  return onSnapshot(q, (snapshot) => {
    const comments: Comment[] = [];
    snapshot.forEach((docSnap) => {
      const data = docSnap.data();
      comments.push({
        commentId: docSnap.id,
        pinId: data.pinId || pinId,
        userId: data.userId,
        username: data.username,
        user_profile_pic: data.user_profile_pic,
        text: data.text,
        timestamp: (data.timestamp as Timestamp)?.toDate() || new Date()
      } as Comment);
    });
    onUpdate(comments);
  }, (error) => {
    console.warn(`Firestore subscribeToComments for pin ${pinId} failed:`, error);
    if (onError) onError(error);
  });
}

// ==========================================
// INITIAL DATABASE SEED UTILITY
// ==========================================

/**
 * Checks if venues are loaded, and if empty, seeds initial local spot venues.
 */
export async function seedInitialVenues(): Promise<void> {
  const venuesRef = collection(db, "venues");
  const querySnapshot = await withTimeout(getDocs(venuesRef), 3000, "Firestore database seeding check timed out.");

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

// ==========================================
// STORE SUBSCRIPTION QUERIES
// ==========================================

/**
 * Fetches active sponsored venues.
 * This filters out venues that have expired their subscription.
 * Venues must be either ACTIVE or in GRACE_PERIOD.
 */
export async function getActiveSponsoredVenues(): Promise<Venue[]> {
  const venuesRef = collection(db, 'venues');
  
  // Query all sponsored venues
  const q = query(venuesRef, where('is_sponsored', '==', true));
  
  const snapshot = await withTimeout(getDocs(q), 5000, "Firestore fetch sponsored venues timeout.");
  const activeVenues: Venue[] = [];

  snapshot.forEach((doc) => {
    const data = doc.data() as Venue;
    const status = data.subscription_status;
    
    // Default to active if status is not strictly defined yet (legacy support)
    // Otherwise check if it's ACTIVE or GRACE_PERIOD
    if (!status || status === 'ACTIVE' || status === 'GRACE_PERIOD') {
      activeVenues.push({ ...data, venueId: doc.id });
    }
  });

  return activeVenues;
}


// ==========================================
// CHAT & DIRECT MESSAGES LOGIC
// ==========================================

export interface ChatMessage {
  id: string;
  senderId: string;
  text: string;
  timestamp: number;
}

export function getChatId(userId1: string, userId2: string): string {
  return userId1 < userId2 ? `${userId1}_${userId2}` : `${userId2}_${userId1}`;
}

export async function sendMessage(chatId: string, senderId: string, text: string) {
  const messagesRef = collection(db, "chats", chatId, "messages");
  await addDoc(messagesRef, {
    senderId,
    text,
    timestamp: Date.now()
  });
}

export function subscribeToMessages(chatId: string, onUpdate: (messages: ChatMessage[]) => void) {
  const q = query(collection(db, "chats", chatId, "messages"), orderBy("timestamp", "asc"));
  return onSnapshot(q, (snapshot) => {
    const messages: ChatMessage[] = [];
    snapshot.forEach(doc => {
      messages.push({ id: doc.id, ...doc.data() } as ChatMessage);
    });
    onUpdate(messages);
  });
}
