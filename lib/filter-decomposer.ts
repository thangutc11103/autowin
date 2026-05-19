/**
 * Filter Decomposer (Simplified)
 *
 * Converts filter requests into crawl jobs.
 * In the new Decodo + Queue solution, this is minimal.
 * Most filtering happens at the scraper level.
 */

import type { CrawlJobData, JobType } from "@/types/job";
import { DEFAULT_TENANT_ID, normalizeTenantId } from "@/lib/tenant-context";

type LegacyFilterType = "hashtag" | "user" | "search";

export interface DecomposeFilterRequest {
  tenantId?: string;
  platform: "tiktok" | "douyin" | "youtube" | "facebook" | "instagram";
  filters: Array<{
    type: LegacyFilterType;
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
  const batchId = `batch-${crypto.randomUUID()}`;
  const tenantId = normalizeTenantId(request.tenantId || DEFAULT_TENANT_ID);

  for (const [index, filter] of request.filters.entries()) {
    const targetUrl = buildTargetUrl(
      request.platform,
      filter.type,
      filter.value,
    );
    const id = `${batchId}-${index}`;

    const job: CrawlJobData = {
      id,
      tenantId,
      batchId,
      platform: request.platform,
      type: mapFilterTypeToJobType(filter.type),
      value: filter.value,
      targetUrl,
      limit: 30,
      createdAt: new Date().toISOString(),
      jobId: id,
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

function mapFilterTypeToJobType(type: LegacyFilterType): JobType {
  if (type === "user") {
    return "account";
  }

  if (type === "search") {
    return "category";
  }

  return type;
}
