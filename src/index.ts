import express, { Application } from "express";
import cors from "cors";
import helmet from "helmet";
import { pinoHttp } from "pino-http";
import dotenv from "dotenv";
import routes from "./routes";
import { errorHandler } from "./middleware/errorHandler";
import ipRateLimiter from "./middleware/rateLimiter";
import { initializeFirebase } from "./config/firebase";
import { validateEnv } from "./config/validateEnv";
import { appCheckSecureMiddleware } from "./middleware/appCheckMiddleware";
import { authMiddleware } from "./middleware/authMiddleware";
import { logger } from "./lib/logger";

// Load environment variables first
dotenv.config();

// Validate required environment variables before starting
validateEnv();

// Initialize Firebase Admin SDK
initializeFirebase();

const app: Application = express();
const PORT = process.env.PORT || 3000;

// Trust first proxy (required for accurate req.ip behind load balancers)
app.set("trust proxy", 1);

// Middleware
app.use(helmet());
app.use(
  cors({
    origin: process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(",") : false,
    methods: ["GET", "POST"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "X-Firebase-AppCheck",
      "X-Request-Nonce",
      "X-Request-Timestamp",
      "X-Request-Signature",
    ],
  }),
);
app.use(express.json({ limit: "10kb" }));
app.use(express.urlencoded({ extended: true, limit: "10kb" }));
app.use(
  pinoHttp({
    logger,
    autoLogging: {
      ignore: (req) => req.url === "/health",
    },
    serializers: {
      req: (req) => ({ method: req.method, path: req.url?.split("?")[0] }),
      res: (res) => ({ statusCode: res.statusCode }),
    },
  }),
);

// Apply rate limiting, App Check, and auth middleware to all API routes
app.use("/api", ipRateLimiter, appCheckSecureMiddleware, authMiddleware);

// Routes
app.use("/api", routes);

// Health check
app.get("/health", (req, res) => {
  res.status(200).json({ status: "OK", message: "Server is running" });
});

// Error handling
app.use(errorHandler);

app.listen(PORT, () => {
  logger.info({ port: PORT }, "server_started");
});

export default app;
