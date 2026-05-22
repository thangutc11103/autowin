import { NextResponse } from "next/server";
import {
  createQueuedPost,
  listScheduledPosts,
  type QueuePostTargetInput,
} from "@/lib/database/posting-storage";
import { getUserVideoItemById } from "@/lib/database/video-item-storage";
import { addPublishJob } from "@/lib/queue";
import { oauthStorage } from "@/lib/oauth-storage";
import {
  getPublishFeatureKey,
  requireAccountPermission,
  requireFeature,
} from "@/lib/auth/access-control";
import { getCurrentUser } from "@/lib/auth/session-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface QueuePostRequest {
  videoItemId?: string;
  caption?: string;
  publishWindow?: "now" | "schedule";
  scheduledAt?: string | null;
  accountTargets?: QueuePostTargetInput[];
}

export async function GET(request: Request) {
  try {
    const currentUser = await getCurrentUser(request);

    if (!currentUser) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const posts = await listScheduledPosts({
      tenantId: currentUser.tenantId,
      userId:
        currentUser.role !== "owner" &&
        currentUser.role !== "admin"
          ? currentUser.id
          : null,
      limit: 100,
    });
    return NextResponse.json({ posts });
  } catch (error) {
    console.error("[GET /api/posting/queue]", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to load posts",
      },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const currentUser = await getCurrentUser(request);

    if (!currentUser) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const tenantId = currentUser.tenantId;
    const body = (await request.json().catch(() => ({}))) as QueuePostRequest;

    const queuePermissionError = await requireFeature({
      request,
      tenantId,
      featureKey: "queue_post",
    });
    if (queuePermissionError) return queuePermissionError;

    if (!body.videoItemId) {
      return NextResponse.json({ error: "Missing video item" }, { status: 400 });
    }

    const videoItem = await getUserVideoItemById({
      tenantId,
      userId: currentUser.id,
      id: body.videoItemId,
      status: "ready",
    });

    if (!videoItem) {
      return NextResponse.json(
        { error: "Ready video item was not found" },
        { status: 404 },
      );
    }

    if (!body.caption?.trim()) {
      return NextResponse.json({ error: "Missing caption" }, { status: 400 });
    }

    if (
      !Array.isArray(body.accountTargets) ||
      body.accountTargets.length === 0
    ) {
      return NextResponse.json(
        { error: "Select at least one publishing account" },
        { status: 400 },
      );
    }

    for (const target of body.accountTargets) {
      const publishPermissionError = await requireFeature({
        request,
        tenantId,
        featureKey: getPublishFeatureKey(target.platform),
      });
      if (publishPermissionError) return publishPermissionError;

      const accountPermissionError = await requireAccountPermission({
        request,
        tenantId,
        accountKey: target.accountKey,
        action: "post",
      });
      if (accountPermissionError) return accountPermissionError;

      if (target.platform === "facebook" || target.platform === "instagram") {
        if (!target.pageRecordId) {
          return NextResponse.json(
            { error: "Select a Page target for Facebook or Instagram" },
            { status: 400 },
          );
        }

        const pages = await oauthStorage.getAccountPages({
          tenantId,
          accountKey: target.accountKey,
        });
        const selectedPage = pages.find(
          (page) =>
            page.id === target.pageRecordId && page.platform === target.platform,
        );

        if (!selectedPage) {
          return NextResponse.json(
            { error: "Selected Page target was not found for this account" },
            { status: 400 },
          );
        }

        target.accountLabel ||= selectedPage.pageName;
        target.pageName ||= selectedPage.pageName;
      }
    }

    const publishWindow = body.publishWindow === "now" ? "now" : "schedule";
    const scheduledAt =
      publishWindow === "schedule" && body.scheduledAt
        ? new Date(body.scheduledAt).toISOString()
        : null;

    if (publishWindow === "schedule" && !scheduledAt) {
      return NextResponse.json(
        { error: "Select a scheduled publish time" },
        { status: 400 },
      );
    }

    const post = await createQueuedPost({
      tenantId,
      userId: currentUser.id,
      video: videoItem.video,
      caption: body.caption.trim(),
      publishWindow,
      scheduledAt,
      accountTargets: body.accountTargets,
    });

    const delayMs = scheduledAt
      ? Math.max(0, new Date(scheduledAt).getTime() - Date.now())
      : 0;

    await Promise.all(
      post.targets.map((target) =>
        addPublishJob({
          tenantId,
          userId: currentUser.id,
          postId: post.id,
          targetId: target.id,
          delayMs,
        }),
      ),
    );

    return NextResponse.json({ success: true, post });
  } catch (error) {
    console.error("[POST /api/posting/queue]", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to queue post",
      },
      { status: 500 },
    );
  }
}
