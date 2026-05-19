import { getCrawlQueue, SCRAPE_QUEUE_NAME } from "@/lib/queue";
import type { Redis } from "ioredis";
import type { NextRequest } from "next/server";
import {
  DEFAULT_TENANT_ID,
  getTenantIdFromRequest,
} from "@/lib/tenant-context";

interface QueueWithClient {
  client?: Redis;
}

export async function POST(request: NextRequest) {
  try {
    const tenantId = getTenantIdFromRequest(request);
    const { batchId, platform } = await request.json();

    if (!batchId) {
      return Response.json({ error: "batchId is required" }, { status: 400 });
    }

    console.log(`[CLEAR] ============ Starting clear process ============`);
    console.log(`[CLEAR] batchId: ${batchId}, platform: ${platform}`);

    let queue;
    try {
      queue = await getCrawlQueue();
      console.log(`[CLEAR] Queue connected successfully`);
    } catch (err) {
      console.error(`[CLEAR] Failed to connect to queue:`, err);
      throw new Error("Failed to connect to Redis queue");
    }

    // Lấy tất cả jobs trong queue
    console.log(`[CLEAR] Fetching jobs from all states...`);
    const waitingJobs = await queue.getJobs(["wait"], 0, -1);
    const activeJobs = await queue.getJobs(["active"], 0, -1);
    const completedJobs = await queue.getJobs(["completed"], 0, -1);
    const failedJobs = await queue.getJobs(["failed"], 0, -1);

    const allJobs = [
      ...waitingJobs,
      ...activeJobs,
      ...completedJobs,
      ...failedJobs,
    ];

    console.log(`[CLEAR] Total jobs in queue: ${allJobs.length}`);
    console.log(`[CLEAR]   - Waiting: ${waitingJobs.length}`);
    console.log(`[CLEAR]   - Active: ${activeJobs.length}`);
    console.log(`[CLEAR]   - Completed: ${completedJobs.length}`);
    console.log(`[CLEAR]   - Failed: ${failedJobs.length}`);

    // Lọc jobs của batch này
    const batchJobs = allJobs.filter((job) => {
      const jobBatchId = job.data.batchId;
      const jobTenantId = job.data.tenantId || DEFAULT_TENANT_ID;
      const match = jobBatchId === batchId && jobTenantId === tenantId;
      if (match) {
        console.log(
          `[CLEAR] Matched job ${job.id} with batchId: ${jobBatchId}`,
        );
      }
      return match;
    });

    console.log(`[CLEAR] Found ${batchJobs.length} jobs for batch: ${batchId}`);

    if (batchJobs.length === 0) {
      console.log(`[CLEAR] WARNING: No jobs found for batchId ${batchId}`);
      console.log(`[CLEAR] Available batchIds:`, [
        ...new Set(allJobs.map((j) => j.data.batchId)),
      ]);
    }

    // Remove jobs từ queue - try multiple methods for robustness
    let removedCount = 0;
    let errorCount = 0;
    const removedIds: string[] = [];
    const failedIds: string[] = [];

    console.log(`[CLEAR] Attempting to remove ${batchJobs.length} jobs...`);

    for (const job of batchJobs) {
      const jobId = job.id || "unknown";
      const state = await job.getState();

      try {
        console.log(
          `[CLEAR] Attempting to remove job ${jobId} (state: ${state})`,
        );

        // Method 1: Direct remove (works for wait/active/failed)
        try {
          await job.remove();
          console.log(
            `[CLEAR] ✓ Successfully removed job ${jobId} via remove()`,
          );
          removedCount++;
          removedIds.push(jobId);
          continue;
        } catch (removeErr) {
          console.log(
            `[CLEAR] Method 1 failed: ${
              removeErr instanceof Error ? removeErr.message : String(removeErr)
            }`,
          );
          console.log(`[CLEAR] Method 1 failed, trying method 2...`);
        }

        // Method 2: For completed jobs, clean up data directly
        try {
          // Remove job references from Redis
          const client = (queue as unknown as QueueWithClient).client;
          if (client) {
            // Delete job key and references
            await client.del(`bull:${SCRAPE_QUEUE_NAME}:${jobId}`);
            await client.srem(`bull:${SCRAPE_QUEUE_NAME}:completed`, jobId);
            await client.srem(`bull:${SCRAPE_QUEUE_NAME}:active`, jobId);
            await client.srem(`bull:${SCRAPE_QUEUE_NAME}:wait`, jobId);
            await client.srem(`bull:${SCRAPE_QUEUE_NAME}:failed`, jobId);
            await client.srem(`bull:${SCRAPE_QUEUE_NAME}:delayed`, jobId);

            console.log(
              `[CLEAR] ✓ Successfully removed job ${jobId} via Redis`,
            );
            removedCount++;
            removedIds.push(jobId);
            continue;
          }
        } catch (redisErr) {
          console.error(`[CLEAR] Method 2 failed:`, redisErr);
        }

        throw new Error("All removal methods failed");
      } catch (error) {
        console.error(`[CLEAR] ✗ Failed to remove job ${jobId}:`, error);
        errorCount++;
        failedIds.push(jobId);
      }
    }

    console.log(`[CLEAR] ============ Clear process completed ============`);
    console.log(`[CLEAR] Removed: ${removedCount}, Errors: ${errorCount}`);
    if (removedIds.length > 0) {
      console.log(`[CLEAR] Removed IDs:`, removedIds);
    }
    if (failedIds.length > 0) {
      console.log(`[CLEAR] Failed IDs:`, failedIds);
    }

    return Response.json({
      success: true,
      message: `Cleared ${removedCount} jobs from Redis queue`,
      batchId,
      platform,
      removedCount,
      errorCount,
      totalFound: batchJobs.length,
      removedIds,
      failedIds,
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error("[CLEAR ERROR] ============ Exception occurred ============");
    console.error("[CLEAR ERROR]", errorMsg);
    console.error(
      "[CLEAR ERROR] Stack:",
      error instanceof Error ? error.stack : "",
    );
    return Response.json(
      {
        error: errorMsg,
        details: error instanceof Error ? error.stack : String(error),
      },
      { status: 500 },
    );
  }
}
