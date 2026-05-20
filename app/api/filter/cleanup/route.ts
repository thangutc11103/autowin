import { clearScrapeHistory } from "@/lib/database/scrape-storage";
import { getCrawlQueue } from "@/lib/queue";
import type { Platform } from "@/types/video";
import type { NextRequest } from "next/server";
import {
  DEFAULT_TENANT_ID,
  getTenantIdFromRequest,
} from "@/lib/tenant-context";

const VALID_RETENTION_DAYS = new Set([7, 30]);
const VALID_PLATFORMS: Platform[] = [
  "tiktok",
  "douyin",
  "youtube",
  "facebook",
  "instagram",
];

type QueueCleanupScope = "finished" | "waiting" | "all-non-active";

interface CleanupRequest {
  mode?: "queue" | "clear-history" | "retention";
  platform?: Platform;
  retentionDays?: 7 | 30;
  scope?: QueueCleanupScope;
  confirm?: boolean;
}

const QUEUE_SCOPE_STATES: Record<QueueCleanupScope, Array<"wait" | "completed" | "failed">> = {
  finished: ["completed", "failed"],
  waiting: ["wait"],
  "all-non-active": ["wait", "completed", "failed"],
};

function isValidPlatform(value: unknown): value is Platform {
  return (
    typeof value === "string" && VALID_PLATFORMS.includes(value as Platform)
  );
}

async function cleanupQueue(tenantId: string, scope: QueueCleanupScope) {
  const queue = await getCrawlQueue();
  const states = QUEUE_SCOPE_STATES[scope] || QUEUE_SCOPE_STATES.finished;

  let cleanedCount = 0;
  let errorCount = 0;
  const removedByState = {
    waiting: 0,
    completed: 0,
    failed: 0,
  };

  const belongsToTenant = (job: { data: { tenantId?: string } }) =>
    (job.data.tenantId || DEFAULT_TENANT_ID) === tenantId;

  for (const state of states) {
    const jobs = await queue.getJobs([state], 0, -1);

    for (const job of jobs) {
      if (!belongsToTenant(job)) {
        continue;
      }

      try {
        await job.remove();
        cleanedCount++;
        if (state === "wait") removedByState.waiting++;
        if (state === "completed") removedByState.completed++;
        if (state === "failed") removedByState.failed++;
      } catch (error) {
        console.error(`[CLEANUP] Failed to remove queue job ${job.id}:`, error);
        errorCount++;
      }
    }
  }

  return {
    cleanedCount,
    errorCount,
    removedByState,
  };
}

export async function POST(request: NextRequest) {
  try {
    const tenantId = getTenantIdFromRequest(request);
    const body = (await request.json().catch(() => ({}))) as CleanupRequest;
    const mode = body.mode || "queue";

    if (body.platform && !isValidPlatform(body.platform)) {
      return Response.json(
        { error: `Invalid platform: ${body.platform}` },
        { status: 400 },
      );
    }

    if (mode === "queue") {
      const scope = body.scope || "finished";
      if (!(scope in QUEUE_SCOPE_STATES)) {
        return Response.json(
          { error: `Unsupported queue cleanup scope: ${scope}` },
          { status: 400 },
        );
      }

      if (scope !== "finished" && body.confirm !== true) {
        return Response.json(
          { error: "confirm=true is required for waiting/all-non-active cleanup scope" },
          { status: 400 },
        );
      }

      const queueResult = await cleanupQueue(tenantId, scope);

      return Response.json({
        success: true,
        mode,
        scope,
        message: `Cleaned up ${queueResult.cleanedCount} jobs from queue (${scope})`,
        ...queueResult,
      });
    }

    if (mode === "clear-history") {
      const historyResult = await clearScrapeHistory({
        tenantId,
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
        tenantId,
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
