import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session-auth";
import { oauthStorage } from "@/lib/oauth-storage";
import { publishFacebookVideo } from "@/lib/publish/facebook";

export const runtime = "nodejs";

type Body = {
  accountKey?: string;
  pageRecordId?: string;
  pageId?: string;
  fileUrl?: string;
  title?: string;
  description?: string;
  published?: boolean;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Body;
    const currentUser = await getCurrentUser(request);

    if (!currentUser) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const tenantId = currentUser.tenantId;

    if (!body.fileUrl) {
      return NextResponse.json({ error: "fileUrl is required" }, { status: 400 });
    }

    const pages = await oauthStorage.getAccountPages({
      tenantId,
      accountKey: body.accountKey,
    });
    const page = pages.find((item) =>
      body.pageRecordId
        ? item.id === body.pageRecordId
        : body.pageId
          ? item.pageId === body.pageId
          : item.platform === "facebook" && item.isDefault,
    );

    if (!page) {
      return NextResponse.json({ error: "Page not found" }, { status: 404 });
    }

    if (page.platform !== "facebook") {
      return NextResponse.json(
        { error: "Selected page target is not a Facebook Page" },
        { status: 400 },
      );
    }

    if (!page.pageAccessToken) {
      return NextResponse.json(
        { error: "No page access token available for this page" },
        { status: 400 },
      );
    }

    const result = await publishFacebookVideo({
      postId: "manual",
      tenantId,
      userId: currentUser.id,
      targetId: page.id,
      accountKey: page.accountKey,
      platform: "facebook",
      videoTitle: body.title || "Uploaded video",
      videoUrl: body.fileUrl,
      caption: body.description || body.title || "",
    });

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
