import { Request, Response } from "express";
import { errorHandler } from "../../middleware/errorHandler";
import { logger } from "../../lib/logger";

describe("errorHandler", () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  const originalNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    mockRequest = {};
    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
    jest.spyOn(logger, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    jest.restoreAllMocks();
  });

  it("should always respond with 500", () => {
    errorHandler(new Error("boom"), mockRequest as Request, mockResponse as Response);
    expect(mockResponse.status).toHaveBeenCalledWith(500);
  });

  it("should always use generic message in the response body", () => {
    errorHandler(new Error("Something broke"), mockRequest as Request, mockResponse as Response);
    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, message: "Internal Server Error" }),
    );
  });

  it("should fall back to 'Internal Server Error' when the error has no message", () => {
    errorHandler(new Error(), mockRequest as Request, mockResponse as Response);
    expect(mockResponse.json).toHaveBeenCalledWith(expect.objectContaining({ message: "Internal Server Error" }));
  });

  it("should not include the stack trace even in development mode", () => {
    process.env.NODE_ENV = "development";
    const error = new Error("Dev error");
    errorHandler(error, mockRequest as Request, mockResponse as Response);
    const body = (mockResponse.json as jest.Mock).mock.calls[0][0];
    expect(body).not.toHaveProperty("stack");
  });

  it("should not include the stack trace in production mode", () => {
    process.env.NODE_ENV = "production";
    errorHandler(new Error("Prod error"), mockRequest as Request, mockResponse as Response);
    const body = (mockResponse.json as jest.Mock).mock.calls[0][0];
    expect(body).not.toHaveProperty("stack");
  });

  it("should log the error to the logger", () => {
    const error = new Error("logged error");
    errorHandler(error, mockRequest as Request, mockResponse as Response);
    expect(logger.error).toHaveBeenCalledWith(expect.objectContaining({ err: error }), "unhandled_error");
  });
});
