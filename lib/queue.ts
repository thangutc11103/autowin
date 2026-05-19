import { Queue } from "bullmq";
import { getRedis } from "./redis";
import type { CrawlJobData } from "@/types/job";

export interface PublishJobData {
  tenantId: string;
  postId: string;
  targetId: string;
}

let crawlQueue: Queue<CrawlJobData> | null = null;
let publishQueue: Queue<PublishJobData> | null = null;

export function getCrawlQueue(): Queue<CrawlJobData> {
  if (!crawlQueue) {
    const connection = getRedis();
    crawlQueue = new Queue<CrawlJobData>("crawl-tasks", {
      connection,
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: "exponential",
          delay: 2000,
        },
        removeOnComplete: {
          age: 3600,
          count: 1000,
        },
        removeOnFail: {
          age: 3600, // Keep failed jobs for 1 hour for debugging
        },
      },
    });
  }

  return crawlQueue;
}

export async function addCrawlJob(jobData: CrawlJobData): Promise<string> {
  const queue = getCrawlQueue();
  const job = await queue.add("crawl", jobData, {
    jobId: jobData.jobId ?? jobData.id,
    attempts: jobData.platform === "facebook" ? 1 : undefined,
  });
  return job.id || jobData.id;
}

export async function addBulkCrawlJobs(
  jobsData: CrawlJobData[],
): Promise<string[]> {
  const queue = getCrawlQueue();
  const jobs = await queue.addBulk(
    jobsData.map((data) => ({
      name: "crawl",
      data,
      opts: {
        jobId: data.jobId ?? data.id,
        attempts: data.platform === "facebook" ? 1 : undefined,
      },
    })),
  );
  return jobs.map((job) => job.id || job.data?.id || "unknown");
}

export function getPublishQueue(): Queue<PublishJobData> {
  if (!publishQueue) {
    const connection = getRedis();
    publishQueue = new Queue<PublishJobData>("publish-tasks", {
      connection,
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: "exponential",
          delay: 5000,
        },
        removeOnComplete: {
          age: 24 * 3600,
          count: 1000,
        },
        removeOnFail: {
          age: 24 * 3600,
        },
      },
    });
  }

  return publishQueue;
}

export async function addPublishJob(params: {
  tenantId: string;
  postId: string;
  targetId: string;
  delayMs?: number;
}): Promise<string> {
  const queue = getPublishQueue();
  const job = await queue.add(
    "publish",
      {
        tenantId: params.tenantId,
        postId: params.postId,
        targetId: params.targetId,
    },
    {
      jobId: `publish-${params.targetId}`,
      delay: Math.max(0, params.delayMs || 0),
    },
  );

  return job.id || params.targetId;
}

export async function closeQueue(): Promise<void> {
  if (crawlQueue) {
    await crawlQueue.close();
    crawlQueue = null;
  }

  if (publishQueue) {
    await publishQueue.close();
    publishQueue = null;
  }
}
