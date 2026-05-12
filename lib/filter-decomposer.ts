/**
 * Filter Decomposer (Simplified)
 *
 * Converts filter requests into crawl jobs.
 * In the new Decodo + Queue solution, this is minimal.
 * Most filtering happens at the scraper level.
 */

import type { CrawlJobData } from "@/types/job";

export interface DecomposeFilterRequest {
  platform: "tiktok" | "douyin" | "youtube" | "facebook" | "instagram";
  filters: Array<{
    type: "hashtag" | "user" | "search";
    value: string;
  }>;
}

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Validate filter request format
 */
export function validateFilterRequest(
  request: DecomposeFilterRequest,
): ValidationResult {
  if (!request.platform) {
    return { valid: false, error: "Platform is required" };
  }

  if (!request.filters || !Array.isArray(request.filters)) {
    return { valid: false, error: "Filters must be an array" };
  }

  if (request.filters.length === 0) {
    return { valid: false, error: "At least one filter is required" };
  }

  for (const filter of request.filters) {
    if (!filter.type || !filter.value) {
      return {
        valid: false,
        error: "Each filter must have 'type' and 'value' fields",
      };
    }
  }

  return { valid: true };
}

/**
 * Decompose filters into atomic crawl jobs
 * In new solution: 1 filter = 1 job (no complex decomposition needed)
 */
export function decomposeFilters(
  request: DecomposeFilterRequest,
): CrawlJobData[] {
  const jobs: CrawlJobData[] = [];

  for (const filter of request.filters) {
    const targetUrl = buildTargetUrl(
      request.platform,
      filter.type,
      filter.value,
    );

    const job: CrawlJobData = {
      platform: request.platform,
      type: filter.type,
      value: filter.value,
      targetUrl,
      limit: 30, // Default limit
    };

    jobs.push(job);
  }

  return jobs;
}

/**
 * Build target URL based on platform and filter type
 */
function buildTargetUrl(platform: string, type: string, value: string): string {
  switch (platform) {
    case "tiktok":
      if (type === "hashtag") {
        return `https://www.tiktok.com/tag/${encodeURIComponent(value)}`;
      } else if (type === "user") {
        return `https://www.tiktok.com/@${encodeURIComponent(value)}`;
      } else if (type === "search") {
        return `https://www.tiktok.com/search?q=${encodeURIComponent(value)}`;
      }
      break;

    case "douyin":
      if (type === "hashtag") {
        return `https://www.douyin.com/search/${encodeURIComponent(value)}`;
      }
      break;

    case "youtube":
      return `https://www.youtube.com/results?search_query=${encodeURIComponent(value)}`;

    default:
      return "";
  }

  return "";
}
