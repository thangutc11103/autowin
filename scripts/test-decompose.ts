/**
 * TEST SCRIPT: End-to-End Testing
 * Chạy: npx ts-node scripts/test-decompose.ts
 */

import {
  decomposeFilters,
  validateFilterRequest,
} from "@/lib/filter-decomposer";
import { addBulkCrawlJobs } from "@/lib/queue";
import type { DecomposeFilterRequest } from "@/types/1";

async function testDecomposeFilters() {
  console.log("🧪 Testing Filter Decomposition...\n");

  // Test Case 1: TikTok with multiple filters
  const request: DecomposeFilterRequest = {
    platform: "tiktok",
    filters: {
      hashtag: ["trending", "viral", "funny"],
      kenh: ["popular"],
      limit: 5,
    },
  };

  console.log("📝 Test Request:");
  console.log(JSON.stringify(request, null, 2));
  console.log("\n");

  // Validate
  const validation = validateFilterRequest(request);
  console.log(`✅ Validation: ${validation.valid ? "PASS" : "FAIL"}`);
  if (!validation.valid) {
    console.log(`❌ Error: ${validation.error}`);
    return;
  }
  console.log("\n");

  // Decompose
  const jobs = decomposeFilters(request);
  console.log(`📦 Decomposed Jobs: ${jobs.length}`);
  console.log(JSON.stringify(jobs, null, 2));
  console.log("\n");

  // Validate decomposed jobs
  console.log("🔍 Validating Decomposed Jobs:");
  jobs.forEach((job, index) => {
    const checks = {
      hasPlatform: !!job.platform,
      hasType: !!job.type,
      hasValue: !!job.value,
      hasUrl: !!job.targetUrl,
      hasBatchId: !!job.batchId,
      hasJobId: !!job.jobId,
    };

    const allPass = Object.values(checks).every((v) => v);
    const status = allPass ? "✅" : "❌";
    console.log(`${status} Job ${index + 1}: ${job.value} (${job.type})`);
  });
  console.log("\n");

  // Test Case 2: Try submitting to Redis
  try {
    console.log("📨 Attempting to add jobs to Redis queue...");
    const jobIds = await addBulkCrawlJobs(jobs);
    console.log(`✅ Successfully added ${jobIds.length} jobs to queue`);
    console.log(`Job IDs: ${jobIds.join(", ")}`);
  } catch (error) {
    console.error("❌ Failed to add jobs to queue:", error);
    console.log("💡 Make sure Redis is running on localhost:6379");
  }

  console.log("\n✨ Test Complete!");
}

// Run test
testDecomposeFilters().catch(console.error);
