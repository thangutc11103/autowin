/**
 * WORKER SERVICE: Main Entry Point
 * Chạy: npx ts-node scripts/worker.ts
 *
 * File này khởi động Worker để xử lý các job từ Redis queue
 */

import { Worker, QueueEvents } from "bullmq";
import { getRedis } from "@/lib/redis";
import { ScraperFactory } from "@/lib/scrapers/scraper-factory";
import type { CrawlJobData } from "@/types/1";

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
        console.log(`[JOB ${job.id}] ✓ Scraper initialized`);

        // 75% - Execute Crawl
        await job.updateProgress(75);
        console.log(`[JOB ${job.id}] ⧖ Crawling...`);

        const result = await scraper.crawl(targetUrl, type);
        console.log(`[JOB ${job.id}] ✓ Crawl completed`);

        // 100% - Return result
        await job.updateProgress(100);

        const output = {
          jobId: job.id,
          platform,
          type,
          value,
          success: true,
          itemsFound: Math.floor(Math.random() * 100), // Mock data
          completedAt: new Date().toISOString(),
          result,
        };

        console.log(`[JOB ${job.id}] ✅ SUCCESS`);
        console.log(JSON.stringify(output, null, 2));
        console.log(`${"=".repeat(60)}\n`);

        return output;
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.error(`[JOB ${job.id}] ❌ ERROR: ${errorMsg}`);
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
