import { addBulkCrawlJobs } from "@/lib/queue";
import { FILTER_KEY_TO_JOB_TYPE } from "@/types/job";
import type { CrawlJobData, DecomposeFilterRequest, JobType } from "@/types/job";
import type { NextRequest } from "next/server";

function normalizeValue(value: string): string {
  return value.replace(/^#/, "").replace(/^@/, "").trim();
}

function buildTargetUrl(
  platform: DecomposeFilterRequest["platform"],
  type: JobType,
  value: string,
): string {
  const normalizedValue = normalizeValue(value);

  if (!normalizedValue) {
    return "";
  }

  if (type === "hashtag") {
    switch (platform) {
      case "tiktok":
        return `https://www.tiktok.com/tag/${encodeURIComponent(normalizedValue)}`;
      case "douyin":
        return `https://www.douyin.com/search/${encodeURIComponent(normalizedValue)}`;
      case "youtube":
        return `https://www.youtube.com/results?search_query=%23${encodeURIComponent(normalizedValue)}`;
      case "facebook":
        return `https://www.facebook.com/hashtag/${encodeURIComponent(normalizedValue)}`;
      case "instagram":
        return `https://www.instagram.com/explore/tags/${encodeURIComponent(normalizedValue)}`;
      default:
        return "";
    }
  }

  if (type === "account") {
    switch (platform) {
      case "tiktok":
        return `https://www.tiktok.com/@${encodeURIComponent(normalizedValue)}`;
      case "youtube":
        return `https://www.youtube.com/@${encodeURIComponent(normalizedValue)}`;
      case "facebook":
        return `https://www.facebook.com/${encodeURIComponent(normalizedValue)}`;
      case "instagram":
        return `https://www.instagram.com/${encodeURIComponent(normalizedValue)}`;
      case "douyin":
        return `https://www.douyin.com/search/${encodeURIComponent(normalizedValue)}`;
      default:
        return "";
    }
  }

  switch (platform) {
    case "tiktok":
      return `https://www.tiktok.com/search?q=${encodeURIComponent(normalizedValue)}`;
    case "youtube":
      return `https://www.youtube.com/results?search_query=${encodeURIComponent(normalizedValue)}`;
    case "facebook":
      return `https://www.facebook.com/search/top?q=${encodeURIComponent(normalizedValue)}`;
    case "instagram":
      return `https://www.instagram.com/explore/tags/${encodeURIComponent(normalizedValue)}`;
    case "douyin":
      return `https://www.douyin.com/search/${encodeURIComponent(normalizedValue)}`;
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

        const normalizedValue = normalizeValue(rawItem);
        if (!normalizedValue) {
          continue;
        }

        const targetUrl = buildTargetUrl(body.platform, type, normalizedValue);
        if (!targetUrl) {
          continue;
        }

        jobs.push({
          platform: body.platform,
          type,
          value: normalizedValue,
          targetUrl,
          limit,
          batchId,
          createdAt: new Date().toISOString(),
        });
      }
    }

    if (jobs.length === 0) {
      return Response.json(
        { error: "No valid filters found to submit" },
        { status: 400 },
      );
    }

    const jobsWithIds = jobs.map((job, index) => ({
      ...job,
      jobId: `${batchId}-${index}`,
    }));

    await addBulkCrawlJobs(jobsWithIds);

    return Response.json({
      batchId,
      totalJobs: jobsWithIds.length,
      platform: body.platform,
      message: `Successfully submitted ${jobsWithIds.length} jobs to crawl queue`,
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    return Response.json(
      { error: `Failed to submit filters: ${errorMsg}` },
      { status: 500 },
    );
  }
}
