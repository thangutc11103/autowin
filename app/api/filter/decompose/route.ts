import { NextRequest, NextResponse } from "next/server";
import { addBulkCrawlJobs } from "@/lib/queue";
import {
  decomposeFilters,
  validateFilterRequest,
} from "@/lib/filter-decomposer";
import type { DecomposeFilterRequest, JobSubmissionResult } from "@/types/job";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as DecomposeFilterRequest;

    // Validate request
    const validation = validateFilterRequest(body);
    if (!validation.valid) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    // Decompose filters into atomic jobs
    const jobs = decomposeFilters(body);

    if (jobs.length === 0) {
      return NextResponse.json(
        { error: "No valid jobs could be created from the provided filters" },
        { status: 400 },
      );
    }

    // Submit jobs to Redis queue
    const jobIds = await addBulkCrawlJobs(jobs);

    const result: JobSubmissionResult = {
      batchId: jobs[0]?.batchId || "",
      totalJobs: jobIds.length,
      platform: body.platform,
      message: `Successfully submitted ${jobIds.length} jobs to crawl queue`,
    };

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    console.error("Error in decompose endpoint:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Internal server error",
      },
      { status: 500 },
    );
  }
}

// Optional: GET endpoint to check job status (for future implementation)
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const batchId = searchParams.get("batchId");

  if (!batchId) {
    return NextResponse.json(
      { error: "batchId parameter is required" },
      { status: 400 },
    );
  }

  // TODO: Implement job status checking
  // This would query Redis/BullMQ to get job statuses for a given batchId

  return NextResponse.json(
    { message: "Job status checking coming soon" },
    { status: 200 },
  );
}
