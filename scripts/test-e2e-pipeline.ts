/**
 * End-to-End Test: Scraper → Database Pipeline
 *
 * This script:
 * 1. Uses ScraperFactory to crawl TikTok #trending
 * 2. Maps results to database format
 * 3. Attempts to save to PostgreSQL (if connected)
 * 4. Reports the full pipeline status
 *
 * Run: npm run test:e2e
 */

import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { ScraperFactory } from "@/lib/scrapers/scraper-factory";
import {
  ensureScrapeStorage,
  saveSuccessfulScrape,
} from "@/lib/database/scrape-storage";

async function e2eTest() {
  console.log("\n████████████████████████████████████████████████████████");
  console.log("██  🔗 End-to-End: Scraper → Database Pipeline       ██");
  console.log("████████████████████████████████████████████████████████\n");

  try {
    // STEP 1: Scrape Data
    console.log("[STEP 1] Scraping #trending with Factory...\n");

    const scraper = ScraperFactory.getScraper("tiktok");
    const scrapeResult = await scraper.crawl(
      "https://www.tiktok.com/tag/trending",
      "hashtag",
    );

    console.log(`[✅] Scraped: ${scrapeResult.count} videos\n`);

    if (!scrapeResult.data || scrapeResult.data.length === 0) {
      throw new Error("No videos scraped");
    }

    // STEP 2: Prepare Database
    console.log("[STEP 2] Setting up database...\n");

    try {
      await ensureScrapeStorage();
      console.log("[✅] Database schema ready\n");
    } catch (dbError) {
      console.warn(
        "[⚠️] Database not available (optional):",
        (dbError as Error).message,
      );
      console.log("    Continuing with data mapping only...\n");
    }

    // STEP 3: Map Data
    console.log("[STEP 3] Mapping scraped videos to database format...\n");

    const videosArray = Array.isArray(scrapeResult.data)
      ? scrapeResult.data
      : Object.values(scrapeResult.data || {});

    const mappedVideos = videosArray.map((video: any) => ({
      externalId: video.video_id || `tiktok_${video.title}`,
      title: video.title || "Untitled",
      url: video.video_url,
      platform: "tiktok" as const,
      author: video.author || "unknown",
      views: video.views || undefined,
      thumbnail: video.thumbnail_url || undefined,
      uploadedAt: video.uploaded_at || undefined,
      crawledAt: new Date().toISOString(),
      rawPayload: { ...video },
    }));

    console.log(`[✅] Mapped ${mappedVideos.length} videos\n`);

    // Show sample
    if (mappedVideos.length > 0) {
      console.log("[Sample] First video:");
      const first = mappedVideos[0];
      console.log(`  • URL: ${first.url}`);
      console.log(`  • Author: ${first.author}`);
      console.log(`  • Views: ${first.views}`);
      console.log(`  • Title: ${first.title}\n`);
    }

    // STEP 4: Save to Database
    console.log("[STEP 4] Saving to database...\n");

    try {
      const saveResult = await saveSuccessfulScrape({
        jobData: {
          id: "test-e2e-tiktok-hashtag-trending",
          batchId: "test-e2e",
          platform: "tiktok",
          type: "hashtag",
          value: "trending",
          targetUrl: "https://www.tiktok.com/tag/trending",
          limit: mappedVideos.length,
          createdAt: new Date().toISOString(),
        },
        result: {
          videos: mappedVideos,
          totalCount: mappedVideos.length,
          platform: "tiktok",
          scrapedAt: new Date().toISOString(),
          metadata: {
            platform: "tiktok",
            type: "hashtag",
            value: "trending",
            url: "https://www.tiktok.com/tag/trending",
          },
        },
      });

      console.log(`[✅] Saved ${saveResult.savedVideos} videos`);
      console.log(`    Job ID: ${saveResult.jobId}\n`);
    } catch (dbError) {
      console.warn(
        "[⚠️] Could not save to database:",
        (dbError as Error).message,
      );
      console.log("    (Database connection may not be configured)\n");
    }

    // FINAL REPORT
    console.log("████████████████████████████████████████████████████████");
    console.log("✅ Pipeline Complete!");
    console.log("████████████████████████████████████████████████████████");
    console.log("\n📊 Summary:");
    console.log(`  • Platform: TikTok`);
    console.log(`  • Hashtag: #trending`);
    console.log(`  • Videos Scraped: ${scrapeResult.count}`);
    console.log(`  • Videos Mapped: ${mappedVideos.length}`);
    console.log(`  • Scraper: Decodo API + Cheerio ✨`);
    console.log(`  • No Playwright needed ✨`);
    console.log(`  • No Proxy rotation needed ✨\n`);

    console.log("🎯 Next Steps:");
    console.log("  1. Start Redis: docker run -d -p 6379:6379 redis:latest");
    console.log("  2. Start Worker: npm run worker");
    console.log("  3. Add jobs to queue via API");
    console.log("  4. View results in database / UI\n");
  } catch (error) {
    console.error("\n❌ Error:", error);
    process.exit(1);
  }
}

e2eTest();
