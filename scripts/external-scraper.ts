/**
 * External Playwright Scraper - Test Phase 2
 * 
 * Chạy: tsx scripts/external-scraper.ts
 * 
 * Lưu ý: Cần Redis server running và Next.js đang chạy để submit jobs
 */

import { Worker } from 'bullmq';
import Redis from 'ioredis';
import type { CrawlJobData } from '@/types/job';

// 1. Connect to same Redis instance
const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD,
  db: 0,
  maxRetriesPerRequest: null,
});

redis.on('connect', () => {
  console.log('[EXTERNAL SCRAPER] ✅ Connected to Redis');
});

redis.on('error', (err) => {
  console.error('[EXTERNAL SCRAPER] ❌ Redis error:', err.message);
});

// 2. Mock Playwright Scraper (Replace with real Playwright later)
async function playwrightScraper(jobData: CrawlJobData): Promise<{
  videos: any[];
  totalCount: number;
  platform: string;
  scrapedAt: string;
}> {
  console.log(`[SCRAPER] Scraping ${jobData.platform} - ${jobData.type}: ${jobData.value}`);
  console.log(`[SCRAPER] URL: ${jobData.targetUrl}`);

  // Simulate Playwright scraping (replace with real Playwright)
  await new Promise((resolve) => setTimeout(resolve, 2000)); // 2s delay

  // Mock data - will replace with real scraping
  const mockVideos = Array.from({ length: jobData.limit }, (_, i) => ({
    id: `video-${jobData.jobId}-${i}`,
    title: `${jobData.value} - Video ${i + 1}`,
    author: `Author ${i}`,
    views: Math.floor(Math.random() * 1000000),
    url: `https://${jobData.platform}.com/video/${i}`,
    platform: jobData.platform,
    crawledAt: new Date().toISOString(),
  }));

  return {
    videos: mockVideos,
    totalCount: mockVideos.length,
    platform: jobData.platform,
    scrapedAt: new Date().toISOString(),
  };
}

// 3. Create BullMQ Worker (Better than manual subscription)
const worker = new Worker(
  'crawl-tasks',
  async (job) => {
    console.log(`\n[JOB ${job.id}] ⏳ Processing...`);
    console.log(`[JOB ${job.id}] Data:`, job.data);

    try {
      // Get job data
      const jobData = job.data as CrawlJobData;

      // Call Playwright scraper
      const scrapedData = await playwrightScraper(jobData);

      console.log(`[JOB ${job.id}] ✅ Scraped ${scrapedData.totalCount} videos`);

      // 4. Store results in Redis
      const resultKey = `results:${jobData.batchId}:${job.id}`;
      await redis.setex(
        resultKey,
        3600, // TTL 1 hour
        JSON.stringify(scrapedData)
      );

      console.log(`[JOB ${job.id}] 💾 Stored in Redis: ${resultKey}`);

      // Also store in batch results list
      await redis.lpush(
        `results:batch:${jobData.batchId}`,
        JSON.stringify({
          jobId: job.id,
          platform: jobData.platform,
          type: jobData.type,
          value: jobData.value,
          videoCount: scrapedData.totalCount,
          completedAt: new Date().toISOString(),
        })
      );

      await redis.expire(`results:batch:${jobData.batchId}`, 3600);

      console.log(`[JOB ${job.id}] ✅ COMPLETED\n`);

      return {
        success: true,
        itemsFound: scrapedData.totalCount,
        resultKey,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error(`[JOB ${job.id}] ❌ ERROR:`, errorMsg);

      // Store error in Redis
      const errorKey = `errors:${job.id}`;
      await redis.setex(
        errorKey,
        3600,
        JSON.stringify({
          jobId: job.id,
          error: errorMsg,
          timestamp: new Date().toISOString(),
        })
      );

      // Re-throw để BullMQ trigger retry
      throw error;
    }
  },
  {
    connection: redis,
    concurrency: 2, // Start with 2 để test, increase sau
  }
);

// Event listeners
worker.on('ready', () => {
  console.log('[WORKER] 🟢 Worker ready and listening...');
});

worker.on('completed', (job) => {
  console.log(`[COMPLETED] ✅ Job ${job.id} completed successfully`);
});

worker.on('failed', (job, err) => {
  console.log(
    `[FAILED] ❌ Job ${job?.id} failed after ${job?.attemptsMade} attempts: ${err.message}`
  );

  // If max retries exceeded, it auto goes to failed state
  // BullMQ will handle retry based on config
});

worker.on('active', (job) => {
  console.log(`[ACTIVE] ⚡ Job ${job.id} started processing`);
});

worker.on('stalled', (jobId) => {
  console.warn(`[STALLED] ⚠️  Job ${jobId} stalled (taking too long)`);
});

// Graceful shutdown
async function shutdown() {
  console.log('\n[SHUTDOWN] Closing worker and Redis...');
  await worker.close();
  await redis.quit();
  console.log('[SHUTDOWN] ✅ All connections closed');
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

console.log('[EXTERNAL SCRAPER] 🚀 Starting...');
console.log(`[EXTERNAL SCRAPER] Redis: ${process.env.REDIS_HOST || 'localhost'}:${process.env.REDIS_PORT || '6379'}`);
console.log('[EXTERNAL SCRAPER] Waiting for jobs from queue...\n');
