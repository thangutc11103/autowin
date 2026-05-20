/**
 * WORKER SERVICE: Main Entry Point
 * Chạy: npx ts-node scripts/worker.ts
 *
 * File này khởi động Worker để xử lý các job từ Redis queue
 */

// Load .env.local trước tất cả
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { QueueEvents, UnrecoverableError, Worker } from "bullmq";
import { getRedis } from "@/lib/redis";
import {
  POST_QUEUE_NAME,
  SCRAPE_QUEUE_NAME,
  type PublishJobData,
} from "@/lib/queue";
import { ScraperFactory } from "@/lib/scrapers/scraper-factory";
import {
  saveSuccessfulScrape,
  updateScrapedVideoMediaByJobUrl,
} from "@/lib/database/scrape-storage";
import {
  getPublishTargetContext,
  markTargetFailed,
  markTargetPublished,
  markTargetPublishing,
} from "@/lib/database/posting-storage";
import { FacebookPublishError, publishFacebookVideo } from "@/lib/publish/facebook";
import { TikTokPublishError, publishTikTokVideo } from "@/lib/publish/tiktok";
import { resolveMediaWithYtDlp } from "@/lib/media/yt-dlp-resolver";
import type { CrawlJobData } from "@/types/job";
import type { ScrapedVideo } from "@/types/scrape";

const MEDIA_WARMUP_LIMIT = Math.max(
  0,
  Number(process.env.MEDIA_RESOLVE_WARMUP_LIMIT || 8),
);
const MEDIA_WARMUP_CONCURRENCY = Math.max(
  1,
  Number(process.env.MEDIA_RESOLVE_WARMUP_CONCURRENCY || 2),
);
const SCRAPE_WORKER_CONCURRENCY = Math.max(
  1,
  Number(process.env.SCRAPE_WORKER_CONCURRENCY || 2),
);
const POST_WORKER_CONCURRENCY = Math.max(
  1,
  Number(process.env.POST_WORKER_CONCURRENCY || 1),
);
const SCRAPE_JOB_DELAY_MS = Math.max(
  0,
  Number(process.env.SCRAPE_JOB_DELAY_MS || 1000),
);

const SCRAPE_TIMEOUT_BY_PLATFORM_MS: Record<string, number> = {
  tiktok: 10 * 60 * 1000,
  facebook: 12 * 60 * 1000,
  instagram: 12 * 60 * 1000,
  youtube: 10 * 60 * 1000,
};

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timer: NodeJS.Timeout | null = null;
  const timeoutPromise = new Promise<T>((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), timeoutMs);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timer) clearTimeout(timer);
  }) as Promise<T>;
}

function getScrapeTimeoutMs(platform: string): number {
  return SCRAPE_TIMEOUT_BY_PLATFORM_MS[platform] || 10 * 60 * 1000;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isUnrecoverablePublishError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  return (
    error.message.includes("TikTok account is missing") ||
    error.message.includes("content-sharing-guidelines") ||
    error.message.includes("integration guidelines") ||
    error.message.includes("Selected TikTok account was not found") ||
    error.message.includes("No Facebook Page target selected") ||
    error.message.includes("Selected Facebook Page is missing")
  );
}

async function warmupMediaUrls(params: {
  tenantId: string;
  jobId: string;
  videos: ScrapedVideo[];
}) {
  if (MEDIA_WARMUP_LIMIT <= 0) {
    return;
  }

  const pendingVideos = params.videos
    .filter((video) => !video.rawPayload?.mediaVideoUrl)
    .slice(0, MEDIA_WARMUP_LIMIT);

  if (pendingVideos.length === 0) {
    return;
  }

  console.log(
    `[MEDIA] Warming up ${pendingVideos.length} media URL(s) with yt-dlp`,
  );

  let cursor = 0;
  const workers = Array.from({
    length: Math.min(MEDIA_WARMUP_CONCURRENCY, pendingVideos.length),
  }).map(async () => {
    while (cursor < pendingVideos.length) {
      const video = pendingVideos[cursor];
      cursor += 1;

      if (!video) {
        continue;
      }

      const resolved = await resolveMediaWithYtDlp(video.url);

      if (!resolved.success || !resolved.mediaVideoUrl) {
        console.log(
          `[MEDIA] Skip ${video.url}: ${resolved.error || "no media URL"}`,
        );
        continue;
      }

      await updateScrapedVideoMediaByJobUrl({
        tenantId: params.tenantId,
        jobId: params.jobId,
        videoUrl: video.url,
        title: resolved.title,
        thumbnailUrl: resolved.thumbnailUrl,
        rawPayload: {
          ...resolved.rawPayload,
          mediaVideoUrl: resolved.mediaVideoUrl,
          mediaAudioUrl: resolved.mediaAudioUrl,
          ytDlpDuration: resolved.duration,
          ytDlpExtractor: resolved.extractor,
        },
      });

      console.log(`[MEDIA] Resolved preview URL for ${video.url}`);
    }
  });

  await Promise.all(workers);
  console.log("[MEDIA] Warm-up completed");
}

/**
 * Setup Worker Processor
 */
function setupWorker() {
  const connection = getRedis();

  const worker = new Worker<CrawlJobData>(
    SCRAPE_QUEUE_NAME,
    async (job) => {
      const { tenantId, platform, type, value, targetUrl, limit } = job.data;

      console.log(`\n${"=".repeat(60)}`);
      console.log(`[JOB ${job.id}] Started`);
      console.log(`Platform: ${platform} | Type: ${type} | Value: ${value}`);
      console.log(`URL: ${targetUrl}`);
      console.log(`Limit: ${limit}`);
      console.log(`${"=".repeat(60)}`);

      try {
        if (SCRAPE_JOB_DELAY_MS > 0) {
          await sleep(SCRAPE_JOB_DELAY_MS);
        }

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

        const scrapeTimeoutMs = getScrapeTimeoutMs(platform);
        const scrapeResult = await withTimeout(
          scraper.crawl(targetUrl, type, limit, {
            authCookies: job.data.authCookies,
          }),
          scrapeTimeoutMs,
          `Scrape timed out after ${Math.round(scrapeTimeoutMs / 60000)} minutes for ${platform}`,
        );

        if (scrapeResult.error) {
          throw new Error(`Scraper failed: ${scrapeResult.error}`);
        }

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
            const videosArray = scrapeResult.data;

            console.log(
              `[JOB ${job.id}] Converting ${videosArray.length} videos...`,
            );

            const mappedVideos: ScrapedVideo[] = videosArray.map((video) => {
              const mapped = {
                externalId: video.video_id || `${platform}_${video.title}`,
                title: video.title || "Untitled",
                url: video.video_url,
                platform,
                author: video.author || undefined,
                thumbnail: video.thumbnail_url || undefined,
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

            void warmupMediaUrls({
              jobId: dbResult.jobId,
              tenantId,
              videos: mappedVideos,
            }).catch((mediaError) => {
              const mediaMsg =
                mediaError instanceof Error
                  ? mediaError.message
                  : String(mediaError);
              console.error(`[MEDIA] Warm-up failed: ${mediaMsg}`);
            });

            // Log each saved video
            mappedVideos.slice(0, 3).forEach((video, idx) => {
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
      concurrency: SCRAPE_WORKER_CONCURRENCY,
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

function setupPublishWorker() {
  const connection = getRedis();

  const worker = new Worker<PublishJobData>(
    POST_QUEUE_NAME,
    async (job) => {
      const { tenantId, postId, targetId } = job.data;

      console.log(`[PUBLISH ${job.id}] Started post=${postId} target=${targetId}`);

      try {
        await job.updateProgress(20);
        await markTargetPublishing({ tenantId, postId, targetId });

        await job.updateProgress(60);
        const context = await getPublishTargetContext({ tenantId, postId, targetId });

        if (!context) {
          throw new Error("Publish target context not found");
        }

        await job.updateProgress(100);
        if (context.platform === "facebook") {
          const result = await publishFacebookVideo(context);
          await markTargetPublished({
            tenantId,
            postId,
            targetId,
            platformPostId: result.platformPostId,
            platformResponse: result.response,
          });
        } else if (context.platform === "tiktok") {
          const result = await publishTikTokVideo(context);
          await markTargetPublished({
            tenantId,
            postId,
            targetId,
            platformPostId: result.platformPostId,
            platformResponse: result.response,
          });
        } else {
          // Placeholder adapter: real platform publishing APIs plug in here.
          await new Promise((resolve) => setTimeout(resolve, 500));
          await markTargetPublished({
            tenantId,
            postId,
            targetId,
            platformResponse: { mocked: true, platform: context.platform },
          });
        }

        console.log(`[PUBLISH ${job.id}] Completed post=${postId} target=${targetId}`);
        return {
          postId,
          targetId,
          publishedAt: new Date().toISOString(),
          mocked: context.platform !== "facebook",
        };
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        await markTargetFailed({
          tenantId,
          postId,
          targetId,
          error: errorMsg,
          platformResponse:
            error instanceof FacebookPublishError
              ? {
                  response: error.response,
                  fileUrl: error.fileUrl,
                  status: error.status,
                }
              : error instanceof TikTokPublishError
                ? {
                    response: error.response,
                    filePath: error.filePath,
                    endpoint: error.endpoint,
                    status: error.status,
                  }
              : undefined,
        });
        console.error(`[PUBLISH ${job.id}] FAILED: ${errorMsg}`);

        if (isUnrecoverablePublishError(error)) {
          throw new UnrecoverableError(errorMsg);
        }

        throw error;
      }
    },
    {
      connection,
      concurrency: POST_WORKER_CONCURRENCY,
    },
  );

  worker.on("ready", () => {
    console.log("\nPublishing worker READY - Listening for publish jobs...\n");
  });

  worker.on("completed", (job) => {
    console.log(`[PUBLISH EVENT] Job ${job.id} COMPLETED`);
  });

  worker.on("failed", (job, err) => {
    console.error(`[PUBLISH EVENT] Job ${job?.id} FAILED:`, err.message);
  });

  worker.on("error", (err) => {
    console.error("[PUBLISH EVENT] Worker ERROR:", err);
  });

  return worker;
}

/**
 * Setup Queue Events (Global monitoring)
 */
function setupQueueEvents() {
  const connection = getRedis();
  const queueEvents = new QueueEvents(SCRAPE_QUEUE_NAME, { connection });
  const publishQueueEvents = new QueueEvents(POST_QUEUE_NAME, { connection });

  queueEvents.on("added", (data) => {
    console.log(`[QUEUE] Job added: ${data.jobId}`);
  });

  queueEvents.on("completed", (data) => {
    console.log(`[QUEUE] Job completed: ${data.jobId}`);
  });

  queueEvents.on("failed", (data) => {
    console.log(`[QUEUE] Job failed: ${data.jobId}`);
  });

  publishQueueEvents.on("added", (data) => {
    console.log(`[PUBLISH QUEUE] Job added: ${data.jobId}`);
  });

  publishQueueEvents.on("completed", (data) => {
    console.log(`[PUBLISH QUEUE] Job completed: ${data.jobId}`);
  });

  publishQueueEvents.on("failed", (data) => {
    console.log(`[PUBLISH QUEUE] Job failed: ${data.jobId}`);
  });

  return { queueEvents, publishQueueEvents };
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
    const publishWorker = setupPublishWorker();
    const { queueEvents, publishQueueEvents } = setupQueueEvents();

    // Graceful shutdown
    process.on("SIGTERM", async () => {
      console.log("\n\n🛑 Shutting down worker gracefully...");
      await worker.close();
      await publishWorker.close();
      await queueEvents.close();
      await publishQueueEvents.close();
      process.exit(0);
    });

    process.on("SIGINT", async () => {
      console.log("\n\n🛑 Shutting down worker gracefully...");
      await worker.close();
      await publishWorker.close();
      await queueEvents.close();
      await publishQueueEvents.close();
      process.exit(0);
    });
  } catch (error) {
    console.error("❌ Failed to start worker:", error);
    process.exit(1);
  }
}

// Run
start();
