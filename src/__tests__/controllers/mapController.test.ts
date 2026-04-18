/* eslint-disable @typescript-eslint/no-explicit-any */
import { MapController } from "../../controllers/mapController";
import { Request, Response, NextFunction } from "express";

jest.mock("../../middleware/authMiddleware", () => ({
  incrementQuotas: jest.fn().mockResolvedValue(undefined),
}));

import { incrementQuotas } from "../../middleware/authMiddleware";

describe("MapController", () => {
  let mapController: MapController;
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let mockNext: NextFunction;

  beforeEach(() => {
    jest.clearAllMocks();
    mapController = new MapController();
    mockRequest = { body: {}, uid: "test-uid" };
    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
    mockNext = jest.fn();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("parseMapLink", () => {
    it("should return 400 when neither placeId nor query is provided", async () => {
      mockRequest.body = {};

      await mapController.parseMapLink(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        message: "Either placeId or query is required",
        error: "MISSING_PARAMETERS",
      });
    });

    it("should return coordinates when placeId is provided", async () => {
      mockRequest.body = { placeId: "ChIJD7fiBh9u5kcRYJSMaMOCCwQ" };
      const mockCoords = { lat: 48.8566, lng: 2.3522 };

      jest
        .spyOn((mapController as any).mapService, "geocodeApiCall")
        .mockResolvedValue({ coords: mockCoords, billable: true });

      await mapController.parseMapLink(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(200);
      expect(mockResponse.json).toHaveBeenCalledWith({ success: true, ...mockCoords });
      expect(incrementQuotas).toHaveBeenCalledWith("test-uid");
    });

    it("should return coordinates when query is provided", async () => {
      mockRequest.body = { query: "Eiffel Tower" };
      const mockCoords = { lat: 48.8566, lng: 2.3522 };

      jest
        .spyOn((mapController as any).mapService, "geocodeApiCall")
        .mockResolvedValue({ coords: mockCoords, billable: true });

      await mapController.parseMapLink(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(200);
      expect(mockResponse.json).toHaveBeenCalledWith({ success: true, ...mockCoords });
    });

    it("should return 400 and increment quota when geocoding is billable but returns no coords", async () => {
      mockRequest.body = { query: "unknown place" };

      jest
        .spyOn((mapController as any).mapService, "geocodeApiCall")
        .mockResolvedValue({ coords: null, billable: true });

      await mapController.parseMapLink(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        message: "Could not extract coordinates from the provided map link",
        error: "GEOCODING_FAILED",
      });
      expect(incrementQuotas).toHaveBeenCalledWith("test-uid");
    });

    it("should return 400 and not increment quota when geocoding is not billable", async () => {
      mockRequest.body = { query: "unknown place" };

      jest
        .spyOn((mapController as any).mapService, "geocodeApiCall")
        .mockResolvedValue({ coords: null, billable: false });

      await mapController.parseMapLink(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(incrementQuotas).not.toHaveBeenCalled();
    });

    it("should call next with error when exception occurs", async () => {
      mockRequest.body = { query: "Eiffel Tower" };
      const error = new Error("Test error");

      jest.spyOn((mapController as any).mapService, "geocodeApiCall").mockRejectedValue(error);

      await mapController.parseMapLink(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(error);
    });
  });
});
