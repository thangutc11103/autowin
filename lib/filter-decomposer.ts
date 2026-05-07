import type {
  CrawlJobData,
  DecomposeFilterRequest,
  JobType,
} from "@/types/job";
import { FILTER_KEY_TO_JOB_TYPE } from "@/types/job";
import type { Platform } from "@/types/video";

const TARGET_URLS: Record<
  Platform,
  Record<JobType, (value: string) => string>
> = {
  tiktok: {
    hashtag: (tag) => `https://www.tiktok.com/tag/${encodeURIComponent(tag)}`,
    category: (cat) =>
      `https://www.tiktok.com/discover/${encodeURIComponent(cat)}`,
    account: (account) => `https://www.tiktok.com/@${account}`,
  },
  douyin: {
    hashtag: (tag) =>
      `https://www.douyin.com/search/${encodeURIComponent(tag)}`,
    category: (cat) =>
      `https://www.douyin.com/discover/${encodeURIComponent(cat)}`,
    account: (account) => `https://www.douyin.com/user/${account}`,
  },
  facebook: {
    hashtag: (tag) =>
      `https://www.facebook.com/search/?q=${encodeURIComponent(tag)}`,
    category: (cat) =>
      `https://www.facebook.com/search/?q=${encodeURIComponent(cat)}`,
    account: (account) =>
      `https://www.facebook.com/search/?q=${encodeURIComponent(account)}`,
  },
  instagram: {
    hashtag: (tag) =>
      `https://www.instagram.com/explore/tags/${encodeURIComponent(tag)}/`,
    category: (cat) =>
      `https://www.instagram.com/explore/tags/${encodeURIComponent(cat)}/`,
    account: (account) => `https://www.instagram.com/${account}/`,
  },
  youtube: {
    hashtag: (tag) =>
      `https://www.youtube.com/results?search_query=${encodeURIComponent(tag)}`,
    category: (cat) =>
      `https://www.youtube.com/results?search_query=${encodeURIComponent(cat)}`,
    account: (account) => `https://www.youtube.com/@${account}`,
  },
};

export function decomposeFilters(
  request: DecomposeFilterRequest,
): CrawlJobData[] {
  const jobs: CrawlJobData[] = [];
  const batchId = `batch-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const { platform, filters } = request;
  const limit = filters.limit || 10;

  // Iterate through each filter type
  Object.entries(filters).forEach(([key, values]) => {
    if (key === "limit" || !values || values.length === 0) {
      return;
    }

    const jobType = FILTER_KEY_TO_JOB_TYPE[key];
    if (!jobType) {
      console.warn(`Unknown filter key: ${key}`);
      return;
    }

    // Ensure values is an array
    const valueArray = Array.isArray(values) ? values : [values];

    valueArray.forEach((value, index) => {
      if (!value || value.toString().trim() === "") {
        return;
      }

      const cleanValue = value.toString().trim();
      const urlBuilder = TARGET_URLS[platform]?.[jobType];

      if (!urlBuilder) {
        console.warn(
          `No URL builder for platform: ${platform}, type: ${jobType}`,
        );
        return;
      }

      const jobId = `${batchId}-${key}-${index}`;
      const job: CrawlJobData = {
        platform,
        type: jobType,
        value: cleanValue,
        targetUrl: urlBuilder(cleanValue),
        limit,
        jobId,
        batchId,
        createdAt: new Date().toISOString(),
      };

      jobs.push(job);
    });
  });

  return jobs;
}

export function validateFilterRequest(request: DecomposeFilterRequest): {
  valid: boolean;
  error?: string;
} {
  if (!request.platform) {
    return { valid: false, error: "Platform is required" };
  }

  if (!request.filters || typeof request.filters !== "object") {
    return { valid: false, error: "Filters object is required" };
  }

  const hasFilters = Object.keys(request.filters).some((key) => {
    if (key === "limit") return false;
    const value = request.filters[key];
    return (
      value &&
      (Array.isArray(value) ? value.length > 0 : value.toString().trim() !== "")
    );
  });

  if (!hasFilters) {
    return { valid: false, error: "At least one filter value is required" };
  }

  return { valid: true };
}
