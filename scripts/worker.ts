/**
 * WORKER SERVICE: Main Entry Point
 * Chạy: npx ts-node scripts/worker.ts
 *
 * File này khởi động Worker để xử lý các job từ Redis queue
 */

// Load .env.local trước tất cả
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { Worker, QueueEvents } from "bullmq";
import { getRedis } from "@/lib/redis";
import { ScraperFactory } from "@/lib/scrapers/scraper-factory";
import { saveSuccessfulScrape } from "@/lib/database/scrape-storage";
import type { CrawlJobData } from "@/types/job";

/**
 * Setup Worker Processor
 */
function setupWorker() {
  const connection = getRedis();

  const worker = new Worker<CrawlJobData>(
    "crawl-tasks",
    async (job) => {
      const { platform, type, value, targetUrl, limit } = job.data;

      console.log(`\n${"=".repeat(60)}`);
      console.log(`[JOB ${job.id}] Started`);
      console.log(`Platform: ${platform} | Type: ${type} | Value: ${value}`);
      console.log(`URL: ${targetUrl}`);
      console.log(`Limit: ${limit}`);
      console.log(`${"=".repeat(60)}`);

      try {
        // 25% - Validation & Setup
        await job.updateProgress(25);
        console.log(`[JOB ${job.id}] ✓ Setup complete`);

        // 50% - Get Scraper Strategy
        await job.updateProgress(50);
        const scraper = ScraperFactory.getScraper(platform);
        console.log(
          `[JOB ${job.id}] ✓ Scraper initialized for platform: ${platform}`,
        );

        // 75% - Execute Crawl
        await job.updateProgress(75);
        console.log(`[JOB ${job.id}] ⧖ Crawling...`);

        const scrapeResult = await scraper.crawl(targetUrl, type, limit);

        // Log raw scrapeResult
        console.log(`[JOB ${job.id}] 📊 Scrape Result:`);
        console.log(`   Type: ${typeof scrapeResult}`);
        console.log(`   Keys: ${Object.keys(scrapeResult).join(", ")}`);
        console.log(`   data type: ${typeof scrapeResult?.data}`);
        console.log(`   data value:`, scrapeResult?.data);

        const videosFound = scrapeResult?.data
          ? Array.isArray(scrapeResult.data)
            ? scrapeResult.data.length
            : Object.keys(scrapeResult.data).length
          : 0;

        console.log(
          `[JOB ${job.id}] ✓ Crawl completed - Found ${videosFound} videos`,
        );

        // 85% - Save to Supabase Database
        await job.updateProgress(85);
        console.log(
          `[JOB ${job.id}] 💾 Saving ${videosFound} videos to Supabase...`,
        );

        let dbResult = null;
        let savedCount = 0;

        if (videosFound > 0) {
          try {
            console.log(
              `[JOB ${job.id}] 🔄 Mapping videos to database format...`,
            );

            // Map scraped videos to ScrapeResult format
            const videosArray = Array.isArray(scrapeResult.data)
              ? scrapeResult.data
              : Object.values(scrapeResult.data || {});

            console.log(
              `[JOB ${job.id}] Converting ${videosArray.length} videos...`,
            );

            const mappedVideos = videosArray.map((video: any) => {
              const mapped = {
                externalId: video.video_id || `${platform}_${video.title}`,
                title: video.title,
                url: video.video_url,
                platform: platform as any,
                author: video.author || undefined,
                views: video.views || undefined,
                thumbnail: video.thumbnail_url || undefined,
                uploadedAt: video.uploaded_at,
                crawledAt: new Date().toISOString(),
                rawPayload: video.rawPayload || {},
              };
              return mapped;
            });

            console.log(
              `[JOB ${job.id}] ✓ Mapped ${mappedVideos.length} videos`,
            );
            if (mappedVideos.length > 0) {
              console.log(
                `[JOB ${job.id}] Sample mapped video:`,
                JSON.stringify(mappedVideos[0], null, 2),
              );
            }

            dbResult = await saveSuccessfulScrape({
              jobData: job.data,
              jobId: job.id,
              result: {
                videos: mappedVideos,
                totalCount: mappedVideos.length,
                platform,
                scrapedAt: new Date().toISOString(),
                metadata: {
                  platform,
                  type,
                  value,
                  url: targetUrl,
                },
              },
            });
            savedCount = dbResult.savedVideos;
            console.log(
              `[JOB ${job.id}] ✅ Saved ${savedCount} videos to Supabase`,
            );
            console.log(`[JOB ${job.id}] Database result:`, dbResult);

            // Log each saved video
            mappedVideos.slice(0, 3).forEach((video: any, idx: number) => {
              console.log(`   [${idx + 1}] "${video.title}" - ${video.url}`);
            });
            if (videosFound > 3) {
              console.log(`   ... and ${videosFound - 3} more`);
            }
          } catch (dbError) {
            const dbMsg =
              dbError instanceof Error ? dbError.message : String(dbError);
            console.error(`[JOB ${job.id}] ❌ Database save failed: ${dbMsg}`);
            console.error(dbError);
            console.log(`[JOB ${job.id}] This job will be retried...`);
            throw new Error(`Database save failed: ${dbMsg}`);
          }
        } else {
          console.log(`[JOB ${job.id}] ⚠️ No videos found to save`);
        }

        // 100% - Return result
        await job.updateProgress(100);

        const output = {
          jobId: job.id,
          batchId: job.data.batchId,
          platform,
          type,
          value,
          targetUrl,
          success: true,
          videosFound,
          savedToSupabase: savedCount,
          completedAt: new Date().toISOString(),
        };

        console.log(`[JOB ${job.id}] ✅ JOB COMPLETE`);
        console.log(`   Found: ${videosFound} | Saved to DB: ${savedCount}`);
        console.log(`${"=".repeat(60)}\n`);

        return output;
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.error(`[JOB ${job.id}] ❌ ERROR: ${errorMsg}`);
        console.error(error);
        console.log(`${"=".repeat(60)}\n`);
        throw error; // BullMQ will handle retry
      }
    },
    {
      connection,
      concurrency: 5, // 5 jobs chạy song song
      autorun: false,
    },
  );

  // Event listeners
  worker.on("ready", () => {
    console.log("\n🟢 Worker READY - Listening for jobs...\n");
  });

  worker.on("completed", (job) => {
    console.log(`[EVENT] Job ${job.id} COMPLETED`);
  });

  worker.on("failed", (job, err) => {
    console.error(`[EVENT] Job ${job?.id} FAILED:`, err.message);
  });

  worker.on("error", (err) => {
    console.error("[EVENT] Worker ERROR:", err);
  });

  worker.on("active", (job) => {
    console.log(`[EVENT] Job ${job.id} ACTIVE`);
  });

  return worker;
}

/**
 * Setup Queue Events (Global monitoring)
 */
function setupQueueEvents() {
  const connection = getRedis();
  const queueEvents = new QueueEvents("crawl-tasks", { connection });

  queueEvents.on("added", (data) => {
    console.log(`[QUEUE] Job added: ${data.jobId}`);
  });

  queueEvents.on("completed", (data) => {
    console.log(`[QUEUE] Job completed: ${data.jobId}`);
  });

  queueEvents.on("failed", (data) => {
    console.log(`[QUEUE] Job failed: ${data.jobId}`);
  });

  return queueEvents;
}

/**
 * Main: Start Worker Service
 */
async function start() {
  console.log("\n");
  console.log("████████████████████████████████████████████████████████");
  console.log("██                                                      ██");
  console.log("██          🚀 BullMQ Worker Service Started            ██");
  console.log("██                                                      ██");
  console.log("████████████████████████████████████████████████████████");
  console.log("\n");

  try {
    const redis = getRedis();

    // Test Redis connection
    const pong = await redis.ping();
    console.log(`✅ Redis Connection: ${pong}`);
    console.log(`📍 Host: ${process.env.REDIS_HOST || "localhost"}`);
    console.log(`📍 Port: ${process.env.REDIS_PORT || "6379"}\n`);

    // Setup worker
    const worker = setupWorker();
    const queueEvents = setupQueueEvents();

    // Start worker
    await worker.run();

    // Graceful shutdown
    process.on("SIGTERM", async () => {
      console.log("\n\n🛑 Shutting down worker gracefully...");
      await worker.close();
      await queueEvents.close();
      process.exit(0);
    });

    process.on("SIGINT", async () => {
      console.log("\n\n🛑 Shutting down worker gracefully...");
      await worker.close();
      await queueEvents.close();
      process.exit(0);
    });
  } catch (error) {
    console.error("❌ Failed to start worker:", error);
    process.exit(1);
  }
}

// Run
start();
