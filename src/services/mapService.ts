import { logger } from "../lib/logger";

export interface GeocodeResult {
  coords: { lat: number; lng: number } | null;
  billable: boolean;
}

export class MapService {
  // Place Details lookup by Place ID — deterministic, no ambiguity vs text search.
  // Uses "Location Only" field mask (cheapest SKU).
  private async fetchByPlaceId(placeId: string, apiKey: string): Promise<GeocodeResult> {
    try {
      logger.debug({ placeId }, "places_details_start");

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(`https://places.googleapis.com/v1/places/${placeId}`, {
        signal: controller.signal,
        headers: {
          "X-Goog-Api-Key": apiKey,
          "X-Goog-FieldMask": "location",
        },
      });
      clearTimeout(timeoutId);

      // 4xx/5xx — not billable by Google
      if (!response.ok) return { coords: null, billable: false };

      // 2xx — billable by Google, even if no location data
      const data = (await response.json()) as {
        location?: { latitude: number; longitude: number };
      };
      if (!data.location) return { coords: null, billable: true };

      logger.debug({ placeId }, "places_details_end");
      return { coords: { lat: data.location.latitude, lng: data.location.longitude }, billable: true };
    } catch (err) {
      // Network error / timeout — not billable
      logger.error({ err, placeId }, "places_details_exception");
      return { coords: null, billable: false };
    }
  }

  // Text Search — IDs only (Unlimited Free SKU). Returns a place_id for the query.
  private async findPlaceIdByText(query: string, apiKey: string): Promise<string | null> {
    try {
      logger.debug({ query }, "places_text_search_start");

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const response = await fetch("https://places.googleapis.com/v1/places:searchText", {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": apiKey,
          "X-Goog-FieldMask": "places.id",
        },
        body: JSON.stringify({ textQuery: query, pageSize: 1 }),
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorBody = await response.text().catch(() => "(unreadable)");
        logger.error({ status: response.status, body: errorBody }, "places_text_search_error");
        return null;
      }

      const data = (await response.json()) as { places?: { id: string }[] };
      const placeId = data.places?.[0]?.id ?? null;
      return placeId;
    } catch (err) {
      logger.error({ err }, "places_text_search_exception");
      return null;
    }
  }

  async geocodeApiCall(placeId?: string, query?: string): Promise<GeocodeResult> {
    const apiKey = process.env.GOOGLE_GEOCODING_API_KEY;
    if (!apiKey) throw new Error("GOOGLE_GEOCODING_API_KEY is not configured");
    if (placeId) return this.fetchByPlaceId(placeId, apiKey);
    if (query) {
      const discoveredId = await this.findPlaceIdByText(query, apiKey);
      if (discoveredId) return this.fetchByPlaceId(discoveredId, apiKey);
    }

    return { coords: null, billable: false };
  }
}
