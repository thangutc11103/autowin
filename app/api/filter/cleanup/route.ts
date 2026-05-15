import { clearScrapeHistory } from "@/lib/database/scrape-storage";
import { getCrawlQueue } from "@/lib/queue";
import type { Platform } from "@/types/video";
import type { NextRequest } from "next/server";

const VALID_RETENTION_DAYS = new Set([7, 30]);
const VALID_PLATFORMS: Platform[] = [
  "tiktok",
  "douyin",
  "youtube",
  "facebook",
  "instagram",
];

interface CleanupRequest {
  mode?: "queue" | "clear-history" | "retention";
  platform?: Platform;
  retentionDays?: 7 | 30;
}

function isValidPlatform(value: unknown): value is Platform {
  return (
    typeof value === "string" && VALID_PLATFORMS.includes(value as Platform)
  );
}

async function cleanupQueue() {
  const queue = await getCrawlQueue();

  const completedJobs = await queue.getJobs(["completed"], 0, -1);
  const failedJobs = await queue.getJobs(["failed"], 0, -1);

  let cleanedCount = 0;
  let errorCount = 0;

  for (const job of [...completedJobs, ...failedJobs]) {
    try {
      await job.remove();
      cleanedCount++;
    } catch (error) {
      console.error(`[CLEANUP] Failed to remove queue job ${job.id}:`, error);
      errorCount++;
    }
  }

  return {
    cleanedCount,
    errorCount,
    completedRemoved: completedJobs.length,
    failedRemoved: failedJobs.length,
  };
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as CleanupRequest;
    const mode = body.mode || "queue";

    if (body.platform && !isValidPlatform(body.platform)) {
      return Response.json(
        { error: `Invalid platform: ${body.platform}` },
        { status: 400 },
      );
    }

    if (mode === "queue") {
      const queueResult = await cleanupQueue();

      return Response.json({
        success: true,
        mode,
        message: `Cleaned up ${queueResult.cleanedCount} jobs from queue`,
        ...queueResult,
      });
    }

    if (mode === "clear-history") {
      const historyResult = await clearScrapeHistory({
        platform: body.platform,
      });

      return Response.json({
        success: true,
        mode,
        platform: body.platform || "all",
        message: `Cleared ${historyResult.deletedVideos} videos from history`,
        ...historyResult,
      });
    }

    if (mode === "retention") {
      if (
        !body.retentionDays ||
        !VALID_RETENTION_DAYS.has(body.retentionDays)
      ) {
        return Response.json(
          { error: "retentionDays must be 7 or 30" },
          { status: 400 },
        );
      }

      const historyResult = await clearScrapeHistory({
        platform: body.platform,
        olderThanDays: body.retentionDays,
      });

      return Response.json({
        success: true,
        mode,
        platform: body.platform || "all",
        retentionDays: body.retentionDays,
        message: `Deleted ${historyResult.deletedVideos} videos older than ${body.retentionDays} days`,
        ...historyResult,
      });
    }

    return Response.json({ error: `Unsupported cleanup mode: ${mode}` }, {
      status: 400,
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error("[CLEANUP ERROR]", errorMsg);
    return Response.json({ error: errorMsg }, { status: 500 });
  }
}
