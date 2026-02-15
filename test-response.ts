import puppeteer from "puppeteer";

const testUrl =
  "https://www.google.com/maps?q=Ghurer+Jilapi(%E0%A6%97%E0%A7%81%E0%A7%9C%E0%A7%87%E0%A6%B0+%E0%A6%9C%E0%A6%BF%E0%A6%B2%E0%A6%BE%E0%A6%AA%E0%A6%BF),+Unnamed+Road,+Dhaka+1230&ftid=0x3755c141778e9121:0x8b825bd5ed3a8439";

async function checkResponse() {
  console.log("Checking Google Maps response...\n");

  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  const page = await browser.newPage();

  // Block unnecessary resources
  await page.setRequestInterception(true);
  page.on("request", (request) => {
    const resourceType = request.resourceType();
    if (["image", "font", "media"].includes(resourceType)) {
      request.abort();
    } else {
      request.continue();
    }
  });

  // Capture response status
  page.on("response", (response) => {
    const url = response.url();
    const status = response.status();
    if (url.includes("google.com/maps")) {
      console.log(`Response: ${status} - ${url.substring(0, 80)}...`);
    }
  });

  try {
    await page.goto(testUrl, {
      waitUntil: "networkidle0",
      timeout: 15000,
    });

    const finalUrl = page.url();
    const title = await page.title();

    console.log("\n=== Page Info ===");
    console.log("Final URL:", finalUrl.substring(0, 100));
    console.log("Title:", title);

    // Check for rate limit indicators
    const bodyText = await page.evaluate(() => document.body.innerText);

    const rateLimitIndicators = [
      "rate limit",
      "too many requests",
      "429",
      "quota exceeded",
      "access denied",
      "blocked",
      "captcha",
      "verify you're not a robot",
    ];

    const foundIndicators = rateLimitIndicators.filter((indicator) => bodyText.toLowerCase().includes(indicator));

    if (foundIndicators.length > 0) {
      console.log("\n⚠️  RATE LIMIT DETECTED!");
      console.log("Found indicators:", foundIndicators.join(", "));
      console.log("\nBody snippet:", bodyText.substring(0, 200));
    } else {
      console.log("\n✓ No rate limit indicators found");
    }
  } catch (error) {
    console.error("Error:", error);
  } finally {
    await browser.close();
  }

  process.exit(0);
}

checkResponse();
