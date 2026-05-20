import { getCurrentUser } from "@/lib/auth/session-auth";
import { getCrawlQueue } from "@/lib/queue";
import { DEFAULT_TENANT_ID, getTenantIdFromRequest } from "@/lib/tenant-context";
import type { NextRequest } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const tenantId = getTenantIdFromRequest(request);
    const currentUser = await getCurrentUser(request);
    const body = (await request.json().catch(() => ({}))) as { jobId?: string };
    const jobId = body.jobId?.trim();

    if (!jobId) {
      return Response.json({ error: "jobId is required" }, { status: 400 });
    }

    const queue = getCrawlQueue();
    const job = await queue.getJob(jobId);

    if (!job) {
      return Response.json({ error: "Job not found" }, { status: 404 });
    }

    const jobTenantId = job.data.tenantId || DEFAULT_TENANT_ID;
    if (jobTenantId !== tenantId) {
      return Response.json({ error: "Job not found" }, { status: 404 });
    }

    if (currentUser && currentUser.role !== "owner" && currentUser.role !== "admin") {
      if (job.data.userId !== currentUser.id) {
        return Response.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    const state = await job.getState();

    if (state === "completed" || state === "failed") {
      return Response.json({ success: true, message: `Job already ${state}`, state });
    }

    if (state === "waiting" || state === "delayed") {
      await job.remove();
      return Response.json({ success: true, message: "Queued job removed", state });
    }

    if (state === "active") {
      await job.moveToFailed(new Error("Stopped manually by user"), job.token || "0", false);
      return Response.json({ success: true, message: "Active job marked as failed", state });
    }

    return Response.json({ success: false, message: `Unsupported job state: ${state}`, state }, { status: 400 });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    return Response.json({ error: errorMsg }, { status: 500 });
  }
}
