/* eslint-disable @typescript-eslint/no-explicit-any */
import crypto from "crypto";
import { Request, Response, NextFunction } from "express";

// Mock Firebase before importing the middleware so module-level calls are intercepted
jest.mock("../../config/firebase", () => ({
  getFirebaseAppCheck: jest.fn(),
  getFirebaseFirestore: jest.fn(),
}));

// Silence pino logger output during tests
jest.mock("../../lib/logger", () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

import { appCheckMiddleware, appCheckSecureMiddleware, cleanupNonceStore } from "../../middleware/appCheckMiddleware";
import { getFirebaseAppCheck, getFirebaseFirestore } from "../../config/firebase";

// ─── Helpers ────────────────────────────────────────────────────────────────

const makeReq = (overrides: Partial<Request> = {}): Partial<Request> => ({
  body: {},
  header: jest.fn(),
  ...overrides,
});

const makeRes = (): Partial<Response> => ({
  status: jest.fn().mockReturnThis(),
  json: jest.fn().mockReturnThis(),
  setHeader: jest.fn(),
});

const makeNext = (): NextFunction => jest.fn();

/** Computes the same signature the client would send. */
const buildSignature = (token: string, nonce: string, timestamp: number, body: unknown): string => {
  const bodyHash = crypto.createHash("sha256").update(JSON.stringify(body)).digest("hex");
  return crypto.createHash("sha256").update(`${token}:${nonce}:${timestamp}:${bodyHash}`).digest("hex");
};

/** Counter so every test gets a fresh nonce that hasn't been seen by the module. */
let nonceCounter = 0;
const freshNonce = () => `test-nonce-${Date.now()}-${++nonceCounter}`;

// ─── Firestore mock factory ──────────────────────────────────────────────────

const buildFirestoreMock = (docData: { exists: boolean; data?: () => object }) => {
  const mockTransaction = {
    get: jest.fn().mockResolvedValue(docData),
    set: jest.fn(),
    update: jest.fn(),
  };
  return {
    firestore: {
      collection: jest.fn().mockReturnThis(),
      doc: jest.fn().mockReturnThis(),
      runTransaction: jest.fn().mockImplementation(async (fn: any) => fn(mockTransaction)),
    },
    transaction: mockTransaction,
  };
};

// ─── appCheckMiddleware ──────────────────────────────────────────────────────

describe("appCheckMiddleware", () => {
  const mockVerifyToken = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, "error").mockImplementation(() => {});
    jest.spyOn(console, "log").mockImplementation(() => {});
    (getFirebaseAppCheck as jest.Mock).mockReturnValue({ verifyToken: mockVerifyToken });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("should return 401 when the App Check header is missing", async () => {
    const req = makeReq({ header: jest.fn().mockReturnValue(undefined) });
    const res = makeRes();
    await appCheckMiddleware(req as Request, res as Response, makeNext());
    expect(res.status).toHaveBeenCalledWith(401);
    expect((res.json as jest.Mock).mock.calls[0][0].error).toBe("APP_CHECK_TOKEN_MISSING");
  });

  it("should return 401 when token verification fails", async () => {
    const req = makeReq({ header: jest.fn().mockReturnValue("bad-token") });
    const res = makeRes();
    mockVerifyToken.mockRejectedValue(new Error("invalid token"));
    await appCheckMiddleware(req as Request, res as Response, makeNext());
    expect(res.status).toHaveBeenCalledWith(401);
    expect((res.json as jest.Mock).mock.calls[0][0].error).toBe("APP_CHECK_TOKEN_INVALID");
  });

  it("should return 429 when the device rate limit is exceeded", async () => {
    const appId = "device-rate-limited";
    mockVerifyToken.mockResolvedValue({ appId });

    // Firestore says count is already at the max (10)
    const { firestore } = buildFirestoreMock({
      exists: true,
      data: () => ({ count: 10, resetTime: Date.now() + 60000 }),
    });
    (getFirebaseFirestore as jest.Mock).mockReturnValue(firestore);

    const req = makeReq({ header: jest.fn().mockReturnValue("valid-token") });
    const res = makeRes();
    await appCheckMiddleware(req as Request, res as Response, makeNext());
    expect(res.status).toHaveBeenCalledWith(429);
    expect((res.json as jest.Mock).mock.calls[0][0].error).toBe("RATE_LIMIT_EXCEEDED");
  });

  it("should call next() on a valid token with quota remaining", async () => {
    const appId = "device-ok";
    mockVerifyToken.mockResolvedValue({ appId });

    // Firestore says no existing document → fresh device
    const { firestore } = buildFirestoreMock({ exists: false });
    (getFirebaseFirestore as jest.Mock).mockReturnValue(firestore);

    const req = makeReq({ header: jest.fn().mockReturnValue("valid-token") });
    const res = makeRes();
    const next = makeNext();
    await appCheckMiddleware(req as Request, res as Response, next);

    expect(next).toHaveBeenCalled();
  });
});

// ─── appCheckSecureMiddleware ────────────────────────────────────────────────

describe("appCheckSecureMiddleware", () => {
  const mockVerifyToken = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, "error").mockImplementation(() => {});
    jest.spyOn(console, "log").mockImplementation(() => {});
    (getFirebaseAppCheck as jest.Mock).mockReturnValue({ verifyToken: mockVerifyToken });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  const makeSecureReq = (
    token: string | undefined,
    nonce: string | undefined,
    timestamp: string | undefined,
    signature: string | undefined,
    body: object = {},
  ): Partial<Request> => ({
    body,
    header: jest.fn((name: string) => {
      const map: Record<string, string | undefined> = {
        "X-Firebase-AppCheck": token,
        "X-Request-Nonce": nonce,
        "X-Request-Timestamp": timestamp,
        "X-Request-Signature": signature,
      };
      return map[name];
    }) as unknown as Request["header"],
  });

  it("should return 401 when the App Check header is missing", async () => {
    const req = makeSecureReq(undefined, "nonce", String(Date.now()), "sig");
    const res = makeRes();
    await appCheckSecureMiddleware(req as Request, res as Response, makeNext());
    expect(res.status).toHaveBeenCalledWith(401);
    expect((res.json as jest.Mock).mock.calls[0][0].error).toBe("APP_CHECK_TOKEN_MISSING");
  });

  it("should return 401 when token verification fails", async () => {
    mockVerifyToken.mockRejectedValue(new Error("bad token"));
    const req = makeSecureReq("bad-token", "nonce", String(Date.now()), "sig");
    const res = makeRes();
    await appCheckSecureMiddleware(req as Request, res as Response, makeNext());
    expect(res.status).toHaveBeenCalledWith(401);
    expect((res.json as jest.Mock).mock.calls[0][0].error).toBe("APP_CHECK_TOKEN_INVALID");
  });

  it("should return 400 when security headers are missing", async () => {
    mockVerifyToken.mockResolvedValue({ appId: "dev-1" });
    const req = makeSecureReq("valid-token", undefined, undefined, undefined);
    const res = makeRes();
    await appCheckSecureMiddleware(req as Request, res as Response, makeNext());
    expect(res.status).toHaveBeenCalledWith(400);
    expect((res.json as jest.Mock).mock.calls[0][0].error).toBe("SECURITY_HEADERS_MISSING");
  });

  it("should return 400 when the timestamp is not a valid number", async () => {
    mockVerifyToken.mockResolvedValue({ appId: "dev-2" });
    const req = makeSecureReq("valid-token", freshNonce(), "not-a-number", "sig");
    const res = makeRes();
    await appCheckSecureMiddleware(req as Request, res as Response, makeNext());
    expect(res.status).toHaveBeenCalledWith(400);
    expect((res.json as jest.Mock).mock.calls[0][0].error).toBe("INVALID_TIMESTAMP_FORMAT");
  });

  it("should return 400 when the timestamp is older than 5 minutes", async () => {
    mockVerifyToken.mockResolvedValue({ appId: "dev-3" });
    const staleTimestamp = Date.now() - 6 * 60 * 1000; // 6 minutes ago
    const req = makeSecureReq("valid-token", freshNonce(), String(staleTimestamp), "sig");
    const res = makeRes();
    await appCheckSecureMiddleware(req as Request, res as Response, makeNext());
    expect(res.status).toHaveBeenCalledWith(400);
    expect((res.json as jest.Mock).mock.calls[0][0].error).toBe("TIMESTAMP_EXPIRED");
  });

  it("should return 400 when the signature does not match", async () => {
    mockVerifyToken.mockResolvedValue({ appId: "dev-4" });
    const req = makeSecureReq("valid-token", freshNonce(), String(Date.now()), "wrong-signature");
    const res = makeRes();
    await appCheckSecureMiddleware(req as Request, res as Response, makeNext());
    expect(res.status).toHaveBeenCalledWith(400);
    expect((res.json as jest.Mock).mock.calls[0][0].error).toBe("INVALID_SIGNATURE");
  });

  it("should return 400 when a nonce is reused", async () => {
    const token = "valid-token";
    const nonce = freshNonce();
    const timestamp = Date.now();
    const body = { mapLink: "https://example.com" };
    const signature = buildSignature(token, nonce, timestamp, body);

    mockVerifyToken.mockResolvedValue({ appId: "dev-5" });
    const { firestore } = buildFirestoreMock({ exists: false });
    (getFirebaseFirestore as jest.Mock).mockReturnValue(firestore);

    const req1 = makeSecureReq(token, nonce, String(timestamp), signature, body);
    const req2 = makeSecureReq(token, nonce, String(timestamp), signature, body);
    const res1 = makeRes();
    const res2 = makeRes();

    // First request should succeed
    await appCheckSecureMiddleware(req1 as Request, res1 as Response, makeNext());
    expect(res1.status).not.toHaveBeenCalledWith(400);

    // Second request with the same nonce must be rejected
    await appCheckSecureMiddleware(req2 as Request, res2 as Response, makeNext());
    expect(res2.status).toHaveBeenCalledWith(400);
    expect((res2.json as jest.Mock).mock.calls[0][0].error).toBe("NONCE_REUSED");
  });

  it("should call next() on a fully valid secure request", async () => {
    const token = "valid-token";
    const nonce = freshNonce();
    const timestamp = Date.now();
    const body = { mapLink: "https://maps.google.com/?q=Dhaka" };
    const signature = buildSignature(token, nonce, timestamp, body);

    mockVerifyToken.mockResolvedValue({ appId: "dev-6" });
    const { firestore } = buildFirestoreMock({ exists: false });
    (getFirebaseFirestore as jest.Mock).mockReturnValue(firestore);

    const req = makeSecureReq(token, nonce, String(timestamp), signature, body);
    const res = makeRes();
    const next = makeNext();

    await appCheckSecureMiddleware(req as Request, res as Response, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalledWith(400);
    expect(res.status).not.toHaveBeenCalledWith(401);
  });
});

// ─── cleanupNonceStore ───────────────────────────────────────────────────────

describe("cleanupNonceStore", () => {
  it("should not throw when called", () => {
    expect(() => cleanupNonceStore()).not.toThrow();
  });
});
