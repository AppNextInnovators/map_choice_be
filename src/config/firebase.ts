import { initializeApp, cert, getApps, App } from "firebase-admin/app";
import { getAppCheck, AppCheck } from "firebase-admin/app-check";
import { getAuth, Auth } from "firebase-admin/auth";
import { getFirestore, Firestore } from "firebase-admin/firestore";
import { logger } from "../lib/logger";

let firebaseApp: App;
let appCheck: AppCheck;
let authInstance: Auth;

export const initializeFirebase = (): App => {
  if (getApps().length > 0) {
    firebaseApp = getApps()[0];
    return firebaseApp;
  }

  if (!process.env.FIREBASE_PROJECT_ID || !process.env.FIREBASE_CLIENT_EMAIL || !process.env.FIREBASE_PRIVATE_KEY) {
    throw new Error(
      "Missing required Firebase env vars: FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY",
    );
  }

  firebaseApp = initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
    }),
  });
  logger.info("firebase_initialized");

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

export const getFirebaseAuth = (): Auth => {
  if (!authInstance) {
    if (getApps().length === 0) initializeFirebase();
    authInstance = getAuth();
  }
  return authInstance;
};

let firestoreInstance: Firestore;

export const getFirebaseFirestore = (): Firestore => {
  if (!firestoreInstance) {
    if (getApps().length === 0) {
      initializeFirebase();
    }
    firestoreInstance = getFirestore();
  }
  return firestoreInstance;
};

export { firebaseApp };
