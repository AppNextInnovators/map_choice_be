import { Request, Response, NextFunction } from "express";
import { getFirebaseAppCheck } from "../config/firebase";
import { VerifyAppCheckTokenResponse } from "firebase-admin/app-check";

// Header name for App Check token (Firebase convention)
const APP_CHECK_HEADER = "X-Firebase-AppCheck";

// Rate limiting configuration
const RATE_LIMIT_MAX_REQUESTS = 1; // Maximum requests per day
const RATE_LIMIT_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

// In-memory store for rate limiting (use Redis for multi-server deployments)
interface RateLimitEntry {
  count: number;
  resetTime: number;
}
const rateLimitStore = new Map<string, RateLimitEntry>();

/**
 * Get the rate limit status for a given app ID
 */
const getRateLimitStatus = (appId: string): { allowed: boolean; remaining: number; resetTime: number } => {
  const now = Date.now();
  const entry = rateLimitStore.get(appId);

  // If no entry or window has expired, create/reset entry
  if (!entry || now >= entry.resetTime) {
    const resetTime = now + RATE_LIMIT_WINDOW_MS;
    rateLimitStore.set(appId, { count: 1, resetTime });
    return { allowed: true, remaining: RATE_LIMIT_MAX_REQUESTS - 1, resetTime };
  }

  // Check if limit exceeded
  if (entry.count >= RATE_LIMIT_MAX_REQUESTS) {
    return { allowed: false, remaining: 0, resetTime: entry.resetTime };
  }

  // Increment count
  entry.count += 1;
  rateLimitStore.set(appId, entry);
  return { allowed: true, remaining: RATE_LIMIT_MAX_REQUESTS - entry.count, resetTime: entry.resetTime };
};

/**
 * Clean up expired entries periodically (call this on a schedule in production)
 */
export const cleanupRateLimitStore = (): void => {
  const now = Date.now();
  for (const [appId, entry] of rateLimitStore.entries()) {
    if (now >= entry.resetTime) {
      rateLimitStore.delete(appId);
    }
  }
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

    // Apply rate limiting based on app ID
    const appId = verifyResponse.appId;
    const rateLimitStatus = getRateLimitStatus(appId);

    // Set rate limit headers for client visibility
    res.setHeader("X-RateLimit-Limit", RATE_LIMIT_MAX_REQUESTS);
    res.setHeader("X-RateLimit-Remaining", rateLimitStatus.remaining);
    res.setHeader("X-RateLimit-Reset", Math.ceil(rateLimitStatus.resetTime / 1000));

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
    console.error("App Check verification failed:", error);

    res.status(401).json({
      success: false,
      message: "Unauthorized: Invalid App Check token",
      error: "APP_CHECK_TOKEN_INVALID",
    });
    return;
  }
};

/**
 * Optional middleware that allows requests without App Check tokens
 * but still validates and attaches token data if present.
 * Rate limiting is applied only when a valid token is present.
 * Useful for gradual rollout or debugging.
 */
export const appCheckMiddlewareOptional = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const appCheckToken = req.header(APP_CHECK_HEADER);

  if (!appCheckToken) {
    // Allow request to proceed without token
    next();
    return;
  }

  try {
    const appCheck = getFirebaseAppCheck();
    const verifyResponse: VerifyAppCheckTokenResponse = await appCheck.verifyToken(appCheckToken);

    req.appCheckToken = verifyResponse;

    // Apply rate limiting based on app ID
    const appId = verifyResponse.appId;
    const rateLimitStatus = getRateLimitStatus(appId);

    // Set rate limit headers for client visibility
    res.setHeader("X-RateLimit-Limit", RATE_LIMIT_MAX_REQUESTS);
    res.setHeader("X-RateLimit-Remaining", rateLimitStatus.remaining);
    res.setHeader("X-RateLimit-Reset", Math.ceil(rateLimitStatus.resetTime / 1000));

    if (!rateLimitStatus.allowed) {
      res.status(429).json({
        success: false,
        message: "Rate limit exceeded: Maximum 10 requests per day",
        error: "RATE_LIMIT_EXCEEDED",
        retryAfter: Math.ceil((rateLimitStatus.resetTime - Date.now()) / 1000),
      });
      return;
    }
  } catch (error) {
    console.warn("App Check verification failed (optional mode):", error);
    // In optional mode, we log but don't block the request
  }

  next();
};
