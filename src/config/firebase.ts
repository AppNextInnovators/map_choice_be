import { initializeApp, cert, getApps, App } from "firebase-admin/app";
import { getAppCheck, AppCheck } from "firebase-admin/app-check";

let firebaseApp: App;
let appCheck: AppCheck;

/**
 * Initialize Firebase Admin SDK
 * Uses environment variables for configuration
 */
export const initializeFirebase = (): App => {
  if (getApps().length > 0) {
    firebaseApp = getApps()[0];
    return firebaseApp;
  }

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error(
      "Missing Firebase configuration. Please set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY environment variables.",
    );
  }

  firebaseApp = initializeApp({
    credential: cert({
      projectId,
      clientEmail,
      privateKey,
    }),
  });

  console.log("Firebase Admin SDK initialized successfully");
  return firebaseApp;
};

/**
 * Get Firebase App Check instance
 */
export const getFirebaseAppCheck = (): AppCheck => {
  if (!appCheck) {
    if (getApps().length === 0) {
      initializeFirebase();
    }
    appCheck = getAppCheck();
  }
  return appCheck;
};

export { firebaseApp };
