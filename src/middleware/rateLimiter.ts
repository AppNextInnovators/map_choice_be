import { Request, Response } from "express";
import rateLimit from "express-rate-limit";

const windowMinutes = parseInt(process.env.RATE_LIMIT_WINDOW_MINUTES || "1", 10);
const maxRequests = parseInt(process.env.RATE_LIMIT_MAX || "60", 10);

export const ipRateLimiter = rateLimit({
  windowMs: windowMinutes * 60 * 1000,
  max: maxRequests,
  standardHeaders: true,
  legacyHeaders: false,
  // Validate IP from trusted proxy (requires app.set('trust proxy', 1) in index.ts)
  validate: { trustProxy: false },
  keyGenerator: (req: Request) => req.ip || "unknown",
  handler: (req: Request, res: Response) => {
    res.status(429).json({
      success: false,
      message: "Too many requests from this IP, please try again later.",
      error: "IP_RATE_LIMIT_EXCEEDED",
    });
  },
});

export default ipRateLimiter;
