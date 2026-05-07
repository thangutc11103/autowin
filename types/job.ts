import type { Platform } from "./video";

export type JobType = "hashtag" | "category" | "account";

export interface CrawlJobData {
  platform: Platform;
  type: JobType;
  value: string;
  targetUrl: string;
  limit?: number;
  jobId?: string;
  batchId?: string;
  createdAt?: string;
}

export interface DecomposeFilterRequest {
  platform: Platform;
  filters: {
    danh_muc?: string[];
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
}

// Map from filter keys to JobType
export const FILTER_KEY_TO_JOB_TYPE: Record<string, JobType> = {
  danh_muc: "category",
  hashtag: "hashtag",
  ten_kenh_tai_khoan: "account",
};
