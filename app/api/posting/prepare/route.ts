import { prepareVideoForPosting } from "@/lib/media/local-media-preparer";
import { requireFeature } from "@/lib/auth/access-control";
import { getTenantIdFromRequest } from "@/lib/tenant-context";
import type { Video } from "@/types/video";
import type { NextRequest } from "next/server";
import { rm } from "fs/promises";

export const runtime = "nodejs";

interface PreparePostingRequest {
  videos?: Video[];
}

interface PreparePostingFailure {
  id: string;
  title: string;
  error: string;
}

export async function POST(request: NextRequest) {
  try {
    const tenantId = getTenantIdFromRequest(request);
    const permissionError = await requireFeature({
      request,
      tenantId,
      featureKey: "upload_media",
    });
    if (permissionError) return permissionError;

    const body = (await request.json().catch(() => ({}))) as PreparePostingRequest;
    const videos = Array.isArray(body.videos) ? body.videos : [];

    if (videos.length === 0) {
      return Response.json(
        { error: "At least one video is required" },
        { status: 400 },
      );
    }

    const preparedVideos: Video[] = [];
    const failures: PreparePostingFailure[] = [];

    for (const video of videos) {
      try {
        const preparedVideo = await prepareVideoForPosting(video);
        preparedVideos.push(preparedVideo);
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.error(`[POSTING PREPARE] ${video.id} failed: ${errorMsg}`);
        failures.push({
          id: video.id,
          title: video.title,
          error: errorMsg,
        });
      }
    }

    if (failures.length > 0) {
      await Promise.all(
        preparedVideos.map((video) =>
          video.preparedLocalPath
            ? rm(video.preparedLocalPath, { force: true }).catch(() => undefined)
            : Promise.resolve(),
        ),
      );

      return Response.json(
        {
          error:
            preparedVideos.length > 0
              ? "Some selected videos failed to prepare"
              : "Failed to prepare all selected videos",
          failures,
        },
        { status: 500 },
      );
    }

    return Response.json({
      success: true,
      preparedVideos,
      failures,
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    return Response.json({ error: errorMsg }, { status: 500 });
  }
}
