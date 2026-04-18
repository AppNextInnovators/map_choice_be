import { MapService } from "../../services/mapService";

describe("MapService", () => {
  let mapService: MapService;
  const originalEnv = process.env;

  beforeEach(() => {
    mapService = new MapService();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.restoreAllMocks();
  });

  describe("geocodeApiCall", () => {
    it("should throw when GOOGLE_GEOCODING_API_KEY is not set", async () => {
      delete process.env.GOOGLE_GEOCODING_API_KEY;
      await expect(mapService.geocodeApiCall(undefined, "Eiffel Tower")).rejects.toThrow(
        "GOOGLE_GEOCODING_API_KEY is not configured",
      );
    });

    it("should return non-billable null when neither placeId nor query is provided", async () => {
      process.env.GOOGLE_GEOCODING_API_KEY = "test-key";
      const result = await mapService.geocodeApiCall();
      expect(result).toEqual({ coords: null, billable: false });
    });

    describe("via placeId (Place Details)", () => {
      it("should call Place Details and return coordinates as billable", async () => {
        process.env.GOOGLE_GEOCODING_API_KEY = "test-key";
        global.fetch = jest.fn().mockResolvedValue({
          ok: true,
          json: async () => ({ location: { latitude: 48.8566, longitude: 2.3522 } }),
        }) as unknown as typeof fetch;

        const result = await mapService.geocodeApiCall("ChIJD7fiBh9u5kcRYJSMaMOCCwQ");
        expect(result).toEqual({ coords: { lat: 48.8566, lng: 2.3522 }, billable: true });

        const [url] = (global.fetch as jest.Mock).mock.calls[0];
        expect(url).toContain("/places/ChIJD7fiBh9u5kcRYJSMaMOCCwQ");
      });

      it("should return non-billable null when Place Details fetch fails", async () => {
        process.env.GOOGLE_GEOCODING_API_KEY = "test-key";
        global.fetch = jest.fn().mockResolvedValue({ ok: false }) as unknown as typeof fetch;

        const result = await mapService.geocodeApiCall("ChIJD7fiBh9u5kcRYJSMaMOCCwQ");
        expect(result).toEqual({ coords: null, billable: false });
      });
    });

    describe("via query (two-step Text Search → Place Details)", () => {
      it("should return coordinates on a successful response", async () => {
        process.env.GOOGLE_GEOCODING_API_KEY = "test-key";
        global.fetch = jest
          .fn()
          .mockResolvedValueOnce({
            ok: true,
            json: async () => ({ places: [{ id: "ChIJD7fiBh9u5kcRYJSMaMOCCwQ" }] }),
          })
          .mockResolvedValueOnce({
            ok: true,
            json: async () => ({ location: { latitude: 48.8566, longitude: 2.3522 } }),
          }) as unknown as typeof fetch;

        const result = await mapService.geocodeApiCall(undefined, "Eiffel Tower");
        expect(result).toEqual({ coords: { lat: 48.8566, lng: 2.3522 }, billable: true });
      });

      it("should return non-billable null when Text Search returns no results", async () => {
        process.env.GOOGLE_GEOCODING_API_KEY = "test-key";
        global.fetch = jest.fn().mockResolvedValue({
          ok: true,
          json: async () => ({ places: [] }),
        }) as unknown as typeof fetch;

        const result = await mapService.geocodeApiCall(undefined, "nowhere special");
        expect(result).toEqual({ coords: null, billable: false });
      });

      it("should return non-billable null when Text Search fetch fails", async () => {
        process.env.GOOGLE_GEOCODING_API_KEY = "test-key";
        global.fetch = jest.fn().mockResolvedValue({ ok: false }) as unknown as typeof fetch;

        const result = await mapService.geocodeApiCall(undefined, "Eiffel Tower");
        expect(result).toEqual({ coords: null, billable: false });
      });

      it("should return non-billable null when fetch throws a network error", async () => {
        process.env.GOOGLE_GEOCODING_API_KEY = "test-key";
        global.fetch = jest.fn().mockRejectedValue(new Error("Network error")) as unknown as typeof fetch;

        const result = await mapService.geocodeApiCall(undefined, "Eiffel Tower");
        expect(result).toEqual({ coords: null, billable: false });
      });
    });
  });
});
