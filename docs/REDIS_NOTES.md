# 📌 Redis Key Lưu Ý Quan Trọng - Playwright Scraper

## 🔴 1. Current Redis Configuration

```typescript
// Đã setup sẵn trong lib/redis.ts
new Redis({
  host: 'localhost',
  port: 6379,
  maxRetriesPerRequest: null,  // REQUIRED for BullMQ
  db: 0,  // Database 0
})
```

**Lưu ý:** `maxRetriesPerRequest: null` là BẮTBUỘC cho BullMQ!

---

## 📦 2. BullMQ Queue Structure

Mỗi job trong Redis được lưu như này:

```
Queue Name: crawl-tasks

Job States:
├── wait      → Chờ xử lý
├── active    → Đang xử lý
├── completed → Hoàn thành
├── failed    → Lỗi
└── paused    → Tạm dừng

Redis Keys:
bull:crawl-tasks:job:{jobId}        → Job data (Hash)
bull:crawl-tasks:wait               → Job IDs waiting (List)
bull:crawl-tasks:active             → Job IDs active (List)
bull:crawl-tasks:completed          → Job IDs completed (List)
bull:crawl-tasks:failed             → Job IDs failed (List)
```

---

## 🔑 3. Job Data Structure

```bash
# Lấy chi tiết job
redis-cli HGETALL bull:crawl-tasks:job:abc123

Result:
{
  "id": "abc123",
  "data": "{
    \"platform\": \"tiktok\",
    \"type\": \"hashtag\",
    \"value\": \"trending\",
    \"targetUrl\": \"https://tiktok.com/...\",
    \"limit\": 100,
    \"jobId\": \"abc123\",
    \"batchId\": \"batch-123\",
    \"createdAt\": \"2024-01-01T10:00:00Z\"
  }",
  "progress": "0",
  "attempts": "0",
  "timestamp": "1704096000000"
}
```

**Lưu ý:** `data` field là JSON string → cần parse!

```typescript
const jobData = JSON.parse(job.data);
console.log(jobData.platform);  // "tiktok"
```

---

## 📤 4. Storing Results (Scraped Data)

Có 2 cách store results:

### **Cách 1: Individual Result (Per Job)**
```typescript
// Store mỗi job result riêng
const resultKey = `results:${batchId}:${jobId}`;
const resultData = {
  videos: [...],
  totalCount: 100,
  platform: "tiktok",
  completedAt: "2024-01-01T10:05:00Z"
};

await redis.setex(resultKey, 3600, JSON.stringify(resultData));
// TTL 3600 = 1 hour (auto delete)

// Retrieve
const result = await redis.get(resultKey);
const parsed = JSON.parse(result);
```

### **Cách 2: Batch Results (All Jobs in Batch)**
```typescript
// Store tất cả results cho 1 batch
const batchKey = `results:batch:${batchId}`;
const batchResult = {
  jobId: jobId,
  platform: "tiktok",
  videoCount: 100,
  completedAt: "..."
};

await redis.lpush(batchKey, JSON.stringify(batchResult));
await redis.expire(batchKey, 3600);

// Retrieve all results for batch
const allResults = await redis.lrange(batchKey, 0, -1);
// Returns array of JSON strings
```

**Recommend:** Dùng cả 2 cách:
- Per-job: Quick lookup của 1 job
- Batch: Overview của tất cả jobs

---

## 🔌 5. Connection từ External Scraper

```typescript
import { Worker } from 'bullmq';
import Redis from 'ioredis';

// Same config as Next.js server
const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  db: 0,
  maxRetriesPerRequest: null,
});

// Create worker
const worker = new Worker('crawl-tasks', async (job) => {
  const data = job.data;
  
  // Process...
  const results = await playwrightScraper(data);
  
  // Store results
  await redis.setex(
    `results:${data.batchId}:${job.id}`,
    3600,
    JSON.stringify(results)
  );
  
  return { success: true, itemsFound: results.length };
}, {
  connection: redis,
  concurrency: 5,  // Process 5 jobs parallel
});
```

---

## 🚨 6. Error Handling & Retry

BullMQ tự động handle retry:

```
Job fails
  ↓ (delay 2s)
Retry attempt 1
  ↓ (delay 4s)
Retry attempt 2
  ↓ (delay 8s)
Retry attempt 3
  ↓
Fail → Move to 'failed' state
```

Current config (from lib/queue.ts):
```typescript
{
  attempts: 3,
  backoff: {
    type: 'exponential',
    delay: 2000
  }
}
```

**Store errors:**
```typescript
try {
  // Job processing
} catch (error) {
  // Store error in Redis
  await redis.setex(
    `errors:${jobId}`,
    3600,
    JSON.stringify({
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    })
  );
  
  throw error;  // Re-throw để trigger retry
}
```

---

## 🔍 7. Monitoring Commands

```bash
redis-cli

# Check queue size
LLEN bull:crawl-tasks:wait       # Jobs waiting
LLEN bull:crawl-tasks:active     # Currently processing
LLEN bull:crawl-tasks:completed  # Finished
LLEN bull:crawl-tasks:failed     # Errors

# Total all
DBSIZE  # Total keys in Redis

# Find specific result
KEYS results:*               # All results
KEYS results:batch*          # Batch results
KEYS results:BATCHID:*       # Results for specific batch

# Delete old data (if needed)
KEYS results:*
DEL key1 key2 key3          # Delete specific keys

# Monitor live
MONITOR  # See all commands in real-time
```

---

## ⏱️ 8. TTL (Time To Live)

Results auto-delete sau 1 hour:

```typescript
// setex = SET + EXPIRE
redis.setex(key, 3600, value);
// key sẽ tự delete sau 3600 giây

// Check TTL
redis.ttl(key)  // Returns seconds remaining
```

**Custom TTL:**
```typescript
// Keep results 24 hours
await redis.setex(resultKey, 86400, resultData);

// No TTL (keep forever)
await redis.set(resultKey, resultData);
```

---

## 🆘 9. Connection Issues & Fixes

| Issue | Nguyên nhân | Fix |
|-------|-----------|-----|
| "Connection refused" | Redis not running | `docker run -p 6379:6379 redis` |
| "max retries exceeded" | Network instability | Retry policy tự handle |
| "WRONGDB" error | Wrong db number | Ensure db: 0 in config |
| "Auth failed" | Wrong password | Set REDIS_PASSWORD in .env |
| "Timeout" | Slow network | Increase timeout trong config |

---

## 📝 10. Complete External Scraper Template

```typescript
import { Worker } from 'bullmq';
import Redis from 'ioredis';

const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD,
  db: 0,
  maxRetriesPerRequest: null,
});

const worker = new Worker(
  'crawl-tasks',
  async (job) => {
    try {
      console.log(`[JOB] Processing ${job.id}`, job.data);
      
      // 1. Call Playwright scraper
      const results = await playwrightScraper(job.data);
      
      // 2. Store in Redis
      const resultKey = `results:${job.data.batchId}:${job.id}`;
      await redis.setex(resultKey, 3600, JSON.stringify(results));
      
      console.log(`[JOB] ✅ Stored in ${resultKey}`);
      
      return {
        success: true,
        itemsFound: results.length,
        resultKey
      };
      
    } catch (error) {
      console.error(`[JOB] ❌ Error:`, error.message);
      
      // Store error
      await redis.setex(
        `errors:${job.id}`,
        3600,
        JSON.stringify({ error: error.message })
      );
      
      throw error;  // Trigger retry
    }
  },
  {
    connection: redis,
    concurrency: 5,
  }
);

worker.on('completed', (job) => {
  console.log(`[COMPLETED] ✅ Job ${job.id}`);
});

worker.on('failed', (job, err) => {
  console.log(`[FAILED] ❌ Job ${job.id}: ${err.message}`);
});

process.on('SIGINT', async () => {
  await worker.close();
  await redis.quit();
  process.exit(0);
});
```

---

## ✅ Testing Checklist

- [ ] Redis running: `redis-cli ping` → PONG
- [ ] Next.js running: `npm run dev:with-worker`
- [ ] External scraper running: `npm run scraper`
- [ ] Submit filter via UI
- [ ] See "[JOB]" logs in worker terminal
- [ ] See "[SCRAPER]" logs in scraper terminal
- [ ] Check Redis: `redis-cli GET results:*`
- [ ] Verify results stored: `redis-cli LRANGE results:batch:* 0 -1`

Nếu tất cả ✅ → Ready for real Playwright implementation!
