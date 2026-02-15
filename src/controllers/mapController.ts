import { Request, Response, NextFunction } from "express";
import { MapService } from "../services/mapService";

export class MapController {
  private mapService: MapService;

  constructor() {
    this.mapService = new MapService();
  }

  // POST /api/map/parse
  parseMapLink = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { mapLink } = req.body;

      if (!mapLink) {
        return res.status(400).json({
          success: false,
          message: "Map link is required",
        });
      }

      let coords = this.mapService.extractCoordinates(mapLink);

      if (!coords) {
        // If direct extraction fails, try using Puppeteer for complex URLs
        coords = await this.mapService.extractCoordinatesWithBrowser(mapLink);
      }

      if (!coords) {
        return res.status(400).json({
          success: false,
          message: "Could not extract coordinates from the provided map link",
        });
      }
      res.status(200).json({
        success: true,
        ...coords,
      });
    } catch (error) {
      next(error);
    }
  };
}
