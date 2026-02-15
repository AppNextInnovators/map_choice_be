import puppeteer from "puppeteer";

export class MapService {
  extractCoordinates(url: string): { lat: number; lng: number } | null {
    try {
      // Remove any whitespace
      const cleanUrl = url.trim();

      // Pattern 1: Google Maps ?q=lat,lng or ?q=lat,lng
      const qPattern = /[?&]q=(-?\d+\.?\d*),(-?\d+\.?\d*)/;
      let match = cleanUrl.match(qPattern);
      if (match) {
        return { lat: parseFloat(match[1]), lng: parseFloat(match[2]) };
      }

      // Pattern 2: Google Maps /@lat,lng format
      const atPattern = /@(-?\d+\.?\d*),(-?\d+\.?\d*)/;
      match = cleanUrl.match(atPattern);
      if (match) {
        return { lat: parseFloat(match[1]), lng: parseFloat(match[2]) };
      }

      // Pattern 3: /maps/place/NAME/@lat,lng
      const placePattern = /\/maps\/place\/[^/]+\/@(-?\d+\.?\d*),(-?\d+\.?\d*)/;
      match = cleanUrl.match(placePattern);
      if (match) {
        return { lat: parseFloat(match[1]), lng: parseFloat(match[2]) };
      }

      // Pattern 4: Apple Maps ll=lat,lng
      const llPattern = /[?&]ll=(-?\d+\.?\d*),(-?\d+\.?\d*)/;
      match = cleanUrl.match(llPattern);
      if (match) {
        return { lat: parseFloat(match[1]), lng: parseFloat(match[2]) };
      }

      // Pattern 5: Direct coordinate format lat,lng (no URL)
      const directPattern = /^(-?\d+\.?\d*),\s*(-?\d+\.?\d*)$/;
      match = cleanUrl.match(directPattern);
      if (match) {
        return { lat: parseFloat(match[1]), lng: parseFloat(match[2]) };
      }

      return null;
    } catch (error) {
      return null;
    }
  }

  async extractCoordinatesWithBrowser(url: string): Promise<{ lat: number; lng: number } | null> {
    let browser;
    try {
      browser = await puppeteer.launch({
        headless: true,
        args: ["--no-sandbox", "--disable-setuid-sandbox"],
      });

      const page = await browser.newPage();

      // Block unnecessary resources to speed up loading
      await page.setRequestInterception(true);
      page.on("request", (request) => {
        const resourceType = request.resourceType();
        if (["image", "font", "media"].includes(resourceType)) {
          request.abort();
        } else {
          request.continue();
        }
      });

      // Set a reasonable timeout with networkidle0 for faster loading
      await page.goto(url, {
        waitUntil: "networkidle0",
        timeout: 15000,
      });

      // Wait for map to load - optimized to 2.5s for reliability
      await new Promise((resolve) => setTimeout(resolve, 2500));

      // Try to extract coordinates from the page URL after redirects
      const finalUrl = page.url();
      const coordinates = this.extractCoordinates(finalUrl);
      if (coordinates) {
        await browser.close();
        return coordinates;
      }

      // Extract coordinates using multiple strategies
      const extractedCoords = await page.evaluate(() => {
        // Look for coordinate arrays [lat, lng] with at least 4 decimal places
        const searchForCoords = (text: string): { lat: number; lng: number } | null => {
          const arrayPattern = /\[(-?\d+\.\d{4,}),\s*(-?\d+\.\d{4,})\]/g;
          let match;
          while ((match = arrayPattern.exec(text)) !== null) {
            const lat = parseFloat(match[1]);
            const lng = parseFloat(match[2]);
            if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
              return { lat, lng };
            }
          }
          return null;
        };

        // Search all script tags
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const scripts = (document as any).querySelectorAll("script");
        for (const script of scripts) {
          const content = script.textContent || "";
          const coords = searchForCoords(content);
          if (coords) return coords;
        }

        // Look in meta tags
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const metaTags = (document as any).querySelectorAll("meta");
        for (const tag of metaTags) {
          const content = tag.getAttribute("content") || "";
          const coords = searchForCoords(content);
          if (coords) return coords;
        }

        return null;
      });

      await browser.close();
      return extractedCoords;
    } catch (error) {
      if (browser) {
        await browser.close();
      }
      console.error("Error extracting coordinates with browser:", error);
      return null;
    }
  }
}
