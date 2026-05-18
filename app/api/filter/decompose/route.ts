import { addBulkCrawlJobs } from "@/lib/queue";
import { FILTER_KEY_TO_JOB_TYPE } from "@/types/job";
import type {
  CrawlJobData,
  DecomposeFilterRequest,
  JobType,
} from "@/types/job";
import type { NextRequest } from "next/server";

function normalizeInputValue(value: string): string {
  const trimmed = value.trim();

  try {
    const parsed = new URL(trimmed);
    const hostname = parsed.hostname.replace(/^www\./, "");
    const segments = parsed.pathname.split("/").filter(Boolean);

    if (hostname === "instagram.com" && segments[0]) {
      return segments[0].replace(/^@/, "");
    }

    if (hostname === "facebook.com" && segments[0]) {
      return segments[0].replace(/^@/, "");
    }

    if (hostname === "tiktok.com" && segments[0]) {
      return segments[0].replace(/^@/, "");
    }

    if (
      (hostname === "youtube.com" || hostname === "youtu.be") &&
      segments[0]
    ) {
      if (segments[0] === "hashtag" && segments[1]) {
        return segments[1].replace(/^#/, "");
      }

      if (segments[0].startsWith("@")) {
        return segments[0].replace(/^@/, "");
      }
    }
  } catch {
    // Continue with plain username/hashtag cleanup below.
  }

  return trimmed
    .replace(/^#/, "")
    .replace(/^@/, "")
    .replace(/^\/+/, "")
    .replace(/\/+$/, "");
}

function buildTikTokTargetUrl(type: JobType, rawValue: string): string {
  const value = normalizeInputValue(rawValue);

  switch (type) {
    case "category":
      return `https://www.tiktok.com/discover/${encodeURIComponent(value)}`;
    case "search":
      return `https://www.tiktok.com/search?q=${encodeURIComponent(value)}`;
    case "hashtag":
      return `https://www.tiktok.com/tag/${encodeURIComponent(value)}`;
    case "account":
      return `https://www.tiktok.com/@${encodeURIComponent(value)}`;
    default:
      throw new Error(`Unsupported TikTok job type: ${type}`);
  }
}

function buildFacebookTargetUrl(type: JobType, rawValue: string): string {
  const value = normalizeInputValue(rawValue);

  switch (type) {
    case "account":
      return `https://facebook.com/${encodeURIComponent(value)}/reels/`;
    default:
      throw new Error(`Unsupported Facebook job type: ${type}`);
  }
}

function buildYouTubeTargetUrl(type: JobType, rawValue: string): string {
  const value = normalizeInputValue(rawValue);

  switch (type) {
    case "hashtag":
      return `https://www.youtube.com/hashtag/${encodeURIComponent(value)}/shorts`;
    case "account":
      return `https://www.youtube.com/@${encodeURIComponent(value)}/shorts`;
    default:
      throw new Error(`Unsupported YouTube job type: ${type}`);
  }
}

function buildTargetUrl(
  platform: DecomposeFilterRequest["platform"],
  type: JobType,
  value: string,
): string {
  const normalizedValue = normalizeInputValue(value);

  if (!normalizedValue) {
    return "";
  }

  if (platform === "tiktok") {
    return buildTikTokTargetUrl(type, normalizedValue);
  }

  if (platform === "facebook") {
    return type === "account"
      ? buildFacebookTargetUrl(type, normalizedValue)
      : "";
  }

  if (platform === "youtube" && (type === "hashtag" || type === "account")) {
    return buildYouTubeTargetUrl(type, normalizedValue);
  }

  if (type === "hashtag") {
    switch (platform) {
      case "instagram":
        return `https://www.instagram.com/explore/search/keyword/?q=${encodeURIComponent(`#${normalizedValue}`)}`;
      default:
        return "";
    }
  }

  if (type === "account") {
    switch (platform) {
      case "instagram":
        return `https://www.instagram.com/${encodeURIComponent(normalizedValue)}/reels/`;
      default:
        return "";
    }
  }

  switch (platform) {
    case "youtube":
      return `https://www.youtube.com/results?search_query=${encodeURIComponent(normalizedValue)}`;
    case "instagram":
      return `https://www.instagram.com/explore/tags/${encodeURIComponent(normalizedValue)}`;
    default:
      return "";
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as DecomposeFilterRequest;

    if (!body?.platform) {
      return Response.json({ error: "Platform is required" }, { status: 400 });
    }

    if (!body?.filters || typeof body.filters !== "object") {
      return Response.json({ error: "Filters are required" }, { status: 400 });
    }

    const limit =
      typeof body.filters.limit === "number" && body.filters.limit > 0
        ? Math.min(body.filters.limit, 100)
        : 30;

    const batchId = `batch-${crypto.randomUUID()}`;
    const jobs: CrawlJobData[] = [];

    for (const [key, value] of Object.entries(body.filters)) {
      if (key === "limit") {
        continue;
      }

      const type = FILTER_KEY_TO_JOB_TYPE[key];
      if (!type || !Array.isArray(value)) {
        continue;
      }

      for (const rawItem of value) {
        if (typeof rawItem !== "string") {
          continue;
        }

        const normalizedValue = normalizeInputValue(rawItem);
        if (!normalizedValue) {
          continue;
        }

        const targetUrl = buildTargetUrl(body.platform, type, rawItem);
        if (!targetUrl) {
          continue;
        }

        if (
          body.platform === "instagram" &&
          type === "hashtag" &&
          !body.authCookies?.trim()
        ) {
          return Response.json(
            { error: "Instagram hashtag search requires verified cookies" },
            { status: 400 },
          );
        }

        const id = `${batchId}-${jobs.length}`;

        jobs.push({
          id,
          platform: body.platform,
          type,
          value: normalizedValue,
          targetUrl,
          limit,
          batchId,
          createdAt: new Date().toISOString(),
          jobId: id,
          authCookies:
            body.platform === "instagram" && type === "hashtag"
              ? body.authCookies?.trim()
              : undefined,
        });
      }
    }

    if (jobs.length === 0) {
      return Response.json(
        { error: "No valid filters found to submit" },
        { status: 400 },
      );
    }

    const jobIds = await addBulkCrawlJobs(jobs);

    return Response.json({
      batchId,
      jobIds,
      totalJobs: jobs.length,
      platform: body.platform,
      message: `Successfully submitted ${jobs.length} jobs to crawl queue`,
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    return Response.json(
      { error: `Failed to submit filters: ${errorMsg}` },
      { status: 500 },
    );
  }
}
