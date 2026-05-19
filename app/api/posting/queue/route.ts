import { NextResponse } from "next/server";
import {
  createQueuedPost,
  listScheduledPosts,
  type QueuePostTargetInput,
} from "@/lib/database/posting-storage";
import { addPublishJob } from "@/lib/queue";
import type { Video } from "@/types/video";
import { getTenantIdFromRequest } from "@/lib/tenant-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface QueuePostRequest {
  video?: Video;
  caption?: string;
  publishWindow?: "now" | "schedule";
  scheduledAt?: string | null;
  accountTargets?: QueuePostTargetInput[];
}

export async function GET(request: Request) {
  const tenantId = getTenantIdFromRequest(request);
  const posts = await listScheduledPosts({ tenantId, limit: 100 });
  return NextResponse.json({ posts });
}

export async function POST(request: Request) {
  const tenantId = getTenantIdFromRequest(request);
  const body = (await request.json().catch(() => ({}))) as QueuePostRequest;

  if (!body.video) {
    return NextResponse.json({ error: "Missing video" }, { status: 400 });
  }

  if (!body.caption?.trim()) {
    return NextResponse.json({ error: "Missing caption" }, { status: 400 });
  }

  if (!Array.isArray(body.accountTargets) || body.accountTargets.length === 0) {
    return NextResponse.json(
      { error: "Select at least one publishing account" },
      { status: 400 },
    );
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
    video: body.video,
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
        postId: post.id,
        targetId: target.id,
        delayMs,
      }),
    ),
  );

  return NextResponse.json({ success: true, post });
}
