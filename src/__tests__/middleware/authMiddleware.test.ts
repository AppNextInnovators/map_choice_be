/* eslint-disable @typescript-eslint/no-explicit-any */
import { Request, Response, NextFunction } from "express";

jest.mock("../../config/firebase", () => ({
  getFirebaseAuth: jest.fn(),
  getFirebaseFirestore: jest.fn(),
}));

jest.mock("../../lib/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { authMiddleware } from "../../middleware/authMiddleware";
import { getFirebaseAuth, getFirebaseFirestore } from "../../config/firebase";

// ─── Helpers ────────────────────────────────────────────────────────────────

const makeReq = (authHeader?: string): Partial<Request> => ({
  header: jest.fn((name: string) => (name === "Authorization" ? authHeader : undefined)) as any,
  body: {},
});

const makeRes = (): Partial<Response> => ({
  status: jest.fn().mockReturnThis(),
  json: jest.fn().mockReturnThis(),
  setHeader: jest.fn(),
});

const makeNext = (): NextFunction => jest.fn();

const UID = "user-uid-123";

const buildFirestoreMock = (docData: { exists: boolean; data?: () => object }) => {
  const mockSet = jest.fn();
  const mockTransaction = {
    get: jest.fn().mockResolvedValue(docData),
    set: mockSet,
  };
  const mockDocRef = {
    get: jest.fn().mockResolvedValue(docData),
  };
  return {
    collection: jest.fn().mockReturnValue({
      doc: jest.fn().mockReturnValue(mockDocRef),
    }),
    runTransaction: jest.fn().mockImplementation(async (fn: (tx: any) => Promise<any>) => fn(mockTransaction)),
    _mockSet: mockSet,
  };
};

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("authMiddleware", () => {
  const mockGetFirebaseAuth = getFirebaseAuth as jest.Mock;
  const mockGetFirebaseFirestore = getFirebaseFirestore as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.SKIP_APP_CHECK;
    process.env.NODE_ENV = "test";
  });

  it("should return 401 when Authorization header is missing", async () => {
    const req = makeReq(undefined);
    const res = makeRes();
    const next = makeNext();

    await authMiddleware(req as Request, res as Response, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: "AUTH_TOKEN_MISSING" }));
    expect(next).not.toHaveBeenCalled();
  });

  it("should return 401 when Authorization header is not Bearer scheme", async () => {
    const req = makeReq("Basic some-token");
    const res = makeRes();
    const next = makeNext();

    await authMiddleware(req as Request, res as Response, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: "AUTH_TOKEN_MISSING" }));
  });

  it("should return 401 when token verification fails", async () => {
    mockGetFirebaseAuth.mockReturnValue({
      verifyIdToken: jest.fn().mockRejectedValue(new Error("invalid token")),
    });

    const req = makeReq("Bearer bad-token");
    const res = makeRes();
    const next = makeNext();

    await authMiddleware(req as Request, res as Response, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: "AUTH_TOKEN_INVALID" }));
    expect(next).not.toHaveBeenCalled();
  });

  it("should call next() on a valid token with no prior usage", async () => {
    mockGetFirebaseAuth.mockReturnValue({
      verifyIdToken: jest.fn().mockResolvedValue({ uid: UID }),
    });
    const firestoreMock = buildFirestoreMock({ exists: false });
    mockGetFirebaseFirestore.mockReturnValue(firestoreMock);

    const req = makeReq("Bearer valid-token") as Request;
    const res = makeRes();
    const next = makeNext();

    await authMiddleware(req, res as Response, next);

    expect(next).toHaveBeenCalled();
    expect(req.uid).toBe(UID);
  });

  it("should return 429 when daily limit is exceeded", async () => {
    mockGetFirebaseAuth.mockReturnValue({
      verifyIdToken: jest.fn().mockResolvedValue({ uid: UID }),
    });
    const futureReset = Date.now() + 60_000;
    const firestoreMock = buildFirestoreMock({
      exists: true,
      data: () => ({
        dailyCount: 20,
        dailyResetTime: futureReset,
        monthlyCount: 5,
        monthlyResetTime: futureReset + 1_000_000,
      }),
    });
    mockGetFirebaseFirestore.mockReturnValue(firestoreMock);

    const req = makeReq("Bearer valid-token");
    const res = makeRes();
    const next = makeNext();

    await authMiddleware(req as Request, res as Response, next);

    expect(res.status).toHaveBeenCalledWith(429);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: "RATE_LIMIT_EXCEEDED" }));
    expect(next).not.toHaveBeenCalled();
  });

  it("should return 429 when monthly limit is exceeded", async () => {
    mockGetFirebaseAuth.mockReturnValue({
      verifyIdToken: jest.fn().mockResolvedValue({ uid: UID }),
    });
    const futureReset = Date.now() + 60_000;
    const firestoreMock = buildFirestoreMock({
      exists: true,
      data: () => ({
        dailyCount: 1,
        dailyResetTime: futureReset,
        monthlyCount: 200,
        monthlyResetTime: futureReset + 1_000_000,
      }),
    });
    mockGetFirebaseFirestore.mockReturnValue(firestoreMock);

    const req = makeReq("Bearer valid-token");
    const res = makeRes();
    const next = makeNext();

    await authMiddleware(req as Request, res as Response, next);

    expect(res.status).toHaveBeenCalledWith(429);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: "RATE_LIMIT_EXCEEDED" }));
  });

  it("should reset expired daily counter and allow the request", async () => {
    mockGetFirebaseAuth.mockReturnValue({
      verifyIdToken: jest.fn().mockResolvedValue({ uid: UID }),
    });
    const expiredReset = Date.now() - 1000; // already in the past
    const firestoreMock = buildFirestoreMock({
      exists: true,
      data: () => ({
        dailyCount: 20, // was at limit, but window expired
        dailyResetTime: expiredReset,
        monthlyCount: 5,
        monthlyResetTime: Date.now() + 1_000_000,
      }),
    });
    mockGetFirebaseFirestore.mockReturnValue(firestoreMock);

    const req = makeReq("Bearer valid-token");
    const res = makeRes();
    const next = makeNext();

    await authMiddleware(req as Request, res as Response, next);

    expect(next).toHaveBeenCalled();
  });

  it("should skip verification in development when SKIP_APP_CHECK is true", async () => {
    process.env.NODE_ENV = "development";
    process.env.SKIP_APP_CHECK = "true";

    const req = makeReq(undefined);
    const res = makeRes();
    const next = makeNext();

    await authMiddleware(req as Request, res as Response, next);

    expect(next).toHaveBeenCalled();
    expect(mockGetFirebaseAuth).not.toHaveBeenCalled();
  });
});
