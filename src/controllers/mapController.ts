import { NextFunction, Request, Response } from "express";
import { logger } from "../lib/logger";
import { incrementQuotas } from "../middleware/authMiddleware";
import { MapService } from "../services/mapService";

export class MapController {
  private mapService: MapService;

  constructor() {
    this.mapService = new MapService();
  }

  // POST /api/map/parse
  parseMapLink = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { placeId, query } = req.body;

      if (!placeId && !query) {
        return res.status(400).json({
          success: false,
          message: "Either placeId or query is required",
          error: "MISSING_PARAMETERS",
        });
      }

      // Validate types and length to prevent abuse
      if (placeId && (typeof placeId !== "string" || placeId.length > 300)) {
        return res.status(400).json({
          success: false,
          message: "Invalid placeId: must be a string of 300 characters or fewer",
          error: "INVALID_PLACE_ID",
        });
      }
      if (query && (typeof query !== "string" || query.length > 500)) {
        return res.status(400).json({
          success: false,
          message: "Invalid query: must be a string of 500 characters or fewer",
          error: "INVALID_QUERY",
        });
      }

      const result = await this.mapService.geocodeApiCall(placeId, query);

      // Increment quotas for any request Google considers billable (2xx response)
      if (result.billable) {
        try {
          if (req.uid) {
            await incrementQuotas(req.uid);
          }
        } catch (quotaError) {
          logger.error({ err: quotaError, uid: req.uid }, "quota_increment_failed");
        }
      }

      if (!result.coords) {
        logger.warn({ path: req.path }, "coordinates_extraction_failed");
        return res.status(400).json({
          success: false,
          message: "Could not extract coordinates from the provided map link",
          error: "GEOCODING_FAILED",
        });
      }

      res.status(200).json({
        success: true,
        ...result.coords,
      });
    } catch (error) {
      next(error);
    }
  };
}
