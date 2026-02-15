import { MapService } from "./src/services/mapService";

const mapService = new MapService();
const testUrl =
  "https://www.google.com/maps?q=Ghurer+Jilapi(%E0%A6%97%E0%A7%81%E0%A7%9C%E0%A7%87%E0%A6%B0+%E0%A6%9C%E0%A6%BF%E0%A6%B2%E0%A6%BE%E0%A6%AA%E0%A6%BF),+Unnamed+Road,+Dhaka+1230&ftid=0x3755c141778e9121:0x8b825bd5ed3a8439";

async function testMultipleTimes() {
  console.log("Testing for rate limiting...\n");

  for (let i = 1; i <= 5; i++) {
    const start = Date.now();
    console.log(`\n=== Attempt ${i} ===`);

    try {
      const result = await mapService.extractCoordinatesWithBrowser(testUrl);
      const duration = Date.now() - start;

      if (result) {
        console.log(`✓ Success (${duration}ms): lat=${result.lat}, lng=${result.lng}`);
      } else {
        console.log(`✗ Failed (${duration}ms): Returned null - POSSIBLE RATE LIMIT`);
      }
    } catch (error) {
      const duration = Date.now() - start;
      console.log(`✗ Error (${duration}ms):`, error instanceof Error ? error.message : error);
    }

    // Small delay between requests
    if (i < 5) {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  console.log("\n=== Test Complete ===");
  process.exit(0);
}

testMultipleTimes();
