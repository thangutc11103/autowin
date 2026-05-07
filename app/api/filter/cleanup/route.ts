import { getCrawlQueue } from "@/lib/queue";
import type { NextRequest } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const queue = await getCrawlQueue();

    console.log("[CLEANUP] Starting full queue cleanup...");

    // Get all jobs in completed state
    const completedJobs = await queue.getJobs(["completed"], 0, -1);
    const failedJobs = await queue.getJobs(["failed"], 0, -1);

    console.log(
      `[CLEANUP] Found ${completedJobs.length} completed jobs and ${failedJobs.length} failed jobs`,
    );

    let cleanedCount = 0;
    let errorCount = 0;

    // Remove all completed jobs
    for (const job of completedJobs) {
      try {
        await job.remove();
        cleanedCount++;
      } catch (err) {
        console.error(
          `[CLEANUP] Failed to remove completed job ${job.id}:`,
          err,
        );
        errorCount++;
      }
    }

    // Remove all failed jobs
    for (const job of failedJobs) {
      try {
        await job.remove();
        cleanedCount++;
      } catch (err) {
        console.error(`[CLEANUP] Failed to remove failed job ${job.id}:`, err);
        errorCount++;
      }
    }

    console.log(
      `[CLEANUP] Completed. Removed: ${cleanedCount}, Errors: ${errorCount}`,
    );

    return Response.json({
      success: true,
      message: `Cleaned up ${cleanedCount} jobs from queue`,
      completedRemoved: completedJobs.length,
      failedRemoved: failedJobs.length,
      errors: errorCount,
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error("[CLEANUP ERROR]", errorMsg);
    return Response.json({ error: errorMsg }, { status: 500 });
  }
}
