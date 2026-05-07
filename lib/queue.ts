import { Queue } from "bullmq";
import { getRedis } from "./redis";
import type { CrawlJobData } from "@/types/1";

let crawlQueue: Queue<CrawlJobData>;

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
        removeOnComplete: true, // Remove immediately after completion
        removeOnFail: {
          age: 3600, // Keep failed jobs for 1 hour for debugging
        },
      },
    });

    crawlQueue.on("failed", (job, err) => {
      console.error(`Job ${job.id} failed:`, err.message);
    });

    crawlQueue.on("completed", (job) => {
      console.log(`Job ${job.id} completed`);
    });
  }

  return crawlQueue;
}

export async function addCrawlJob(jobData: CrawlJobData): Promise<string> {
  const queue = getCrawlQueue();
  const job = await queue.add("crawl", jobData, {
    jobId: jobData.jobId,
  });
  return job.id;
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
        jobId: data.jobId,
      },
    })),
  );
  return jobs.map((job) => job.id);
}

export async function closeQueue(): Promise<void> {
  if (crawlQueue) {
    await crawlQueue.close();
    crawlQueue = null as any;
  }
}
