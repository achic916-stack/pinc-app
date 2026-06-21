// Script to find user email by username from Firestore
const { initializeApp, cert } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore } = require('firebase-admin/firestore');

// Use the service account from the project
const serviceAccount = require('../google-services.json');

const app = initializeApp({
  credential: cert({
    projectId: serviceAccount.project_info.project_id,
    // Try using the project ID to use Application Default Credentials
  }),
  projectId: serviceAccount.project_info.project_id,
});

const db = getFirestore(app);
const auth = getAuth(app);

async function findUserByUsername(username) {
  try {
    // Search in Firestore users collection
    const usersRef = db.collection('users');
    const snapshot = await usersRef.where('username', '==', username).get();

    if (snapshot.empty) {
      console.log(`No user found with username: ${username}`);
      return;
    }

    for (const doc of snapshot.docs) {
      const userData = doc.data();
      const uid = doc.id;
      console.log(`\n=== User Found ===`);
      console.log(`UID: ${uid}`);
      console.log(`Username: ${userData.username}`);
      console.log(`Display Name: ${userData.displayName || userData.name || 'N/A'}`);

      // Get auth record to find email
      try {
        const userRecord = await auth.getUser(uid);
        console.log(`Email: ${userRecord.email || 'N/A'}`);
        console.log(`Phone: ${userRecord.phoneNumber || 'N/A'}`);
        console.log(`Provider: ${userRecord.providerData.map(p => p.providerId).join(', ')}`);
        console.log(`Created: ${userRecord.metadata.creationTime}`);
        console.log(`\nNote: Passwords are hashed and cannot be retrieved from Firebase.`);
        console.log(`You can reset the password via: https://console.firebase.google.com/project/${serviceAccount.project_info.project_id}/authentication/users`);
      } catch (authErr) {
        console.log(`Auth record error: ${authErr.message}`);
      }
    }
  } catch (err) {
    console.error('Error:', err.message);
  }
  process.exit(0);
}

findUserByUsername('Makhwaenv');
