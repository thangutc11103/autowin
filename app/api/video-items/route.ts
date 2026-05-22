import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session-auth";
import {
  listUserVideoItems,
  type UserVideoItemStatus,
} from "@/lib/database/video-item-storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseStatus(value: string | null): UserVideoItemStatus | null {
  if (value === "selected" || value === "ready") {
    return value;
  }

  return null;
}

export async function GET(request: Request) {
  try {
    const currentUser = await getCurrentUser(request);
    if (!currentUser) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 },
      );
    }

    const { searchParams } = new URL(request.url);
    const rawStatus = searchParams.get("status");
    const status = parseStatus(rawStatus);

    if (rawStatus && !status) {
      return NextResponse.json(
        { error: "status must be selected or ready" },
        { status: 400 },
      );
    }

    const items = await listUserVideoItems({
      tenantId: currentUser.tenantId,
      userId: currentUser.id,
      status,
    });

    return NextResponse.json({ items });
  } catch (error) {
    console.error("[GET /api/video-items]", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to load video items",
      },
      { status: 500 },
    );
  }
}
