/**
 * External Playwright Scraper - Test Phase 2
 * 
 * Chạy: tsx scripts/external-scraper.ts
 * 
 * Lưu ý: Cần Redis server running và Next.js đang chạy để submit jobs
 */

import { Worker } from "bullmq";
import Redis from "ioredis";
import { chromium, type Page } from "playwright";
import {
  closeScrapeStorage,
  ensureScrapeStorage,
  getConfiguredDatabaseHost,
  saveFailedScrape,
  saveSuccessfulScrape,
} from "@/lib/database/scrape-storage";
import type { CrawlJobData } from "@/types/job";
import type { ScrapeResult, ScrapedVideo } from "@/types/scrape";
import type { Platform } from "@/types/video";

// 1. Connect to same Redis instance
const redis = new Redis({
  host: process.env.REDIS_HOST || "localhost",
  port: parseInt(process.env.REDIS_PORT || "6379"),
  password: process.env.REDIS_PASSWORD,
  db: 0,
  maxRetriesPerRequest: null,
});

redis.on("connect", () => {
  console.log("[EXTERNAL SCRAPER] ✅ Connected to Redis");
});

redis.on("error", (err) => {
  console.error("[EXTERNAL SCRAPER] ❌ Redis error:", err.message);
});

const DEFAULT_LIMIT = 10;
const DEFAULT_NAVIGATION_TIMEOUT_MS = 45000;
const DEFAULT_SETTLE_TIMEOUT_MS = 2500;

const PLATFORM_VIDEO_PATTERNS: Record<Platform, RegExp[]> = {
  tiktok: [/\/video\//i],
  douyin: [/\/video\//i],
  youtube: [/\/watch\?/i, /\/shorts\//i],
  facebook: [/\/reel\//i, /\/videos\//i, /\/watch\//i],
  instagram: [/\/reel\//i, /\/p\//i],
};

interface DomCandidate {
  href: string;
  title: string;
  ariaLabel: string;
  text: string;
  thumbnail: string | null;
}

function normalizeAbsoluteUrl(href: string, baseUrl: string): string | null {
  if (!href.trim()) {
    return null;
  }

  try {
    return new URL(href, baseUrl).toString();
  } catch {
    return null;
  }
}

function normalizeTitle(candidate: DomCandidate): string | null {
  const rawTitle = candidate.title || candidate.ariaLabel || candidate.text;
  const normalized = rawTitle.replace(/\s+/g, " ").trim();
  return normalized.length > 0 ? normalized : null;
}

function isVideoUrl(platform: Platform, url: string): boolean {
  return PLATFORM_VIDEO_PATTERNS[platform].some((pattern) => pattern.test(url));
}

function extractVideoId(url: string): string {
  const match = url.match(/(?:video|reel|shorts|watch\/?|v=)([A-Za-z0-9_-]+)/i);
  if (match?.[1]) {
    return match[1];
  }

  return Buffer.from(url).toString("base64url").slice(0, 32);
}

function extractViews(text: string): number | null {
  const match = text.match(/(\d[\d.,]*)\s*(k|m|b)?\s*(views|lượt xem)?/i);
  if (!match) {
    return null;
  }

  const value = Number.parseFloat(match[1].replace(/,/g, ""));
  if (Number.isNaN(value)) {
    return null;
  }

  const multiplier = match[2]?.toLowerCase();
  if (multiplier === "k") {
    return Math.round(value * 1_000);
  }
  if (multiplier === "m") {
    return Math.round(value * 1_000_000);
  }
  if (multiplier === "b") {
    return Math.round(value * 1_000_000_000);
  }

  return Math.round(value);
}

async function autoScroll(page: Page): Promise<void> {
  for (let index = 0; index < 2; index += 1) {
    await page.evaluate(() => {
      window.scrollBy(0, window.innerHeight);
    });
    await page.waitForTimeout(750);
  }
}

async function extractDomCandidates(
  page: Page,
): Promise<DomCandidate[]> {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll<HTMLAnchorElement>("a[href]")).map(
      (anchor) => {
        const image = anchor.querySelector("img");

        return {
          href: anchor.getAttribute("href") ?? "",
          title:
            anchor.getAttribute("title") ??
            image?.getAttribute("alt") ??
            "",
          ariaLabel: anchor.getAttribute("aria-label") ?? "",
          text: anchor.textContent?.trim() ?? "",
          thumbnail: image?.getAttribute("src") ?? null,
        };
      },
    ),
  );
}

function mapCandidatesToVideos(
  jobData: CrawlJobData,
  pageUrl: string,
  candidates: DomCandidate[],
): ScrapedVideo[] {
  const videos: ScrapedVideo[] = [];
  const seenUrls = new Set<string>();
  const limit = jobData.limit ?? DEFAULT_LIMIT;

  for (const candidate of candidates) {
    const absoluteUrl = normalizeAbsoluteUrl(candidate.href, pageUrl);

    if (!absoluteUrl || seenUrls.has(absoluteUrl) || !isVideoUrl(jobData.platform, absoluteUrl)) {
      continue;
    }

    const title = normalizeTitle(candidate);
    if (!title) {
      continue;
    }

    seenUrls.add(absoluteUrl);
    videos.push({
      externalId: extractVideoId(absoluteUrl),
      title,
      url: absoluteUrl,
      platform: jobData.platform,
      views: extractViews(`${candidate.text} ${candidate.ariaLabel}`),
      thumbnail: normalizeAbsoluteUrl(candidate.thumbnail ?? "", pageUrl),
      crawledAt: new Date().toISOString(),
      rawPayload: {
        anchorText: candidate.text,
        ariaLabel: candidate.ariaLabel,
      },
    });

    if (videos.length >= limit) {
      break;
    }
  }

  return videos;
}

async function playwrightScraper(jobData: CrawlJobData): Promise<ScrapeResult> {
  console.log(`[SCRAPER] Scraping ${jobData.platform} - ${jobData.type}: ${jobData.value}`);
  console.log(`[SCRAPER] URL: ${jobData.targetUrl}`);

  const browser = await chromium.launch({
    headless: process.env.PLAYWRIGHT_HEADLESS !== "false",
  });
  const context = await browser.newContext({
    viewport: { width: 1366, height: 768 },
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
  });
  const page = await context.newPage();

  try {
    await page.goto(jobData.targetUrl, {
      waitUntil: "domcontentloaded",
      timeout: DEFAULT_NAVIGATION_TIMEOUT_MS,
    });
    await page.waitForTimeout(DEFAULT_SETTLE_TIMEOUT_MS);
    await autoScroll(page);

    const candidates = await extractDomCandidates(page);
    const videos = mapCandidatesToVideos(jobData, page.url(), candidates);

    return {
      videos,
      totalCount: videos.length,
      platform: jobData.platform,
      scrapedAt: new Date().toISOString(),
    };
  } finally {
    await context.close();
    await browser.close();
  }
}

// 3. Create BullMQ Worker (Better than manual subscription)
const worker = new Worker(
  "crawl-tasks",
  async (job) => {
    console.log(`\n[JOB ${job.id}] ⏳ Processing...`);
    console.log(`[JOB ${job.id}] Data:`, job.data);

    try {
      const jobData = job.data as CrawlJobData;
      const persistedJobId = String(job.id ?? jobData.jobId ?? "");

      const scrapedData = await playwrightScraper(jobData);
      const databaseResult = await saveSuccessfulScrape({
        jobData,
        jobId: persistedJobId,
        result: scrapedData,
      });

      console.log(`[JOB ${job.id}] ✅ Scraped ${scrapedData.totalCount} videos`);
      console.log(`[JOB ${job.id}] 💾 Saved ${databaseResult.savedVideos} videos to Supabase`);

      const resultKey = `results:${jobData.batchId}:${job.id}`;
      await redis.setex(
        resultKey,
        3600,
        JSON.stringify({
          ...scrapedData,
          storedInDatabase: true,
          storedJobId: databaseResult.jobId,
        }),
      );

      console.log(`[JOB ${job.id}] 💾 Stored in Redis: ${resultKey}`);

      await redis.lpush(
        `results:batch:${jobData.batchId}`,
        JSON.stringify({
          jobId: job.id,
          platform: jobData.platform,
          type: jobData.type,
          value: jobData.value,
          videoCount: scrapedData.totalCount,
          completedAt: new Date().toISOString(),
          storedInDatabase: true,
        })
      );

      await redis.expire(`results:batch:${jobData.batchId}`, 3600);

      console.log(`[JOB ${job.id}] ✅ COMPLETED\n`);

      return {
        success: true,
        itemsFound: scrapedData.totalCount,
        resultKey,
        storedInDatabase: true,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error(`[JOB ${job.id}] ❌ ERROR:`, errorMsg);

      const jobData = job.data as CrawlJobData;
      try {
        await saveFailedScrape({
          jobData,
          jobId: String(job.id ?? jobData.jobId ?? ""),
          errorMessage: errorMsg,
        });
      } catch (databaseError) {
        const message =
          databaseError instanceof Error ? databaseError.message : String(databaseError);
        console.error(`[JOB ${job.id}] ❌ DATABASE ERROR:`, message);
      }

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

      throw error;
    }
  },
  {
    connection: redis,
    concurrency: 2,
  }
);

worker.on("ready", () => {
  console.log("[WORKER] 🟢 Worker ready and listening...");
});

worker.on("completed", (job) => {
  console.log(`[COMPLETED] ✅ Job ${job.id} completed successfully`);
});

worker.on("failed", (job, err) => {
  console.log(
    `[FAILED] ❌ Job ${job?.id} failed after ${job?.attemptsMade} attempts: ${err.message}`
  );
});

worker.on("active", (job) => {
  console.log(`[ACTIVE] ⚡ Job ${job.id} started processing`);
});

worker.on("stalled", (jobId) => {
  console.warn(`[STALLED] ⚠️  Job ${jobId} stalled (taking too long)`);
});

async function shutdown() {
  console.log("\n[SHUTDOWN] Closing worker and Redis...");
  await worker.close();
  await closeScrapeStorage();
  await redis.quit();
  console.log("[SHUTDOWN] ✅ All connections closed");
  process.exit(0);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

async function main() {
  console.log("[EXTERNAL SCRAPER] 🚀 Starting...");
  console.log(
    `[EXTERNAL SCRAPER] Redis: ${process.env.REDIS_HOST || "localhost"}:${process.env.REDIS_PORT || "6379"}`,
  );

  await ensureScrapeStorage();
  console.log(
    `[EXTERNAL SCRAPER] Database: ${getConfiguredDatabaseHost() ?? "configured"}`,
  );
  console.log("[EXTERNAL SCRAPER] Waiting for jobs from queue...\n");
}

main().catch(async (error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error("[EXTERNAL SCRAPER] ❌ Startup failed:", message);
  await closeScrapeStorage();
  await redis.quit();
  process.exit(1);
});
