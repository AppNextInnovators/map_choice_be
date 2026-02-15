/* eslint-disable @typescript-eslint/no-explicit-any */
import { MapController } from "../mapController";
import { Request, Response, NextFunction } from "express";

describe("MapController", () => {
  let mapController: MapController;
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let mockNext: NextFunction;

  beforeEach(() => {
    mapController = new MapController();
    mockRequest = {
      body: {},
    };
    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
    mockNext = jest.fn();
  });

  describe("parseMapLink", () => {
    it("should return 400 if mapLink is not provided", async () => {
      mockRequest.body = {};

      await mapController.parseMapLink(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        message: "Map link is required",
      });
    });

    it("should return coordinates when extraction succeeds", async () => {
      mockRequest.body = {
        mapLink: "https://maps.google.com/?q=40.7128,-74.0060",
      };

      await mapController.parseMapLink(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(200);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        lat: 40.7128,
        lng: -74.006,
      });
    });

    it("should return 400 when extraction fails", async () => {
      mockRequest.body = {
        mapLink: "https://example.com/invalid",
      };

      // Mock both extraction methods to return null
      jest.spyOn((mapController as any).mapService, "extractCoordinates").mockReturnValue(null);
      jest.spyOn((mapController as any).mapService, "extractCoordinatesWithBrowser").mockResolvedValue(null);

      await mapController.parseMapLink(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        message: "Could not extract coordinates from the provided map link",
      });
    });

    it("should use browser extraction when regex extraction fails", async () => {
      mockRequest.body = {
        mapLink: "https://complex-url.com",
      };

      const mockCoords = { lat: 23.7712738, lng: 90.3368252 };
      jest.spyOn((mapController as any).mapService, "extractCoordinates").mockReturnValue(null);
      jest.spyOn((mapController as any).mapService, "extractCoordinatesWithBrowser").mockResolvedValue(mockCoords);

      await mapController.parseMapLink(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(200);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        lat: mockCoords.lat,
        lng: mockCoords.lng,
      });
    });

    it("should call next with error when exception occurs", async () => {
      mockRequest.body = { mapLink: "test" };
      const error = new Error("Test error");

      jest.spyOn((mapController as any).mapService, "extractCoordinates").mockImplementation(() => {
        throw error;
      });

      await mapController.parseMapLink(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(error);
    });
  });
});
