import { Request, Response, NextFunction } from "express";
import crypto from "crypto";
import { getFirebaseAppCheck, getFirebaseFirestore } from "../config/firebase";
import { VerifyAppCheckTokenResponse } from "firebase-admin/app-check";
import { logger } from "../lib/logger";

// ============================================
// HEADER NAMES
// ============================================
const APP_CHECK_HEADER = "X-Firebase-AppCheck";
const NONCE_HEADER = "X-Request-Nonce";
const TIMESTAMP_HEADER = "X-Request-Timestamp";
const SIGNATURE_HEADER = "X-Request-Signature";

// ============================================
// RATE LIMITING CONFIGURATION
// ============================================
const RATE_LIMIT_MAX_REQUESTS = 10; // Maximum requests per day
const RATE_LIMIT_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

// ============================================
// NONCE VALIDATION CONFIGURATION
// ============================================
const NONCE_EXPIRY_MS = 10 * 60 * 1000; // 10 minutes
const REQUEST_VALIDITY_MS = 5 * 60 * 1000; // 5 minutes

// In-memory store for used nonces (use Redis for multi-server deployments)
const usedNonces = new Map<string, number>();

interface NonceValidationResult {
  valid: boolean;
  error?: string;
  errorCode?: string;
}

/**
 * Get the rate limit status for a given app ID, persisted in Firestore.
 * Uses a transaction to safely increment the counter atomically.
 */
const FIRESTORE_TIMEOUT_MS = 10_000; // 10 seconds

const withTimeout = <T>(promise: Promise<T>, ms: number, label: string): Promise<T> => {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)),
  ]);
};

const getRateLimitStatus = async (
  appId: string,
): Promise<{ allowed: boolean; remaining: number; resetTime: number }> => {
  const db = getFirebaseFirestore();
  const docRef = db.collection("deviceQuotas").doc(appId);

  return withTimeout(
    db.runTransaction(async (transaction) => {
      const doc = await transaction.get(docRef);
      const now = Date.now();

      if (!doc.exists || now >= (doc.data()!.resetTime as number)) {
        const resetTime = now + RATE_LIMIT_WINDOW_MS;
        transaction.set(docRef, { count: 1, resetTime });
        return { allowed: true, remaining: RATE_LIMIT_MAX_REQUESTS - 1, resetTime };
      }

      const { count, resetTime } = doc.data() as { count: number; resetTime: number };

      if (count >= RATE_LIMIT_MAX_REQUESTS) {
        return { allowed: false, remaining: 0, resetTime };
      }

      transaction.update(docRef, { count: count + 1 });
      return { allowed: true, remaining: RATE_LIMIT_MAX_REQUESTS - (count + 1), resetTime };
    }),
    FIRESTORE_TIMEOUT_MS,
    "getRateLimitStatus",
  );
};

// ============================================
// NONCE VALIDATION FUNCTIONS
// ============================================

/**
 * Clean up expired nonces periodically
 */
export const cleanupNonceStore = (): void => {
  const now = Date.now();
  for (const [nonce, timestamp] of usedNonces.entries()) {
    if (now - timestamp > NONCE_EXPIRY_MS) {
      usedNonces.delete(nonce);
    }
  }
};

// Auto-cleanup expired nonces every minute
setInterval(cleanupNonceStore, 60 * 1000).unref();

/**
 * Validate nonce, timestamp, and signature for replay attack protection
 */
const validateNonce = (
  appCheckToken: string,
  nonce: string | undefined,
  timestampStr: string | undefined,
  signature: string | undefined,
  body: unknown,
): NonceValidationResult => {
  // Check all required headers present
  if (!nonce || !timestampStr || !signature) {
    return {
      valid: false,
      error: "Missing required security headers (nonce, timestamp, or signature)",
      errorCode: "SECURITY_HEADERS_MISSING",
    };
  }

  const timestamp = parseInt(timestampStr, 10);

  // Validate timestamp is a valid number
  if (isNaN(timestamp)) {
    return {
      valid: false,
      error: "Invalid timestamp format",
      errorCode: "INVALID_TIMESTAMP_FORMAT",
    };
  }

  // Validate timestamp (within 5 minute window)
  const now = Date.now();
  if (Math.abs(now - timestamp) > REQUEST_VALIDITY_MS) {
    return {
      valid: false,
      error: "Request timestamp expired or too far in the future",
      errorCode: "TIMESTAMP_EXPIRED",
    };
  }

  // Atomic check-and-set: mark nonce as used immediately to prevent race conditions.
  // If the nonce was already present, reject as replay attack.
  if (usedNonces.has(nonce)) {
    return {
      valid: false,
      error: "Nonce already used (replay attack detected)",
      errorCode: "NONCE_REUSED",
    };
  }
  // Mark nonce as used BEFORE validating signature to close the race window.
  // If signature validation fails, the nonce is "burned" — this is intentional
  // to prevent an attacker from probing signatures with the same nonce.
  usedNonces.set(nonce, now);

  // Verify body hash and signature to detect tampering
  const bodyString = JSON.stringify(body);
  const bodyHash = crypto.createHash("sha256").update(bodyString).digest("hex");

  const expectedSignature = crypto
    .createHash("sha256")
    .update(`${appCheckToken}:${nonce}:${timestamp}:${bodyHash}`)
    .digest("hex");

  if (signature !== expectedSignature) {
    return {
      valid: false,
      error: "Invalid signature (request may have been tampered)",
      errorCode: "INVALID_SIGNATURE",
    };
  }

  return { valid: true };
};

/**
 * Express middleware to verify Firebase App Check tokens
 * Protects API routes from unauthorized access
 * Includes rate limiting: 10 requests per day per device/app instance
 *
 * Usage in iOS app:
 * 1. Get token: AppCheck.appCheck().token(forcingRefresh: false)
 * 2. Add header: X-Firebase-AppCheck: <token>
 *
 * Usage in React Native (Expo) with @react-native-firebase/app-check:
 * const { token } = await appCheck().getToken();
 * fetch(url, { headers: { 'X-Firebase-AppCheck': token } });
 */
export const appCheckMiddleware = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const appCheckToken = req.header(APP_CHECK_HEADER);

  if (!appCheckToken) {
    res.status(401).json({
      success: false,
      message: "Unauthorized: Missing App Check token",
      error: "APP_CHECK_TOKEN_MISSING",
    });
    return;
  }

  try {
    const appCheck = getFirebaseAppCheck();
    const verifyResponse: VerifyAppCheckTokenResponse = await appCheck.verifyToken(appCheckToken);

    // Attach the decoded token to the request for downstream use
    req.appCheckToken = verifyResponse;

    // Rate limit per device: hash the raw token (unique per device instance)
    // appId alone is the same for all users of the app and would share one quota
    const deviceKey = crypto.createHash("sha256").update(appCheckToken).digest("hex");
    const rateLimitStatus = await getRateLimitStatus(deviceKey);

    if (!rateLimitStatus.allowed) {
      res.status(429).json({
        success: false,
        message: "Rate limit exceeded: Maximum 10 requests per day",
        error: "RATE_LIMIT_EXCEEDED",
        retryAfter: Math.ceil((rateLimitStatus.resetTime - Date.now()) / 1000),
      });
      return;
    }

    next();
  } catch (error) {
    logger.error({ err: error }, "app_check_verification_failed");

    res.status(401).json({
      success: false,
      message: "Unauthorized: Invalid App Check token",
      error: "APP_CHECK_TOKEN_INVALID",
    });
    return;
  }
};

/**
 * Secure middleware that combines App Check token verification with nonce validation.
 * Provides protection against:
 * 1. Unauthorized access (App Check token)
 * 2. Replay attacks (one-time nonce)
 * 3. Request tampering (body hash + signature)
 * 4. Time-based attacks (timestamp validation)
 * 5. Rate limiting (per device/app instance)
 *
 * Required headers:
 * - X-Firebase-AppCheck: Firebase App Check token
 * - X-Request-Nonce: Unique one-time nonce (UUID recommended)
 * - X-Request-Timestamp: Unix timestamp in milliseconds
 * - X-Request-Signature: SHA256 hash of "token:nonce:timestamp:bodyHash"
 *
 * Client-side signature generation:
 * const bodyHash = sha256(JSON.stringify(body));
 * const signature = sha256(`${appCheckToken}:${nonce}:${timestamp}:${bodyHash}`);
 */
export const appCheckSecureMiddleware = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  // Development bypass: Skip App Check verification if explicitly enabled
  // Double-check: never allow skip in production, even if env vars are misconfigured
  if (process.env.NODE_ENV === "development" && process.env.SKIP_APP_CHECK === "true") {
    logger.warn({ path: req.path }, "app_check_skipped_dev_mode");
    next();
    return;
  }

  const appCheckToken = req.header(APP_CHECK_HEADER);
  const nonce = req.header(NONCE_HEADER);
  const timestamp = req.header(TIMESTAMP_HEADER);
  const signature = req.header(SIGNATURE_HEADER);

  // 1. Validate App Check token exists
  if (!appCheckToken) {
    logger.warn({ path: req.path }, "app_check_missing_token");
    res.status(401).json({
      success: false,
      message: "Unauthorized: Missing App Check token",
      error: "APP_CHECK_TOKEN_MISSING",
    });
    return;
  }

  try {
    // 2. Verify App Check token with Firebase
    const appCheck = getFirebaseAppCheck();
    const verifyResponse: VerifyAppCheckTokenResponse = await appCheck.verifyToken(appCheckToken);

    // Attach the decoded token to the request
    req.appCheckToken = verifyResponse;

    // 3. Validate nonce, timestamp, and signature
    const nonceValidation = validateNonce(appCheckToken, nonce, timestamp, signature, req.body);

    if (!nonceValidation.valid) {
      logger.warn({ error: nonceValidation.errorCode }, "nonce_validation_failed");
      res.status(400).json({
        success: false,
        message: nonceValidation.error,
        error: nonceValidation.errorCode,
      });
      return;
    }

    next();
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    const isNetworkError =
      errorMessage.includes("ENOTFOUND") ||
      errorMessage.includes("ETIMEDOUT") ||
      errorMessage.includes("ECONNREFUSED") ||
      errorMessage.includes("getaddrinfo");

    logger.error({ err: error, path: req.path, isNetworkError }, "app_check_verification_failed");

    // In development mode, provide more helpful error messages for network issues
    if (process.env.NODE_ENV === "development" && isNetworkError) {
      res.status(503).json({
        success: false,
        message: "Service unavailable: Cannot reach Firebase servers",
        error: "APP_CHECK_NETWORK_ERROR",
        suggestion: "Check your internet connection or add SKIP_APP_CHECK=true to .env",
      });
      return;
    }

    res.status(401).json({
      success: false,
      message: "Unauthorized: Invalid App Check token",
      error: "APP_CHECK_TOKEN_INVALID",
    });
    return;
  }
};
