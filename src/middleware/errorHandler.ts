import { Request, Response } from "express";
import { logger } from "../lib/logger";

export const errorHandler = (err: Error, req: Request, res: Response) => {
  logger.error({ err, path: req.path, method: req.method }, "unhandled_error");

  res.status(500).json({
    success: false,
    message: "Internal Server Error",
    error: "INTERNAL_SERVER_ERROR",
  });
};
