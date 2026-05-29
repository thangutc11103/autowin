import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { generateCaptionsWithOpenRouter } from "@/lib/ai/openrouter";
import {
  AI_POST_PLANNER_FEATURE,
  buildScheduleSlots,
  getAiMaxItemsPerRequest,
  getAiUsageLimits,
  getItemsPerDay,
  type AiPlanPreset,
  type TimeWindow,
} from "@/lib/ai/post-plan";
import {
  createAiPostPlan,
  getAiUsageSnapshot,
  incrementAiUsage,
} from "@/lib/database/ai-post-plan-storage";
import type { QueuePostTargetInput } from "@/lib/database/posting-storage";
import { listUserVideoItemsByIds } from "@/lib/database/video-item-storage";
import { getCurrentUser } from "@/lib/auth/session-auth";
import { requireFeature } from "@/lib/auth/access-control";
import { validatePublishingTargets } from "@/lib/posting/target-validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface GenerateRequest {
  itemIds?: string[];
  preset?: AiPlanPreset;
  startDate?: string;
  timezone?: string;
  timeWindow?: TimeWindow;
  accountTargets?: QueuePostTargetInput[];
  language?: "vi" | "en";
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

    const body = (await request.json().catch(() => ({}))) as GenerateRequest;
    const itemIds = Array.from(
      new Set(
        Array.isArray(body.itemIds)
          ? body.itemIds.filter((id): id is string => typeof id === "string" && id.length > 0)
          : [],
      ),
    );
    const maxItems = getAiMaxItemsPerRequest();

    if (itemIds.length === 0) {
      return NextResponse.json({ error: "Select at least one ready video" }, { status: 400 });
    }

    if (itemIds.length > maxItems) {
      return NextResponse.json(
        { error: `Select at most ${maxItems} videos per AI request` },
        { status: 400 },
      );
    }

    const accountTargets = Array.isArray(body.accountTargets) ? body.accountTargets : [];
    const targetError = await validatePublishingTargets({ request, tenantId, accountTargets });
    if (targetError) return targetError;

    const startDate = normalizeDate(body.startDate);
    const timezone = body.timezone || "Asia/Bangkok";
    const timeWindow = normalizeTimeWindow(body.timeWindow);
    const preset = body.preset || "1_per_day";
    const itemsPerDay = getItemsPerDay(preset);

    const usage = await getAiUsageSnapshot({
      tenantId,
      userId: currentUser.id,
      feature: AI_POST_PLANNER_FEATURE,
    });
    const limits = getAiUsageLimits();

    if (
      usage.userRequestCount + 1 > limits.userRequestLimit ||
      usage.userItemCount + itemIds.length > limits.userItemLimit ||
      usage.tenantRequestCount + 1 > limits.tenantRequestLimit ||
      usage.tenantItemCount + itemIds.length > limits.tenantItemLimit
    ) {
      return NextResponse.json(
        { error: "AI usage limit exceeded for today" },
        { status: 429 },
      );
    }

    const readyItems = await listUserVideoItemsByIds({
      tenantId,
      userId: currentUser.id,
      ids: itemIds,
      status: "ready",
    });

    if (readyItems.length !== itemIds.length) {
      return NextResponse.json(
        { error: "One or more videos are no longer ready" },
        { status: 400 },
      );
    }

    await incrementAiUsage({
      tenantId,
      userId: currentUser.id,
      feature: AI_POST_PLANNER_FEATURE,
      itemCount: itemIds.length,
    });

    const slots = buildScheduleSlots({
      itemCount: readyItems.length,
      itemsPerDay,
      startDate,
      timezone,
      timeWindow,
    });
    const captions = await generateCaptionsWithOpenRouter({
      language: body.language === "en" ? "en" : "vi",
      items: readyItems.map((item) => ({
        videoItemId: item.id,
        title: item.video.title,
      })),
    });
    const captionByItemId = new Map(captions.map((item) => [item.videoItemId, item.caption]));

    const plan = await createAiPostPlan({
      tenantId,
      userId: currentUser.id,
      preset,
      timezone,
      timeWindow,
      targetPayload: { accountTargets },
      idempotencyKey: randomUUID(),
      items: readyItems.map((item, index) => ({
        videoItemId: item.id,
        caption: captionByItemId.get(item.id) || item.video.title,
        scheduledAt: slots[index],
      })),
    });

    return NextResponse.json({ success: true, plan });
  } catch (error) {
    console.error("[POST /api/ai/post-plan/generate]", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to generate AI post plan",
      },
      { status: 500 },
    );
  }
}

function normalizeDate(value: string | undefined): string {
  if (value && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  }

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  return tomorrow.toISOString().slice(0, 10);
}

function normalizeTimeWindow(value: TimeWindow | undefined): TimeWindow {
  return {
    start: isTime(value?.start) ? value.start : "09:00",
    end: isTime(value?.end) ? value.end : "21:00",
  };
}

function isTime(value: unknown): value is string {
  return typeof value === "string" && /^\d{2}:\d{2}$/.test(value);
}
