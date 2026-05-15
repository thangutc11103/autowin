import type { Platform } from "./video";

export type JobType = "hashtag" | "category" | "account" | "search";

export interface CrawlJobData {
  id: string;
  batchId: string;
  platform: Platform;
  type: JobType;
  value: string;
  targetUrl: string;
  limit: number;
  createdAt: string;
  jobId?: string;
}

export interface DecomposeFilterRequest {
  platform: Platform;
  filters: {
    danh_muc?: string[];
    search?: string[];
    hashtag?: string[];
    ten_kenh_tai_khoan?: string[];
    limit?: number;
  };
}

export interface JobSubmissionResult {
  batchId: string;
  totalJobs: number;
  platform: Platform;
  message: string;
  jobIds?: string[];
}

// Map from filter keys to JobType
export const FILTER_KEY_TO_JOB_TYPE: Record<string, JobType> = {
  danh_muc: "category",
  search: "search",
  hashtag: "hashtag",
  ten_kenh_tai_khoan: "account",
};
