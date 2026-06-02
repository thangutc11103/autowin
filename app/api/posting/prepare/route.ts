import { prepareVideoForPosting } from "@/lib/media/local-media-preparer";
import { requireFeature } from "@/lib/auth/access-control";
import { getCurrentUser } from "@/lib/auth/session-auth";
import {
  listUserVideoItemsByIds,
  upsertUserVideoItem,
  type UserVideoItemRecord,
} from "@/lib/database/video-item-storage";
import {
  isR2RequiredButMissing,
  R2_REQUIRED_IN_PRODUCTION_ERROR,
} from "@/lib/storage/r2";
import type { Video } from "@/types/video";
import type { NextRequest } from "next/server";
import { rm } from "fs/promises";

export const runtime = "nodejs";

interface PreparePostingRequest {
  itemIds?: string[];
}

interface PreparePostingFailure {
  id: string;
  title: string;
  error: string;
}

export async function POST(request: NextRequest) {
  try {
    const currentUser = await getCurrentUser(request);

    if (!currentUser) {
      return Response.json({ error: "Authentication required" }, { status: 401 });
    }

    const permissionError = await requireFeature({
      request,
      tenantId: currentUser.tenantId,
      featureKey: "upload_media",
    });
    if (permissionError) return permissionError;

    if (isR2RequiredButMissing()) {
      return Response.json(
        { error: R2_REQUIRED_IN_PRODUCTION_ERROR },
        { status: 500 },
      );
    }

    const body = (await request.json().catch(() => ({}))) as PreparePostingRequest;
    const itemIds = Array.isArray(body.itemIds)
      ? body.itemIds.filter((item): item is string => typeof item === "string" && item.length > 0)
      : [];

    if (itemIds.length === 0) {
      return Response.json(
        { error: "At least one selected item is required" },
        { status: 400 },
      );
    }

    const selectedItems = await listUserVideoItemsByIds({
      tenantId: currentUser.tenantId,
      userId: currentUser.id,
      ids: itemIds,
      status: "selected",
    });

    if (selectedItems.length !== new Set(itemIds).size) {
      return Response.json(
        { error: "One or more selected items were not found" },
        { status: 404 },
      );
    }

    const preparedVideos: Video[] = [];
    const readyItems: UserVideoItemRecord[] = [];
    const failures: PreparePostingFailure[] = [];

    console.log(
      `[POSTING PREPARE] Start tenant=${currentUser.tenantId} user=${currentUser.id} items=${selectedItems.length}`,
    );

    for (const item of selectedItems) {
      try {
        const video = item.video;
        console.log(
          `[POSTING PREPARE] Preparing item=${item.id} video=${video.id} platform=${video.platform} title="${video.title.slice(0, 80)}"`,
        );
        const preparedVideo = await prepareVideoForPosting(video);
        preparedVideos.push(preparedVideo);
        const readyItem = await upsertUserVideoItem({
          tenantId: currentUser.tenantId,
          userId: currentUser.id,
          sourceVideoId: item.sourceVideoId || video.id,
          status: "ready",
          video: preparedVideo,
        });
        readyItems.push(readyItem);
        console.log(
          `[POSTING PREPARE] Ready item=${readyItem.id} video=${preparedVideo.id} source=${preparedVideo.preparedSource || "unknown"}`,
        );
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.error(`[POSTING PREPARE] ${item.video.id} failed: ${errorMsg}`);
        failures.push({
          id: item.video.id,
          title: item.video.title,
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

    console.log(
      `[POSTING PREPARE] Completed tenant=${currentUser.tenantId} user=${currentUser.id} ready=${readyItems.length}`,
    );

    return Response.json({
      success: true,
      items: readyItems,
      preparedVideos,
      failures,
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    return Response.json({ error: errorMsg }, { status: 500 });
  }
}
