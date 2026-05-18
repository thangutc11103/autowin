import {
  getScrapedVideoById,
  updateScrapedVideoMediaById,
} from "@/lib/database/scrape-storage";
import { resolveMediaWithYtDlp } from "@/lib/media/yt-dlp-resolver";
import type { NextRequest } from "next/server";
import { createRateLimiter } from "@/lib/rate-limit";

export const runtime = "nodejs";

const rateLimiter = createRateLimiter(60); // 60 requests per minute

interface ResolveVideoRequest {
  id?: string;
}

export async function POST(request: NextRequest) {
  // Rate limiting
  const rateLimitResponse = await rateLimiter(request);
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  try {
    const body = (await request.json().catch(() => ({}))) as ResolveVideoRequest;
    const id = typeof body.id === "string" ? body.id.trim() : "";

    if (!id) {
      return Response.json({ error: "Video id is required" }, { status: 400 });
    }

    const video = await getScrapedVideoById(id);

    if (!video) {
      return Response.json({ error: "Video not found" }, { status: 404 });
    }

    if (video.mediaVideoUrl) {
      return Response.json({
        success: true,
        video,
        cached: true,
      });
    }

    const resolved = await resolveMediaWithYtDlp(video.url);

    if (!resolved.success || !resolved.mediaVideoUrl) {
      return Response.json(
        {
          success: false,
          error: resolved.error || "Failed to resolve media URL",
          video,
        },
        { status: 503 },
      );
    }

    const updatedVideo = await updateScrapedVideoMediaById({
      id,
      title: resolved.title,
      thumbnailUrl: resolved.thumbnailUrl,
      rawPayload: {
        ...resolved.rawPayload,
        mediaVideoUrl: resolved.mediaVideoUrl,
        mediaAudioUrl: resolved.mediaAudioUrl,
        ytDlpDuration: resolved.duration,
        ytDlpExtractor: resolved.extractor,
      },
    });

    return Response.json({
      success: true,
      video: updatedVideo || video,
      cached: false,
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error("[API /videos/resolve] Error:", errorMsg);

    return Response.json({ error: errorMsg }, { status: 500 });
  }
}
