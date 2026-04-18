import { NextFunction, Request, Response } from "express";
import { getFirebaseAuth, getFirebaseFirestore } from "../config/firebase";
import { logger } from "../lib/logger";

const DAILY_LIMIT = parseInt(process.env.DAILY_REQUEST_LIMIT ?? "20", 10);
const MONTHLY_LIMIT = parseInt(process.env.MONTHLY_REQUEST_LIMIT ?? "200", 10);
const GLOBAL_GEOCODING_LIMIT = parseInt(process.env.GLOBAL_GEOCODING_LIMIT ?? "10000", 10);
const FIRESTORE_TIMEOUT_MS = 10_000; // 10 seconds

const getNextMidnightUTC = (): number => {
  const d = new Date();
  d.setUTCHours(24, 0, 0, 0);
  return d.getTime();
};

const getNextMonthStartUTC = (): number => {
  const d = new Date();
  d.setUTCMonth(d.getUTCMonth() + 1, 1);
  d.setUTCHours(0, 0, 0, 0);
  return d.getTime();
};

const withTimeout = <T>(promise: Promise<T>, ms: number, label: string): Promise<T> => {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)),
  ]);
};

interface QuotaResult {
  allowed: boolean;
  dailyRemaining: number;
  monthlyRemaining: number;
  dailyResetTime: number;
  monthlyResetTime: number;
}

const checkQuota = async (uid: string): Promise<QuotaResult> => {
  const db = getFirebaseFirestore();
  const docRef = db.collection("userQuotas").doc(uid);

  const doc = await withTimeout(docRef.get(), FIRESTORE_TIMEOUT_MS, "checkQuota");
  const now = Date.now();

  let dailyCount = 0;
  let dailyResetTime = getNextMidnightUTC();
  let monthlyCount = 0;
  let monthlyResetTime = getNextMonthStartUTC();

  if (doc.exists) {
    const data = doc.data()!;
    dailyCount = now < data.dailyResetTime ? (data.dailyCount as number) : 0;
    dailyResetTime = now < data.dailyResetTime ? (data.dailyResetTime as number) : getNextMidnightUTC();
    monthlyCount = now < data.monthlyResetTime ? (data.monthlyCount as number) : 0;
    monthlyResetTime = now < data.monthlyResetTime ? (data.monthlyResetTime as number) : getNextMonthStartUTC();
  }

  const allowed = dailyCount < DAILY_LIMIT && monthlyCount < MONTHLY_LIMIT;

  return {
    allowed,
    dailyRemaining: Math.max(0, DAILY_LIMIT - dailyCount),
    monthlyRemaining: Math.max(0, MONTHLY_LIMIT - monthlyCount),
    dailyResetTime,
    monthlyResetTime,
  };
};

const checkGlobalQuota = async (): Promise<{ allowed: boolean; remaining: number; resetTime: number }> => {
  const db = getFirebaseFirestore();
  const docRef = db.collection("globalQuotas").doc("geocoding");

  const doc = await withTimeout(docRef.get(), FIRESTORE_TIMEOUT_MS, "checkGlobalQuota");
  const now = Date.now();

  let count = 0;
  let resetTime = getNextMonthStartUTC();

  if (doc.exists) {
    const data = doc.data()!;
    count = now < data.resetTime ? (data.count as number) : 0;
    resetTime = now < data.resetTime ? (data.resetTime as number) : getNextMonthStartUTC();
  }

  const allowed = count < GLOBAL_GEOCODING_LIMIT;
  return { allowed, remaining: Math.max(0, GLOBAL_GEOCODING_LIMIT - count), resetTime };
};

export const incrementQuotas = async (uid: string): Promise<void> => {
  const db = getFirebaseFirestore();
  const userDocRef = db.collection("userQuotas").doc(uid);
  const globalDocRef = db.collection("globalQuotas").doc("geocoding");

  await withTimeout(
    db.runTransaction(async (tx) => {
      const [userDoc, globalDoc] = await Promise.all([tx.get(userDocRef), tx.get(globalDocRef)]);
      const now = Date.now();

      // User quota
      let dailyCount = 0;
      let dailyResetTime = getNextMidnightUTC();
      let monthlyCount = 0;
      let monthlyResetTime = getNextMonthStartUTC();

      if (userDoc.exists) {
        const data = userDoc.data()!;
        dailyCount = now < data.dailyResetTime ? (data.dailyCount as number) : 0;
        dailyResetTime = now < data.dailyResetTime ? (data.dailyResetTime as number) : getNextMidnightUTC();
        monthlyCount = now < data.monthlyResetTime ? (data.monthlyCount as number) : 0;
        monthlyResetTime = now < data.monthlyResetTime ? (data.monthlyResetTime as number) : getNextMonthStartUTC();
      }

      tx.set(userDocRef, {
        dailyCount: dailyCount + 1,
        dailyResetTime,
        monthlyCount: monthlyCount + 1,
        monthlyResetTime,
      });

      // Global quota
      let globalCount = 0;
      let globalResetTime = getNextMonthStartUTC();

      if (globalDoc.exists) {
        const data = globalDoc.data()!;
        globalCount = now < data.resetTime ? (data.count as number) : 0;
        globalResetTime = now < data.resetTime ? (data.resetTime as number) : getNextMonthStartUTC();
      }

      tx.set(globalDocRef, { count: globalCount + 1, resetTime: globalResetTime });
    }),
    FIRESTORE_TIMEOUT_MS,
    "incrementQuotas",
  );
};

export const authMiddleware = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  if (process.env.NODE_ENV === "development" && process.env.SKIP_APP_CHECK === "true") {
    next();
    return;
  }

  const authHeader = req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ success: false, message: "Unauthorized: Missing auth token", error: "AUTH_TOKEN_MISSING" });
    return;
  }

  const idToken = authHeader.slice(7);

  try {
    const decodedToken = await getFirebaseAuth().verifyIdToken(idToken);
    const uid = decodedToken.uid;

    // Check global geocoding limit first (don't consume user quota if global is exhausted)
    const globalQuota = await checkGlobalQuota();
    if (!globalQuota.allowed) {
      const retryAfter = Math.ceil((globalQuota.resetTime - Date.now()) / 1000);
      logger.warn({ uid }, "global_geocoding_limit_exceeded");
      res.status(429).json({
        success: false,
        message: `Global geocoding limit of ${GLOBAL_GEOCODING_LIMIT} requests reached`,
        error: "GLOBAL_RATE_LIMIT_EXCEEDED",
        retryAfter,
      });
      return;
    }

    const quota = await checkQuota(uid);

    if (!quota.allowed) {
      const isMonthly = quota.monthlyRemaining === 0;
      const limit = isMonthly ? MONTHLY_LIMIT : DAILY_LIMIT;
      const retryAfter = Math.ceil(((isMonthly ? quota.monthlyResetTime : quota.dailyResetTime) - Date.now()) / 1000);
      logger.warn({ uid, limitType: isMonthly ? "monthly" : "daily" }, "user_rate_limit_exceeded");
      res.status(429).json({
        success: false,
        message: `${isMonthly ? "Monthly" : "Daily"} limit of ${limit} requests reached`,
        error: "RATE_LIMIT_EXCEEDED",
        retryAfter,
      });
      return;
    }

    req.uid = uid;
    next();
  } catch (error) {
    logger.error({ err: error }, "auth_token_verification_failed");
    res.status(401).json({ success: false, message: "Unauthorized: Invalid auth token", error: "AUTH_TOKEN_INVALID" });
  }
};
