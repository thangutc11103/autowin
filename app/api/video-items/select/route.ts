import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session-auth";
import { getScrapedVideoByIdForUser } from "@/lib/database/scrape-storage";
import { upsertUserVideoItem } from "@/lib/database/video-item-storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const currentUser = await getCurrentUser(request);
    if (!currentUser) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 },
      );
    }

    const body = (await request.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    const sourceVideoId =
      typeof body.videoId === "string"
        ? body.videoId.trim()
        : typeof body.sourceVideoId === "string"
          ? body.sourceVideoId.trim()
          : "";

    if (!sourceVideoId) {
      return NextResponse.json(
        { error: "videoId is required" },
        { status: 400 },
      );
    }

    const video = await getScrapedVideoByIdForUser({
      id: sourceVideoId,
      tenantId: currentUser.tenantId,
      userId: currentUser.id,
    });

    if (!video) {
      return NextResponse.json({ error: "Video not found" }, { status: 404 });
    }

    const item = await upsertUserVideoItem({
      tenantId: currentUser.tenantId,
      userId: currentUser.id,
      sourceVideoId,
      status: "selected",
      video,
    });

    return NextResponse.json({ success: true, item });
  } catch (error) {
    console.error("[POST /api/video-items/select]", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to select video",
      },
      { status: 500 },
    );
  }
}
