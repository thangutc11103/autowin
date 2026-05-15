/**
 * Test Decodo + Cheerio Approach
 *
 * Run: npm run test:decodo-clean
 */

import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { TikTokDecodoScraper } from "@/lib/scrapers/tiktok-decodo-scraper";

async function main() {
  console.log("\n");
  console.log("████████████████████████████████████████████████████████");
  console.log("██                                                      ██");
  console.log("██  🎯 Decodo API + Cheerio (Production Ready)         ██");
  console.log("██                                                      ██");
  console.log("████████████████████████████████████████████████████████");
  console.log("\n");

  try {
    const scraper = new TikTokDecodoScraper();

    // Step 1: Crawl hashtag
    console.log(`[Step 1] Crawl hashtag\n`);
    const hashtagResult = await scraper.crawlHashtag("trending");

    console.log(`\n📊 Result:`, JSON.stringify(hashtagResult, null, 2));

    // Step 2: Show first listing result without crawling the detail page
    if (hashtagResult.data && hashtagResult.data.length > 0) {
      console.log(`\n[Step 2] Verify listing-only result\n`);

      const firstVideo = hashtagResult.data[0];

      console.log(`    First video URL: ${firstVideo.video_url}`);

      console.log("    Detail page skipped to avoid per-video Decodo requests.");
    }

    console.log("\n");
    console.log("████████████████████████████████████████████████████████");
    console.log("✅ Test completed successfully");
    console.log("████████████████████████████████████████████████████████");
    console.log("\n");
  } catch (error) {
    console.error("\n❌ Test failed:", error);
    process.exit(1);
  }
}

main();
