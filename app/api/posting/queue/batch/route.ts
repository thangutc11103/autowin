import { NextResponse } from "next/server";
import {
  createQueuedPostBatch,
  type QueuePostTargetInput,
} from "@/lib/database/posting-storage";
import { listUserVideoItemsByIds } from "@/lib/database/video-item-storage";
import { addPublishJob } from "@/lib/queue";
import { getCurrentUser } from "@/lib/auth/session-auth";
import { requireFeature } from "@/lib/auth/access-control";
import { validatePublishingTargets } from "@/lib/posting/target-validation";
import { getCaptionLimitForTargets } from "@/lib/posting/caption-limits";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface BatchQueueItemRequest {
  videoItemId?: string;
  caption?: string;
  scheduledAt?: string;
}

interface BatchQueueRequest {
  idempotencyKey?: string;
  items?: BatchQueueItemRequest[];
  accountTargets?: QueuePostTargetInput[];
}

class BatchQueueValidationError extends Error {}

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

    const body = (await request.json().catch(() => ({}))) as BatchQueueRequest;
    const idempotencyKey = body.idempotencyKey?.trim();
    const items = Array.isArray(body.items) ? body.items : [];
    const accountTargets = Array.isArray(body.accountTargets) ? body.accountTargets : [];

    if (!idempotencyKey) {
      return NextResponse.json({ error: "Missing idempotency key" }, { status: 400 });
    }

    if (items.length === 0) {
      return NextResponse.json({ error: "Select at least one video" }, { status: 400 });
    }

    if (items.length > 50) {
      return NextResponse.json({ error: "Queue at most 50 videos at a time" }, { status: 400 });
    }

    const targetError = await validatePublishingTargets({ request, tenantId, accountTargets });
    if (targetError) return targetError;

    const captionLimit = getCaptionLimitForTargets(accountTargets);
    const now = Date.now();
    const itemIds = items.map((item) => item.videoItemId).filter(Boolean) as string[];

    if (new Set(itemIds).size !== items.length) {
      return NextResponse.json(
        { error: "Each batch item must reference a unique video" },
        { status: 400 },
      );
    }

    const normalizedItems = items.map((item) => {
      const caption = item.caption?.trim() || "";
      const scheduledAt = item.scheduledAt ? new Date(item.scheduledAt) : null;

      if (!item.videoItemId) {
        throw new BatchQueueValidationError("Missing video item");
      }

      if (!caption) {
        throw new BatchQueueValidationError("Caption is required");
      }

      if (caption.length > captionLimit) {
        throw new BatchQueueValidationError(
          `Caption is too long for the selected platform limit (${captionLimit})`,
        );
      }

      if (!scheduledAt || Number.isNaN(scheduledAt.getTime())) {
        throw new BatchQueueValidationError("Invalid scheduled publish time");
      }

      if (scheduledAt.getTime() <= now) {
        throw new BatchQueueValidationError("Scheduled publish time must be in the future");
      }

      return {
        videoItemId: item.videoItemId,
        caption,
        scheduledAt: scheduledAt.toISOString(),
      };
    });

    const readyItems = await listUserVideoItemsByIds({
      tenantId,
      userId: currentUser.id,
      ids: itemIds,
      status: "ready",
    });
    const readyById = new Map(readyItems.map((item) => [item.id, item]));

    if (readyById.size !== itemIds.length) {
      return NextResponse.json(
        { error: "One or more videos are no longer ready" },
        { status: 400 },
      );
    }

    const posts = await createQueuedPostBatch({
      tenantId,
      userId: currentUser.id,
      idempotencyKey,
      accountTargets,
      items: normalizedItems.map((item) => {
        const readyItem = readyById.get(item.videoItemId);
        if (!readyItem) {
          throw new Error("Ready video item was not found");
        }

        return {
          video: readyItem.video,
          caption: item.caption,
          scheduledAt: item.scheduledAt,
        };
      }),
      source: "manual_planner",
      metadata: { source: "manual_planner" },
    });

    await Promise.all(
      posts.flatMap((post) => {
        const delayMs = post.scheduledAt
          ? Math.max(0, new Date(post.scheduledAt).getTime() - Date.now())
          : 0;

        return post.targets.map((target) =>
          addPublishJob({
            tenantId,
            userId: currentUser.id,
            postId: post.id,
            targetId: target.id,
            delayMs,
          }),
        );
      }),
    );

    return NextResponse.json({ success: true, posts });
  } catch (error) {
    console.error("[POST /api/posting/queue/batch]", error);
    const message =
      isUniqueViolation(error)
        ? "This posting plan has already been queued"
        : error instanceof Error
          ? error.message
          : "Failed to queue batch posts";
    const status =
      error instanceof BatchQueueValidationError ? 400 : isUniqueViolation(error) ? 409 : 500;

    return NextResponse.json({ error: message }, { status });
  }
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "23505"
  );
}
