# 🔴 Redis Setup Guide - Playwright Scraper Connection

## 📋 Current Redis Configuration

**File:** `lib/redis.ts`

```typescript
new Redis({
  host: process.env.REDIS_HOST || "localhost",
  port: parseInt(process.env.REDIS_PORT || "6379"),
  password: process.env.REDIS_PASSWORD, // Optional, if Redis has password
  db: parseInt(process.env.REDIS_DB || "0"), // Database 0 (default)
  maxRetriesPerRequest: null, // Required for BullMQ
  retryStrategy: (times) => {
    const delay = Math.min(times * 50, 2000);
    return delay;
  },
});
```

**Connection Details:**

- Host: `localhost` (hoặc IP khi chạy Docker)
- Port: `6379` (default) hoặc `6380` (if port conflict)
- Password: `null` (unless configured)
- Database: `0` (default)

---

## 🔑 Redis Key Patterns for BullMQ

### **1. Job Queue Keys**

BullMQ lưu jobs dưới format:

```
bull:crawl-tasks:jobId  → Job data
bull:crawl-tasks:wait   → Job IDs in wait state
bull:crawl-tasks:active → Job IDs in active state
bull:crawl-tasks:completed → Job IDs completed
bull:crawl-tasks:failed → Job IDs failed
```

### **2. Job Data Structure (Hash)**

Mỗi job lưu như Redis Hash:

```redis
HGETALL bull:crawl-tasks:job:123

Result:
{
  "id": "123",
  "data": "{\"platform\":\"tiktok\",\"type\":\"hashtag\",\"value\":\"trending\",\"targetUrl\":\"https://...\",\"limit\":100}",
  "progress": "0",
  "delay": "0",
  "timestamp": "1620000000000",
  "attempts": "0",
  "failedReason": "",
  "returnvalue": ""
}
```

### **3. Custom Result Keys (để lưu scraped data)**

Recommend cấu trúc:

```
results:batchId:jobId → Scraped videos JSON
results:batchId:metadata → Batch metadata
```

---

## 🔌 How External Scraper Connects

### **Option 1: Standalone Node.js Script** (Recommended for testing)

File: `scripts/external-scraper.ts`

```typescript
import Redis from "ioredis";

// 1. Connect to same Redis instance
const redis = new Redis({
  host: process.env.REDIS_HOST || "localhost",
  port: parseInt(process.env.REDIS_PORT || "6379"),
  password: process.env.REDIS_PASSWORD,
  db: 0,
  maxRetriesPerRequest: null,
});

// 2. Listen to job stream
redis.subscribe("bull:crawl-tasks:waiting", (err, count) => {
  if (err) console.error("Failed to subscribe:", err);
  else console.log(`Subscribed to ${count} channel(s)`);
});

redis.on("message", async (channel, message) => {
  console.log(`Received: ${channel} - ${message}`);

  // 3. Fetch job data
  const jobId = message;
  const jobData = await redis.hgetall(`bull:crawl-tasks:job:${jobId}`);

  console.log("Job:", jobData);

  // 4. Process job (call Playwright scraper)
  // const results = await playwrightScraper(jobData);

  // 5. Store results in Redis
  // await redis.set(`results:${jobId}`, JSON.stringify(results));
});
```

### **Option 2: BullMQ Worker Pattern** (Better for production)

```typescript
import { Worker } from "bullmq";
import redis from "./lib/redis";

const worker = new Worker(
  "crawl-tasks",
  async (job) => {
    console.log(`Processing job ${job.id}:`, job.data);

    // Call Playwright scraper
    // const results = await playwrightScraper(job.data);

    // Store results
    // await redis.set(`results:${job.id}`, JSON.stringify(results));

    return { completed: true, itemsFound: 100 };
  },
  {
    connection: redis,
    concurrency: 5,
  },
);

worker.on("completed", (job) => {
  console.log(`✅ Job ${job.id} completed`);
});

worker.on("failed", (job, err) => {
  console.error(`❌ Job ${job.id} failed:`, err.message);
});
```

---

## 📡 Redis Commands for Testing

### **Get all jobs waiting**

```bash
KEYS bull:crawl-tasks:*
LRANGE bull:crawl-tasks:wait 0 -1
```

### **Get specific job data**

```bash
HGETALL bull:crawl-tasks:job:123
HGET bull:crawl-tasks:job:123 data
```

### **Store scraped results**

```bash
SET results:batch-123:job-456 '{"videos": [...], "count": 10}'
EXPIRE results:batch-123:job-456 3600  # TTL 1 hour
```

### **Get stored results**

```bash
GET results:batch-123:job-456
KEYS results:*
```

---

## 🔧 Environment Variables (.env)

```env
# Redis Connection
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=          # Empty if no password
REDIS_DB=0

# For Docker/Production
# REDIS_HOST=redis-container-name
# REDIS_PORT=6379
# REDIS_PASSWORD=your_strong_password
```

---

## ✅ Connection Checklist

### **Before Testing:**

- [ ] Redis server running (`docker run redis` or `redis-cli`)
- [ ] `.env` has correct `REDIS_HOST`, `REDIS_PORT`
- [ ] Test connection: `redis-cli ping` → Should return `PONG`
- [ ] Next.js server running: `npm run dev`
- [ ] Worker running: `npm run worker`

### **Testing Scraper Connection:**

1. **Check Redis keys:**

   ```bash
   redis-cli
   > KEYS bull:crawl-tasks:*
   > LRANGE bull:crawl-tasks:wait 0 -1
   ```

2. **Run external scraper:**

   ```bash
   tsx scripts/external-scraper.ts
   ```

3. **Submit filter via UI:**
   - Fill Discover page filters
   - Click Find
   - Check terminal for "[JOB]" logs

4. **Verify in Redis:**
   ```bash
   redis-cli
   > HGETALL bull:crawl-tasks:job:JOBID
   > GET results:BATCHID:JOBID
   ```

---

## 🚨 Common Issues

### **Issue: "Connection refused"**

```
Error: connect ECONNREFUSED 127.0.0.1:6379
```

**Fix:**

- Redis not running
- Wrong host/port in `.env`
- Check with: `redis-cli ping`

### **Issue: "maxRetriesPerRequest must be null"**

```
Error: Your redis options maxRetriesPerRequest must be null
```

**Fix:** Already in `lib/redis.ts`, ensure BullMQ uses this config

### **Issue: "Job not found"**

```
Job data returns empty
```

**Fix:**

- Job ID may be wrong
- Job may have been cleaned up
- Check `bull:crawl-tasks:completed` if it's already processed

---

## 💡 Best Practices

### **1. Connection Pooling**

✅ Use singleton pattern (already done in `lib/redis.ts`)

```typescript
let redis: Redis;
export function getRedis(): Redis {
  if (!redis) redis = new Redis({...});
  return redis;
}
```

### **2. Error Handling**

```typescript
redis.on("error", (err) => console.error("Redis error:", err));
redis.on("reconnecting", () => console.log("Redis reconnecting..."));
```

### **3. Graceful Shutdown**

```typescript
process.on("SIGTERM", async () => {
  await redis.quit();
  process.exit(0);
});
```

### **4. Result TTL (Time To Live)**

```typescript
// Results auto-delete after 1 hour
await redis.setex(`results:${jobId}`, 3600, JSON.stringify(data));
```

### **5. Batch Results Grouping**

```typescript
// Store all results for a batch
await redis.lpush(`results:batch:${batchId}`, JSON.stringify(result));
await redis.expire(`results:batch:${batchId}`, 3600);
```

---

## 📊 Recommended Testing Flow

1. **Start services:**

   ```bash
   npm run dev:with-worker  # Next.js + Worker
   ```

2. **In another terminal, test Redis:**

   ```bash
   redis-cli
   MONITOR  # Watch all Redis commands
   ```

3. **In another terminal, run external scraper:**

   ```bash
   tsx scripts/external-scraper.ts
   ```

4. **In UI, submit filters and watch:**
   - Terminal logs from worker
   - Redis MONITOR output
   - Job state transitions

---

## 🔗 Next Steps

1. Create `scripts/external-scraper.ts` with BullMQ Worker pattern
2. Implement Playwright scraper for one platform
3. Test end-to-end: UI → Queue → Worker → Results
4. Scale to all 5 platforms
