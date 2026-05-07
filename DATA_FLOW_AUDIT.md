# 📊 Data Flow Audit & Trace

Rà soát đầy đủ đường đi của dữ liệu từ UI đến Worker completion.

---

## 🔄 Complete Data Flow

```
┌─────────────────────────────────────────────────────────────────┐
│ STAGE 1: User Input (Browser UI)                               │
├─────────────────────────────────────────────────────────────────┤
│ Component: components/discover/filter-panel.tsx                 │
│                                                                  │
│ Input from User:                                                │
│ {                                                               │
│   platform: "tiktok",                                           │
│   filters: {                                                    │
│     hashtag: "#trending, #viral",  ← Raw string from input    │
│     danh_muc: "dancer",                                         │
│     limit: 5                                                    │
│   }                                                             │
│ }                                                               │
│                                                                  │
│ State: tempFilters (local state)                               │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ STAGE 2: Data Processing (UI Component)                        │
├─────────────────────────────────────────────────────────────────┤
│ Function: handleFind() in filter-panel.tsx                      │
│                                                                  │
│ Transformation:                                                 │
│ Input: { hashtag: "#trending, #viral", ... }                  │
│   ↓                                                              │
│ Split by comma + trim:                                          │
│   hashtag: ["#trending", "#viral"]                             │
│   ↓                                                              │
│ Output: processedFilters                                        │
│ {                                                               │
│   platform: "tiktok",                                           │
│   hashtag: ["#trending", "#viral"],                            │
│   danh_muc: ["dancer"],                                         │
│   limit: 5                                                      │
│ }                                                               │
│                                                                  │
│ State: Zustand store updated                                   │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ STAGE 3: API Request                                            │
├─────────────────────────────────────────────────────────────────┤
│ Function: submitFiltersToRedis() in filter-panel.tsx            │
│                                                                  │
│ HTTP POST /api/filter/decompose                                │
│ Content-Type: application/json                                  │
│                                                                  │
│ Request Body: DecomposeFilterRequest                           │
│ {                                                               │
│   "platform": "tiktok",                                         │
│   "filters": {                                                  │
│     "hashtag": ["#trending", "#viral"],                        │
│     "danh_muc": ["dancer"],                                    │
│     "limit": 5                                                  │
│   }                                                             │
│ }                                                               │
│                                                                  │
│ Status: ✅ Submitted (isSubmitting = true)                     │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ STAGE 4: API Route Handler                                      │
├─────────────────────────────────────────────────────────────────┤
│ File: app/api/filter/decompose/route.ts                        │
│ Function: POST()                                                │
│                                                                  │
│ 1. Parse JSON body                                              │
│ 2. Validate request: validateFilterRequest()                   │
│ 3. Decompose filters: decomposeFilters()                       │
│ 4. Submit to queue: addBulkCrawlJobs()                        │
│                                                                  │
│ Response: JobSubmissionResult                                  │
│ {                                                               │
│   "batchId": "batch-1234567890-abc123",                        │
│   "totalJobs": 3,                                               │
│   "platform": "tiktok",                                         │
│   "message": "Successfully submitted 3 jobs to crawl queue"    │
│ }                                                               │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ STAGE 5: Filter Decomposition                                   │
├─────────────────────────────────────────────────────────────────┤
│ File: lib/filter-decomposer.ts                                 │
│ Function: decomposeFilters()                                    │
│                                                                  │
│ Input: DecomposeFilterRequest                                  │
│ {                                                               │
│   platform: "tiktok",                                           │
│   filters: {                                                    │
│     hashtag: ["#trending", "#viral"],                          │
│     danh_muc: ["dancer"],                                      │
│     limit: 5                                                    │
│   }                                                             │
│ }                                                               │
│                                                                  │
│ Iteration 1:                                                    │
│ key="hashtag", values=["#trending", "#viral"]                 │
│   ↓ forEach value                                               │
│   value="#trending" → jobType="hashtag" (from map)            │
│   → URL: https://www.tiktok.com/tag/%23trending               │
│   → Job 1: {                                                    │
│       jobId: "batch-123-hashtag-0",                            │
│       type: "hashtag",                                          │
│       value: "#trending",                                       │
│       targetUrl: "https://www.tiktok.com/tag/%23trending",   │
│       ...                                                       │
│     }                                                           │
│                                                                  │
│   value="#viral" → Job 2 (similar)                            │
│                                                                  │
│ Iteration 2:                                                    │
│ key="danh_muc", values=["dancer"]                              │
│   → jobType="category" (from map)                              │
│   → URL: https://www.tiktok.com/discover/dancer               │
│   → Job 3: {...}                                               │
│                                                                  │
│ Output: CrawlJobData[] (3 jobs)                                │
│ [                                                               │
│   { jobId: "batch-123-hashtag-0", ... },                       │
│   { jobId: "batch-123-hashtag-1", ... },                       │
│   { jobId: "batch-123-category-0", ... }                       │
│ ]                                                               │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ STAGE 6: Queue Submission to Redis                             │
├─────────────────────────────────────────────────────────────────┤
│ File: lib/queue.ts                                             │
│ Function: addBulkCrawlJobs()                                   │
│                                                                  │
│ BullMQ Operation: queue.addBulk([...])                        │
│                                                                  │
│ For each job:                                                   │
│ queue.addBulk([                                                │
│   {                                                             │
│     name: "crawl",                                              │
│     data: {                                                     │
│       platform: "tiktok",                                       │
│       type: "hashtag",                                          │
│       value: "#trending",                                       │
│       targetUrl: "https://www.tiktok.com/tag/%23trending",   │
│       limit: 5,                                                │
│       jobId: "batch-123-hashtag-0",                            │
│       batchId: "batch-123",                                     │
│       createdAt: "2026-05-07T06:16:12.398Z"                   │
│     },                                                          │
│     opts: { jobId: "batch-123-hashtag-0" }                    │
│   },                                                            │
│   ... (2 more jobs)                                             │
│ ])                                                              │
│                                                                  │
│ Redis Storage:                                                  │
│ bull:crawl-tasks:batch-123-hashtag-0 (Hash)                   │
│ bull:crawl-tasks:batch-123-hashtag-1 (Hash)                   │
│ bull:crawl-tasks:batch-123-category-0 (Hash)                  │
│                                                                  │
│ Queue State: "waiting"                                         │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ STAGE 7: Worker Pickup (Async)                                 │
├─────────────────────────────────────────────────────────────────┤
│ File: scripts/worker.ts                                        │
│ Process: BullMQ Worker listening on "crawl-tasks" queue       │
│                                                                  │
│ Concurrency: 5 jobs simultaneously                              │
│                                                                  │
│ Worker 1: Picks up Job batch-123-hashtag-0                    │
│   State: "active" → Processing                                 │
│                                                                  │
│ Job Data Received:                                              │
│ {                                                               │
│   jobId: "batch-123-hashtag-0",                                │
│   platform: "tiktok",                                           │
│   type: "hashtag",                                              │
│   value: "#trending",                                           │
│   targetUrl: "https://www.tiktok.com/tag/%23trending",       │
│   limit: 5,                                                     │
│   ...                                                           │
│ }                                                               │
│                                                                  │
│ Progress: 0% → 25% → 50% → 75% → 100%                        │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ STAGE 8: Scraper Factory Selection                             │
├─────────────────────────────────────────────────────────────────┤
│ File: lib/scrapers/scraper-factory.ts                          │
│ Function: getScraper(platform)                                 │
│                                                                  │
│ Input: platform = "tiktok"                                     │
│ Output: TikTokScraper instance                                │
│                                                                  │
│ Call: scraper.crawl(url, type)                                 │
│ {                                                               │
│   url: "https://www.tiktok.com/tag/%23trending",              │
│   type: "hashtag"                                              │
│ }                                                               │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ STAGE 9: Scraper Execution (Currently Mock)                    │
├─────────────────────────────────────────────────────────────────┤
│ File: lib/scrapers/scraper-factory.ts                          │
│ Class: TikTokScraper                                           │
│ Function: crawl()                                               │
│                                                                  │
│ ⚠️  CURRENTLY: Mock implementation                             │
│                                                                  │
│ Mock Output:                                                    │
│ {                                                               │
│   platform: "tiktok",                                           │
│   type: "hashtag",                                              │
│   url: "https://www.tiktok.com/tag/%23trending",              │
│   data: {}  ← EMPTY (not scraped)                             │
│ }                                                               │
│                                                                  │
│ TODO: Implement real Playwright scraping                       │
│   - Browser automation                                          │
│   - HTML parsing                                                │
│   - Video extraction                                            │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ STAGE 10: Job Completion                                       │
├─────────────────────────────────────────────────────────────────┤
│ File: scripts/worker.ts                                        │
│ Event: "completed"                                              │
│                                                                  │
│ Job Result:                                                     │
│ {                                                               │
│   jobId: "batch-123-hashtag-0",                                │
│   platform: "tiktok",                                           │
│   type: "hashtag",                                              │
│   value: "#trending",                                           │
│   success: true,                                                │
│   itemsFound: 91,  ← Mock random number                       │
│   completedAt: "2026-05-07T06:16:12.398Z",                   │
│   result: {                                                     │
│     platform: "tiktok",                                         │
│     type: "hashtag",                                            │
│     url: "https://www.tiktok.com/tag/%23trending",            │
│     data: {}                                                    │
│   }                                                             │
│ }                                                               │
│                                                                  │
│ Queue State: "completed"                                       │
│ Auto-remove after: 1 hour (configurable)                      │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🔍 Data Transformation Summary

| Stage | Input                     | Output                           | Location             |
| ----- | ------------------------- | -------------------------------- | -------------------- |
| 1     | Raw user input strings    | String values                    | UI State             |
| 2     | String "#trending,#viral" | Array ["#trending", "#viral"]    | filter-panel.tsx     |
| 3     | ProcessedFilters          | HTTP JSON payload                | fetch request        |
| 4     | Request body              | DecomposeFilterRequest           | API route            |
| 5     | Filters object            | Array of CrawlJobData[] (3 jobs) | filter-decomposer.ts |
| 6     | Jobs array                | Redis Hashes                     | Redis queue          |
| 7     | Redis data                | Job object                       | Worker received      |
| 8     | Platform string           | Scraper instance                 | scraper-factory.ts   |
| 9     | URL + type                | Result object                    | Scraper execution    |
| 10    | Result object             | Final job result                 | Queue completed      |

---

## 🎯 Checkpoints to Verify

### Checkpoint 1: UI State

```typescript
// In browser console
// Access React component state
```

**What to verify:**

- ✅ tempFilters has correct values
- ✅ processedFilters converted correctly
- ✅ API request sent with right data

---

### Checkpoint 2: API Request

```bash
# In browser Network tab
# Check POST /api/filter/decompose

Request:
{
  "platform": "tiktok",
  "filters": {
    "hashtag": ["#trending"],
    "danh_muc": ["dancer"],
    "limit": 5
  }
}

Response:
{
  "batchId": "batch-1234567890-abc123",
  "totalJobs": 2,
  "platform": "tiktok",
  "message": "Successfully submitted 2 jobs..."
}
```

**What to verify:**

- ✅ Request format correct
- ✅ Response has batchId
- ✅ totalJobs count matches expectations

---

### Checkpoint 3: Redis Queue

```bash
# In Redis CLI
redis-cli

# List jobs in queue
> KEYS bull:crawl-tasks:*
# Result should show job IDs

# View specific job
> HGETALL bull:crawl-tasks:batch-123-hashtag-0
# Should show all job data
```

**What to verify:**

- ✅ Jobs in Redis queue
- ✅ Data structure correct
- ✅ jobId format: batch-xxx-key-index

---

### Checkpoint 4: Worker Processing

```bash
# Terminal running: npm run worker

Output should show:
[JOB batch-xxx] Started
[JOB batch-xxx] ✓ Setup complete
[JOB batch-xxx] ✓ Scraper initialized
[JOB batch-xxx] ⧖ Crawling...
[JOB batch-xxx] ✅ SUCCESS
```

**What to verify:**

- ✅ Worker receives job
- ✅ Job processes without errors
- ✅ Job marked as completed
- ✅ Result logged

---

### Checkpoint 5: Job Result

```json
{
  "jobId": "batch-123-hashtag-0",
  "platform": "tiktok",
  "type": "hashtag",
  "value": "#trending",
  "success": true,
  "itemsFound": 91,
  "completedAt": "2026-05-07T06:16:12.398Z",
  "result": {
    "platform": "tiktok",
    "type": "hashtag",
    "url": "https://www.tiktok.com/tag/%23trending",
    "data": {}
  }
}
```

**What to verify:**

- ✅ All fields present
- ✅ Correct platform/type/value
- ✅ Success flag true
- ✅ Result structure valid

---

## 🧪 Testing Script

Create `scripts/audit-data-flow.ts`:

```typescript
import {
  decomposeFilters,
  validateFilterRequest,
} from "@/lib/filter-decomposer";
import { addBulkCrawlJobs } from "@/lib/queue";
import type { DecomposeFilterRequest } from "@/types/job";

async function auditDataFlow() {
  console.log("\n📊 DATA FLOW AUDIT\n");

  // Test data
  const request: DecomposeFilterRequest = {
    platform: "tiktok",
    filters: {
      hashtag: ["#trending", "#viral"],
      danh_muc: ["dancer"],
      limit: 5,
    },
  };

  console.log("📥 STAGE 1: Input Request");
  console.log(JSON.stringify(request, null, 2));

  // Validate
  console.log("\n🔍 STAGE 2: Validation");
  const validation = validateFilterRequest(request);
  console.log("Valid:", validation.valid);

  // Decompose
  console.log("\n⚙️  STAGE 3: Decomposition");
  const jobs = decomposeFilters(request);
  console.log(`Jobs created: ${jobs.length}`);
  jobs.forEach((job, i) => {
    console.log(`  Job ${i + 1}: ${job.type} = ${job.value}`);
  });

  // Submit to queue
  console.log("\n📤 STAGE 4: Queue Submission");
  try {
    const jobIds = await addBulkCrawlJobs(jobs);
    console.log(`Jobs submitted: ${jobIds.length}`);
    jobIds.forEach((id, i) => {
      console.log(`  Job ${i + 1} ID: ${id}`);
    });
  } catch (error) {
    console.error("Error:", error);
  }

  console.log("\n✅ Audit complete!\n");
}

auditDataFlow().catch(console.error);
```

**Run:**

```bash
npm run audit:data-flow  # Add this script to package.json
```

---

## 📋 Audit Checklist

- [ ] UI input captured correctly
- [ ] Strings split to arrays properly
- [ ] API request sent with correct format
- [ ] API response has batchId
- [ ] Jobs created with correct count
- [ ] Job IDs generated with right format
- [ ] Jobs appear in Redis queue
- [ ] Worker receives jobs
- [ ] Worker processes all jobs
- [ ] Results returned with correct structure
- [ ] Data flows end-to-end without loss

---

## 🎯 Next: After Auditing

Once you verify all checkpoints, you'll be confident about:

- ✅ Data integrity at each stage
- ✅ No data loss during transformation
- ✅ Queue reliability
- ✅ Worker reliability

**Then:** Implement real Playwright scraper with confidence! 🚀

---

**Ready to audit?** Let me know which checkpoint you want to verify first!
