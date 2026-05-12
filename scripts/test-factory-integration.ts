/**
 * Integration Test: ScraperFactory with new Decodo approach
 */

import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { ScraperFactory } from "@/lib/scrapers/scraper-factory";

async function testFactory() {
  console.log("\n████████████████████████████████████████████████████████");
  console.log("██  🏭 Testing ScraperFactory Integration             ██");
  console.log("████████████████████████████████████████████████████████\n");

  try {
    const scraper = ScraperFactory.getScraper("tiktok");
    console.log("[✅] Got TikTok scraper from factory\n");

    // Test hashtag crawl
    const result = await scraper.crawl(
      "https://www.tiktok.com/tag/trending",
      "hashtag",
    );

    console.log(`[✅] Crawl completed`);
    console.log(`    Platform: ${result.platform}`);
    console.log(`    Type: ${result.type}`);
    console.log(`    Count: ${result.count}`);
    console.log(`    Videos: ${result.data?.length || 0}\n`);

    if (result.data && result.data.length > 0) {
      console.log(`[Sample] First video:`);
      const first = result.data[0];
      console.log(`    URL: ${first.video_url}`);
      console.log(`    Author: ${first.author}`);
      console.log(`    ID: ${first.video_id}\n`);
    }

    console.log("████████████████████████████████████████████████████████");
    console.log("✅ Factory integration successful!");
    console.log("████████████████████████████████████████████████████████\n");
  } catch (error) {
    console.error("❌ Error:", error);
    process.exit(1);
  }
}

testFactory();
