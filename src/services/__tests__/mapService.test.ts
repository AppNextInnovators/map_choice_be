import { MapService } from "../mapService";

describe("MapService", () => {
  let mapService: MapService;

  beforeEach(() => {
    mapService = new MapService();
  });

  describe("extractCoordinates", () => {
    it("should extract coordinates from Google Maps ?q= format", () => {
      const result = mapService.extractCoordinates("https://maps.google.com/?q=40.7128,-74.0060");
      expect(result).toEqual({ lat: 40.7128, lng: -74.006 });
    });

    it("should extract coordinates from Google Maps @ format", () => {
      const result = mapService.extractCoordinates("https://www.google.com/maps/@40.7128,-74.0060,15z");
      expect(result).toEqual({ lat: 40.7128, lng: -74.006 });
    });

    it("should extract coordinates from Google Maps place format", () => {
      const result = mapService.extractCoordinates("https://www.google.com/maps/place/New+York/@40.7128,-74.0060,10z");
      expect(result).toEqual({ lat: 40.7128, lng: -74.006 });
    });

    it("should extract coordinates from Apple Maps ll= format", () => {
      const result = mapService.extractCoordinates("https://maps.apple.com/?ll=40.7128,-74.0060");
      expect(result).toEqual({ lat: 40.7128, lng: -74.006 });
    });

    it("should extract coordinates from direct coordinate format", () => {
      const result = mapService.extractCoordinates("40.7128, -74.0060");
      expect(result).toEqual({ lat: 40.7128, lng: -74.006 });
    });

    it("should handle negative coordinates", () => {
      const result = mapService.extractCoordinates("-33.8688,151.2093");
      expect(result).toEqual({ lat: -33.8688, lng: 151.2093 });
    });

    it("should handle whitespace in input", () => {
      const result = mapService.extractCoordinates("  40.7128,-74.0060  ");
      expect(result).toEqual({ lat: 40.7128, lng: -74.006 });
    });

    it("should return null for invalid input", () => {
      const result = mapService.extractCoordinates("https://example.com/invalid");
      expect(result).toBeNull();
    });

    it("should return null for invalid coordinates", () => {
      const result = mapService.extractCoordinates("invalid coordinates");
      expect(result).toBeNull();
    });
  });

  describe("extractCoordinatesWithBrowser", () => {
    it("should handle complex Google Maps URLs with place names", async () => {
      const result = await mapService.extractCoordinatesWithBrowser(
        "https://www.google.com/maps?q=Ghurer+Jilapi(%E0%A6%97%E0%A7%81%E0%A7%9C%E0%A7%87%E0%A6%B0+%E0%A6%9C%E0%A6%BF%E0%A6%B2%E0%A6%BE%E0%A6%AA%E0%A6%BF),+Unnamed+Road,+Dhaka+1230&ftid=0x3755c141778e9121:0x8b825bd5ed3a8439",
      );

      expect(result).not.toBeNull();
      expect(result).toHaveProperty("lat");
      expect(result).toHaveProperty("lng");
      expect(typeof result!.lat).toBe("number");
      expect(typeof result!.lng).toBe("number");
      // Verify coordinates are in reasonable range
      expect(result!.lat).toBeGreaterThanOrEqual(-90);
      expect(result!.lat).toBeLessThanOrEqual(90);
      expect(result!.lng).toBeGreaterThanOrEqual(-180);
      expect(result!.lng).toBeLessThanOrEqual(180);
    }, 30000);

    it("should return null for invalid URLs", async () => {
      const result = await mapService.extractCoordinatesWithBrowser("https://example.com/invalid");
      expect(result).toBeNull();
    }, 20000);
  });
});
