import { getCrawlQueue } from "@/lib/queue";
import type { CrawlJobData } from "@/types/job";
import type { Job } from "bullmq";
import type { NextRequest } from "next/server";
import {
  DEFAULT_TENANT_ID,
  getTenantIdFromRequest,
} from "@/lib/tenant-context";
import { getCurrentUser } from "@/lib/auth/session-auth";

interface InspectJobData {
  id: string;
  data: CrawlJobData | Record<string, never>;
  state: string;
  progress: number | object;
  attempts: number;
  maxAttempts: number;
  createdAt: string;
  processedOn: string | null;
  finishedOn: string | null;
}

function sanitizeJobData(data: CrawlJobData | undefined) {
  if (!data) {
    return {};
  }

  const safeData = { ...data };
  delete safeData.authCookies;
  return safeData;
}

function getJobTenantId(job: Job<CrawlJobData>) {
  return job.data.tenantId || DEFAULT_TENANT_ID;
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const tenantId = getTenantIdFromRequest(request);
    const currentUser = await getCurrentUser(request);
    const batchId = searchParams.get("batchId");
    const platform = searchParams.get("platform");
    const state = searchParams.get("state");
    const includeGroups = searchParams.get("includeGroups") !== "false";
    const limitRaw = Number.parseInt(searchParams.get("limit") || "200", 10);
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 1000) : 200;

    const stateToQueueState: Record<string, "wait" | "active" | "completed" | "failed"> = {
      waiting: "wait",
      active: "active",
      completed: "completed",
      failed: "failed",
    };

    const selectedStates = state
      ? [stateToQueueState[state]].filter(Boolean)
      : ["wait", "active", "completed", "failed"];

    if (selectedStates.length === 0) {
      return Response.json({ error: `Invalid state: ${state}` }, { status: 400 });
    }

    const endIndex = Math.max(limit - 1, 0);

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

    // Lấy jobs theo state được yêu cầu
    let waitingJobs: Job<CrawlJobData>[] = [];
    let activeJobs: Job<CrawlJobData>[] = [];
    let completedJobs: Job<CrawlJobData>[] = [];
    let failedJobs: Job<CrawlJobData>[] = [];

    try {
      if (selectedStates.includes("wait")) {
        waitingJobs = await queue.getJobs(["wait"], 0, endIndex);
      }
      if (selectedStates.includes("active")) {
        activeJobs = await queue.getJobs(["active"], 0, endIndex);
      }
      if (selectedStates.includes("completed")) {
        completedJobs = await queue.getJobs(["completed"], 0, endIndex);
      }
      if (selectedStates.includes("failed")) {
        failedJobs = await queue.getJobs(["failed"], 0, endIndex);
      }
    } catch (jobsErr) {
      console.error("[INSPECT] Error fetching jobs:", jobsErr);
      throw new Error("Failed to fetch jobs from queue");
    }

    const allJobs = [...waitingJobs, ...activeJobs, ...completedJobs, ...failedJobs];

    console.log(`[INSPECT] Total jobs in queue: ${allJobs.length}`);

    // Filter jobs nếu có batchId hoặc platform
    let filteredJobs = allJobs.filter((job) => getJobTenantId(job) === tenantId);
    if (currentUser && currentUser.role !== "owner" && currentUser.role !== "admin") {
      filteredJobs = filteredJobs.filter((job) => job.data.userId === currentUser.id);
    }
    if (batchId) {
      filteredJobs = filteredJobs.filter(
        (job) => job.data.batchId === batchId,
      );
      console.log(
        `[INSPECT] Filtered by batchId: ${batchId}, found ${filteredJobs.length} jobs`,
      );
    }
    if (platform) {
      filteredJobs = filteredJobs.filter(
        (job) => job.data.platform === platform,
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
    const jobsData: InspectJobData[] = filteredJobs.map((job) => {
      try {
        return {
          id: job.id || "unknown",
          data: sanitizeJobData(job.data),
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

    const groupedByBatch: Record<string, InspectJobData[]> = {};
    const groupedByState: Record<string, InspectJobData[]> = {};

    if (includeGroups) {
      jobsData.forEach((job) => {
        const bid = "batchId" in job.data ? job.data.batchId : "unknown";
        if (!groupedByBatch[bid]) {
          groupedByBatch[bid] = [];
        }
        groupedByBatch[bid].push(job);
      });

      jobsData.forEach((job) => {
        const stateKey = job.state || "unknown";
        if (!groupedByState[stateKey]) {
          groupedByState[stateKey] = [];
        }
        groupedByState[stateKey].push(job);
      });
    }

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
        state: state || "all",
        includeGroups,
        limit,
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
