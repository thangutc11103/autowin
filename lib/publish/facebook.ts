import { getFacebookPublicBaseUrl } from "@/lib/app-url";
import { oauthStorage } from "@/lib/oauth-storage";
import type { PublishTargetContext } from "@/lib/database/posting-storage";

interface FacebookVideoResponse {
  id?: string;
  error?: {
    message?: string;
    type?: string;
    code?: number;
    error_subcode?: number;
  };
}

export class FacebookPublishError extends Error {
  response?: FacebookVideoResponse;
  fileUrl?: string;
  status?: number;

  constructor(params: {
    message: string;
    response?: FacebookVideoResponse;
    fileUrl?: string;
    status?: number;
  }) {
    super(params.message);
    this.name = "FacebookPublishError";
    this.response = params.response;
    this.fileUrl = params.fileUrl;
    this.status = params.status;
  }
}

export interface FacebookPublishResult {
  platformPostId: string;
  response: FacebookVideoResponse;
  pageId: string;
}

function toPublicVideoUrl(videoUrl: string): string {
  if (/^https?:\/\//i.test(videoUrl)) {
    const parsed = new URL(videoUrl);

    if (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1") {
      return `${getFacebookPublicBaseUrl()}${parsed.pathname}${parsed.search}`;
    }

    return videoUrl;
  }

  return `${getFacebookPublicBaseUrl()}${videoUrl.startsWith("/") ? "" : "/"}${videoUrl}`;
}

export async function publishFacebookVideo(
  context: PublishTargetContext,
): Promise<FacebookPublishResult> {
  const pages = await oauthStorage.getAccountPages({
    tenantId: context.tenantId,
    accountKey: context.accountKey,
  });
  const facebookPages = pages.filter((page) => page.platform === "facebook");
  const page =
    facebookPages.find((item) => item.isDefault) ||
    (facebookPages.length === 1 ? facebookPages[0] : null);

  if (!page) {
    throw new Error(
      "No Facebook Page target selected. Sync pages and set a default Page in Accounts.",
    );
  }

  if (!page.pageAccessToken) {
    throw new Error("Selected Facebook Page is missing a page access token.");
  }

  const fileUrl = toPublicVideoUrl(context.videoUrl);
  const fileCheck = await fetch(fileUrl, { method: "HEAD" }).catch(() => null);

  if (!fileCheck?.ok) {
    throw new FacebookPublishError({
      message: `Facebook file_url is not publicly reachable: ${fileUrl}`,
      fileUrl,
      status: fileCheck?.status,
    });
  }

  const params = new URLSearchParams({
    access_token: page.pageAccessToken,
    file_url: fileUrl,
    title: context.videoTitle.replace(/\s+/g, " ").slice(0, 120),
    description: context.caption,
    published: "true",
  });
  const response = await fetch(
    `https://graph.facebook.com/v18.0/${page.pageId}/videos`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    },
  );
  const data = (await response.json()) as FacebookVideoResponse;

  if (!response.ok || data.error || !data.id) {
    const message =
      data.error?.message ||
      `Facebook video publish failed with status ${response.status}`;
    throw new FacebookPublishError({
      message,
      response: data,
      fileUrl,
      status: response.status,
    });
  }

  return {
    platformPostId: data.id,
    response: data,
    pageId: page.pageId,
  };
}
