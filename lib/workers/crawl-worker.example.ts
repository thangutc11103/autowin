/**
 * EXAMPLE: Worker Processor cho BullMQ
 * File này chỉ để tham khảo cách implement Worker
 * Trong production, file này sẽ nằm trong separate service/folder
 */

import { Worker } from "bullmq";
import { getRedis } from "@/lib/redis";
import { ScraperFactory } from "@/lib/scrapers/scraper-factory";
import type { CrawlJobData } from "@/types/1";

/**
 * Tạo Worker process cho crawl-tasks queue
 * Worker này sẽ lắng nghe các job được submit từ Next.js
 */
export function createCrawlWorker() {
  const connection = getRedis();

  const worker = new Worker<CrawlJobData>(
    "crawl-tasks",
    async (job) => {
      console.log(
        `[Job ${job.id}] Starting crawl for ${job.data.platform}: ${job.data.value}`,
      );

      try {
        const { platform, type, targetUrl, limit } = job.data;

        // Progress reporting
        await job.progress(25);

        // Lấy scraper phù hợp cho platform
        const scraper = ScraperFactory.getScraper(platform);

        // Crawl dữ liệu
        const result = await scraper.crawl(targetUrl, type);

        await job.progress(75);

        // TODO: Lưu result vào database hoặc cache
        console.log(`[Job ${job.id}] Crawl completed:`, result);

        await job.progress(100);

        return {
          jobId: job.id,
          platform,
          type,
          value: job.data.value,
          success: true,
          result,
          completedAt: new Date().toISOString(),
        };
      } catch (error) {
        console.error(`[Job ${job.id}] Error:`, error);
        throw error; // BullMQ sẽ handle retry
      }
    },
    {
      connection,
      concurrency: 5, // 5 job chạy song song
    },
  );

  worker.on("completed", (job) => {
    console.log(`[Job ${job.id}] Completed successfully`);
  });

  worker.on("failed", (job, err) => {
    console.error(`[Job ${job?.id}] Failed:`, err.message);
  });

  worker.on("error", (err) => {
    console.error("Worker error:", err);
  });

  return worker;
}

/**
 * USAGE TRONG FILE SEPARATE (e.g., worker.ts hoặc trong separate service):
 *
 * import { createCrawlWorker } from '@/lib/workers/crawl-worker.example';
 *
 * async function startWorker() {
 *   const worker = createCrawlWorker();
 *   console.log('Worker started, listening for jobs...');
 * }
 *
 * startWorker().catch(console.error);
 */
