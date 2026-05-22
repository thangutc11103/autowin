import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session-auth";
import { deleteUserVideoItem } from "@/lib/database/video-item-storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(
  request: Request,
  context: RouteContext<"/api/video-items/[id]">,
) {
  try {
    const currentUser = await getCurrentUser(request);
    if (!currentUser) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 },
      );
    }

    const { id } = await context.params;
    const itemId = id.trim();

    if (!itemId) {
      return NextResponse.json(
        { error: "Video item id is required" },
        { status: 400 },
      );
    }

    const deleted = await deleteUserVideoItem({
      tenantId: currentUser.tenantId,
      userId: currentUser.id,
      id: itemId,
    });

    if (!deleted) {
      return NextResponse.json({ error: "Video item not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[DELETE /api/video-items/[id]]", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to delete video item",
      },
      { status: 500 },
    );
  }
}
