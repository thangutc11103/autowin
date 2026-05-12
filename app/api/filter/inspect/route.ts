import { getCrawlQueue } from "@/lib/queue";
import type { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const batchId = searchParams.get("batchId");
    const platform = searchParams.get("platform");

    console.log(
      "[INSPECT] Starting inspect with batchId:",
      batchId,
      "platform:",
      platform,
    );

    let queue;
    try {
      queue = await getCrawlQueue();
    } catch (queueErr) {
      console.error("[INSPECT] Error getting queue:", queueErr);
      throw new Error(
        "Failed to connect to Redis queue. Make sure Redis is running and queue is initialized.",
      );
    }

    // Lấy tất cả jobs từ các trạng thái khác nhau
    let waitingJobs = [];
    let activeJobs = [];
    let completedJobs = [];
    let failedJobs = [];

    try {
      waitingJobs = await queue.getJobs(["wait"], 0, -1);
      activeJobs = await queue.getJobs(["active"], 0, -1);
      completedJobs = await queue.getJobs(["completed"], 0, -1);
      failedJobs = await queue.getJobs(["failed"], 0, -1);
    } catch (jobsErr) {
      console.error("[INSPECT] Error fetching jobs:", jobsErr);
      throw new Error("Failed to fetch jobs from queue");
    }

    const allJobs = [
      ...waitingJobs,
      ...activeJobs,
      ...completedJobs,
      ...failedJobs,
    ];

    console.log(`[INSPECT] Total jobs in queue: ${allJobs.length}`);

    // Filter jobs nếu có batchId hoặc platform
    let filteredJobs = allJobs;
    if (batchId) {
      filteredJobs = allJobs.filter(
        (job) => (job.data as any).batchId === batchId,
      );
      console.log(
        `[INSPECT] Filtered by batchId: ${batchId}, found ${filteredJobs.length} jobs`,
      );
    }
    if (platform) {
      filteredJobs = filteredJobs.filter(
        (job) => (job.data as any).platform === platform,
      );
      console.log(
        `[INSPECT] Filtered by platform: ${platform}, found ${filteredJobs.length} jobs`,
      );
    }

    // Create a map of job id to state
    const jobStateMap = new Map<string, string>();
    waitingJobs.forEach((job) => jobStateMap.set(job.id || "", "waiting"));
    activeJobs.forEach((job) => jobStateMap.set(job.id || "", "active"));
    completedJobs.forEach((job) => jobStateMap.set(job.id || "", "completed"));
    failedJobs.forEach((job) => jobStateMap.set(job.id || "", "failed"));

    // Map job data để dễ read
    const jobsData = filteredJobs.map((job) => {
      try {
        return {
          id: job.id || "unknown",
          data: job.data || {},
          state: jobStateMap.get(job.id || "") || "unknown",
          progress: typeof job.progress === "function" ? job.progress() : 0,
          attempts: job.attemptsMade || 0,
          maxAttempts: job.opts?.attempts || 0,
          createdAt: job.timestamp
            ? new Date(job.timestamp).toISOString()
            : new Date().toISOString(),
          processedOn: job.processedOn
            ? new Date(job.processedOn).toISOString()
            : null,
          finishedOn: job.finishedOn
            ? new Date(job.finishedOn).toISOString()
            : null,
        };
      } catch (err) {
        console.error(`[INSPECT] Error mapping job ${job.id}:`, err);
        return {
          id: job.id || "unknown",
          data: {},
          state: jobStateMap.get(job.id || "") || "error",
          progress: 0,
          attempts: 0,
          maxAttempts: 0,
          createdAt: new Date().toISOString(),
          processedOn: null,
          finishedOn: null,
        };
      }
    });

    // Group by batchId
    const groupedByBatch: Record<string, any[]> = {};
    jobsData.forEach((job) => {
      const bid = (job.data as any).batchId || "unknown";
      if (!groupedByBatch[bid]) {
        groupedByBatch[bid] = [];
      }
      groupedByBatch[bid].push(job);
    });

    // Group by state
    const groupedByState: Record<string, any[]> = {};
    jobsData.forEach((job) => {
      const state = job.state || "unknown";
      if (!groupedByState[state]) {
        groupedByState[state] = [];
      }
      groupedByState[state].push(job);
    });

    return Response.json({
      success: true,
      summary: {
        totalJobs: allJobs.length,
        filteredJobs: filteredJobs.length,
        byState: {
          waiting: waitingJobs.length,
          active: activeJobs.length,
          completed: completedJobs.length,
          failed: failedJobs.length,
        },
      },
      filters: {
        batchId: batchId || "none",
        platform: platform || "none",
      },
      jobs: jobsData,
      groupedByBatch,
      groupedByState,
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : "";
    console.error("[INSPECT ERROR]", errorMsg);
    console.error("[INSPECT STACK]", errorStack);
    return Response.json(
      {
        error: `Failed to inspect queue: ${errorMsg}`,
        details: errorStack,
      },
      { status: 500 },
    );
  }
}
