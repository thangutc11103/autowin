import { NextResponse } from "next/server";
import {
  getCaptionLimitForTargets,
  validatePlanItemOverrides,
  type PlanItemOverride,
} from "@/lib/ai/post-plan";
import { approveAiPostPlan } from "@/lib/database/ai-post-plan-storage";
import type { QueuePostTargetInput } from "@/lib/database/posting-storage";
import { addPublishJob } from "@/lib/queue";
import { getCurrentUser } from "@/lib/auth/session-auth";
import { requireFeature } from "@/lib/auth/access-control";
import { validatePublishingTargets } from "@/lib/posting/target-validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface ApproveRequest {
  planId?: string;
  items?: PlanItemOverride[];
  accountTargets?: QueuePostTargetInput[];
}

export async function POST(request: Request) {
  try {
    const currentUser = await getCurrentUser(request);

    if (!currentUser) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const tenantId = currentUser.tenantId;
    const permissionError = await requireFeature({
      request,
      tenantId,
      featureKey: "queue_post",
    });
    if (permissionError) return permissionError;

    const body = (await request.json().catch(() => ({}))) as ApproveRequest;
    if (!body.planId) {
      return NextResponse.json({ error: "Missing planId" }, { status: 400 });
    }

    const accountTargets = Array.isArray(body.accountTargets) ? body.accountTargets : [];
    const targetError = await validatePublishingTargets({ request, tenantId, accountTargets });
    if (targetError) return targetError;

    const captionLimit = getCaptionLimitForTargets(accountTargets);
    const itemOverrides = validatePlanItemOverrides({
      items: Array.isArray(body.items) ? body.items : [],
      captionLimit,
    });

    const approved = await approveAiPostPlan({
      tenantId,
      userId: currentUser.id,
      planId: body.planId,
      itemOverrides,
      accountTargets,
    });

    if (!approved.alreadyApproved) {
      await Promise.all(
        approved.jobs.map((job) =>
          addPublishJob({
            tenantId,
            userId: currentUser.id,
            postId: job.postId,
            targetId: job.targetId,
            delayMs: Math.max(0, new Date(job.scheduledAt).getTime() - Date.now()),
          }),
        ),
      );
    }

    return NextResponse.json({
      success: true,
      alreadyApproved: approved.alreadyApproved,
      enqueuedTargets: approved.jobs.length,
    });
  } catch (error) {
    console.error("[POST /api/ai/post-plan/approve]", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to approve AI post plan",
      },
      { status: 500 },
    );
  }
}
