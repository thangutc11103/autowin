# 🚀 Hệ Thống Gửi Filter Lên Redis với BullMQ

Hướng dẫn hoàn chỉnh về cách phân tách filter thành Atomic Jobs và gửi lên Redis Queue.

## 📋 Mục Lục

1. [Khái Niệm](#khái-niệm)
2. [Setup Redis](#setup-redis)
3. [Cấu Trúc Hệ Thống](#cấu-trúc-hệ-thống)
4. [Cách Hoạt Động](#cách-hoạt-động)
5. [Implementation Steps](#implementation-steps)
6. [Testing](#testing)
7. [Production Deployment](#production-deployment)

## 🎯 Khái Niệm

### Atomic Jobs Pattern (Công việc Nguyên Tử)

Thay vì gửi:

```
// ❌ BAD: 1 cục data khổng lồ
{
  platform: 'tiktok',
  hashtags: ['trending', 'viral', 'funny', 'dance', ...], // 100 tags
  accounts: ['user1', 'user2', 'user3', ...],              // 50 accounts
}
```

Chúng ta tách thành:

```
// ✅ GOOD: Hàng trăm job nhỏ
Job 1: { platform: 'tiktok', type: 'hashtag', value: 'trending' }
Job 2: { platform: 'tiktok', type: 'hashtag', value: 'viral' }
Job 3: { platform: 'tiktok', type: 'hashtag', value: 'funny' }
...
Job 101: { platform: 'tiktok', type: 'account', value: 'user1' }
```

### Lợi Ích

| Tính Năng             | Atomic Jobs                        | Monolithic              |
| --------------------- | ---------------------------------- | ----------------------- |
| **Parallel**          | ✅ 10 workers xử lý cùng lúc       | ❌ 1 worker chạy lâu    |
| **Retry**             | ✅ Retry job riêng lẻ              | ❌ Retry toàn bộ        |
| **Error Isolation**   | ✅ 1 job fail không ảnh hưởng khác | ❌ 1 lỗi = toàn bộ fail |
| **Scalability**       | ✅ Dễ thêm worker                  | ❌ Khó mở rộng          |
| **Progress Tracking** | ✅ Từng job có %                   | ❌ Trung bình chung     |

---

## 🔧 Setup Redis

### Option 1: Local Redis (Development)

```bash
# Windows - sử dụng WSL hoặc Docker
docker run -d -p 6379:6379 redis:latest

# Hoặc cài Redis trực tiếp
# Download: https://github.com/microsoftarchive/redis/releases
```

### Option 2: Redis Cloud (Production)

```bash
# Đăng ký tại: https://redis.com/cloud/
# Sẽ lấy được connection string: redis://user:password@host:port
```

### Cấu Hình Environment

Tạo file `.env.local`:

```env
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_DB=0

# Optional: Redis Cloud
# REDIS_HOST=redis-cloud-xxxx.c123.us-east-1-2.ec2.cloud.redislabs.com
# REDIS_PORT=12345
# REDIS_PASSWORD=your_password
```

---

## 📂 Cấu Trúc Hệ Thống

```
find-app/
├── lib/
│   ├── redis.ts                 # Redis connection singleton
│   ├── queue.ts                 # BullMQ queue setup
│   ├── filter-decomposer.ts     # Decompose filters → jobs
│   ├── scrapers/
│   │   └── scraper-factory.ts   # Strategy pattern for scrapers
│   └── workers/
│       └── crawl-worker.example.ts  # Worker processor example
├── app/api/
│   └── filter/
│       └── decompose/
│           └── route.ts         # API endpoint to decompose filters
├── types/
│   └── job.ts                   # Type definitions for jobs
├── components/
│   └── discover/
│       └── filter-panel.tsx     # Updated UI component
└── .env.example
```

---

## 🔄 Cách Hoạt Động

### Flow Diagram

```
┌─────────────────┐
│  Next.js UI     │ (filter-panel.tsx)
│ (Browser)       │
└────────┬────────┘
         │ 1. User nhập filter + click "Find"
         │ POST /api/filter/decompose
         ▼
┌─────────────────────────────────────┐
│ Next.js Server API Route            │ (route.ts)
│ POST /api/filter/decompose          │
│                                     │
│ 1. Validate request                 │
│ 2. Decompose filters → atomic jobs  │
│ 3. Add bulk jobs to Redis queue     │
└────────┬────────────────────────────┘
         │ 2. Job objects
         │ (batchId, platform, type, value)
         ▼
┌──────────────────────────────┐
│  Redis Queue (BullMQ)        │
│  crawl-tasks                 │
│                              │
│ Job 1: #trending             │
│ Job 2: #viral                │
│ Job 3: @user_account         │
│ ...                          │
└────────┬─────────────────────┘
         │ 3. Jobs waiting
         │ to be processed
         ▼
┌──────────────────────────────┐
│  Worker Processors           │
│  (Separate Service/Thread)   │
│                              │
│ Worker 1 → Job 1             │
│ Worker 2 → Job 2             │
│ Worker 3 → Job 3             │
│ ...                          │
└────────┬─────────────────────┘
         │ 4. Crawled data
         │ (videos, metadata)
         ▼
┌──────────────────────────────┐
│  Database / Cache            │
│  (Store results)             │
└──────────────────────────────┘
```

---

## 🛠️ Implementation Steps

### Step 1: Dependencies ✅

```bash
npm install bullmq ioredis
```

**Status**: Đã cài đặt ✅

### Step 2: Tạo Core Files ✅

Các files sau đã được tạo:

- ✅ `lib/redis.ts` - Redis singleton
- ✅ `lib/queue.ts` - BullMQ queue
- ✅ `lib/filter-decomposer.ts` - Logic phân tách filter
- ✅ `app/api/filter/decompose/route.ts` - API endpoint
- ✅ `types/job.ts` - Type definitions
- ✅ `components/discover/filter-panel.tsx` - Updated UI

### Step 3: Tạo Environment Variables

Tạo file `.env.local` (copy từ `.env.example`):

```bash
cp .env.example .env.local
```

### Step 4: Tạo Worker (Next Step)

Bạn cần tạo **Worker Service** riêng để xử lý các job từ queue.

**Option A: Trong cùng project (Development)**

Tạo file `scripts/worker.ts`:

```typescript
// scripts/worker.ts
import { Worker } from "bullmq";
import { getRedis } from "@/lib/redis";
import { ScraperFactory } from "@/lib/scrapers/scraper-factory";
import type { CrawlJobData } from "@/types/job";

async function startWorker() {
  const connection = getRedis();

  const worker = new Worker<CrawlJobData>(
    "crawl-tasks",
    async (job) => {
      console.log(`Processing job: ${job.id}`);
      const { platform, type, targetUrl } = job.data;

      // Use factory pattern
      const scraper = ScraperFactory.getScraper(platform);
      const result = await scraper.crawl(targetUrl, type);

      return result;
    },
    { connection, concurrency: 5 },
  );

  console.log("Worker started, listening for jobs...");
}

startWorker().catch(console.error);
```

Chạy: `ts-node scripts/worker.ts`

**Option B: Separate Service (Production)**

Tạo folder separate cho worker service:

```
worker-service/
├── package.json
├── tsconfig.json
├── src/
│   └── worker.ts
└── .env
```

### Step 5: Test API

```bash
# Start development server
npm run dev

# Test API endpoint
curl -X POST http://localhost:3000/api/filter/decompose \
  -H "Content-Type: application/json" \
  -d '{
    "platform": "tiktok",
    "filters": {
      "hashtag": ["trending", "viral", "funny"],
      "limit": 10
    }
  }'

# Expected response:
# {
#   "batchId": "batch-1234567890-abc123",
#   "totalJobs": 3,
#   "platform": "tiktok",
#   "message": "Successfully submitted 3 jobs to crawl queue"
# }
```

---

## ✅ Testing

### 1. Redis Connection Test

```typescript
// Chạy trong Node terminal
import { getRedis } from "./lib/redis";

const redis = getRedis();
await redis.ping(); // Should return "PONG"
```

### 2. Queue Test

```typescript
import { addCrawlJob } from "./lib/queue";

const jobId = await addCrawlJob({
  platform: "tiktok",
  type: "hashtag",
  value: "trending",
  targetUrl: "https://www.tiktok.com/tag/trending",
  limit: 10,
});

console.log("Job submitted:", jobId);
```

### 3. Filter Decomposition Test

```typescript
import { decomposeFilters } from "./lib/filter-decomposer";

const jobs = decomposeFilters({
  platform: "tiktok",
  filters: {
    hashtag: ["trending", "viral"],
    kenh: ["popular"],
    limit: 5,
  },
});

console.log("Decomposed jobs:", jobs.length); // Should be 3 jobs
```

---

## 🚀 Production Deployment

### 1. Environment Setup

```env
# Production Redis (Redis Cloud)
REDIS_HOST=redis-prod.c123.us-east-1-2.ec2.cloud.redislabs.com
REDIS_PORT=18921
REDIS_PASSWORD=your_secure_password
REDIS_DB=0

# Monitoring
ENABLE_QUEUE_MONITORING=true
QUEUE_LOG_LEVEL=info
```

### 2. Worker Scaling

```typescript
// Advanced: Multi-worker setup
const workers = [
  new Worker("crawl-tasks", processor, { connection, concurrency: 10 }),
  new Worker("crawl-tasks", processor, { connection, concurrency: 10 }),
  new Worker("crawl-tasks", processor, { connection, concurrency: 10 }),
];
```

### 3. Monitoring

Install BullMQ Admin:

```bash
npm install bull-board
```

Setup monitoring dashboard:

```typescript
// app/api/admin/bull-board/route.ts
import { createBullBoard } from "@bull-board/express";
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter";
import { getCrawlQueue } from "@/lib/queue";

const { router } = createBullBoard({
  queues: [new BullMQAdapter(getCrawlQueue())],
});

export { router as GET };
```

Access: `http://localhost:3000/api/admin/bull-board`

### 4. Error Handling & Retry

```typescript
// Tự động retry với backoff exponential
const defaultJobOptions = {
  attempts: 3,
  backoff: {
    type: "exponential",
    delay: 2000, // 2s, 4s, 8s
  },
};
```

---

## 📝 Cheat Sheet

### Job Status Tracking

```typescript
// Lấy job info
const job = await queue.getJob(jobId);
console.log(job?.progress()); // 0-100
console.log(job?.getState()); // waiting, active, completed, failed

// Lấy tất cả job trong batch
const jobs = await queue.getJobs(["waiting", "active", "completed"]);
```

### Remove Jobs

```typescript
// Remove completed jobs
await queue.clean(3600); // Xóa job hoàn thành sau 1 giờ

// Remove failed jobs
await queue.clean(0, 100, "failed");
```

---

## 🎓 Next Steps

1. ✅ Setup Redis & BullMQ
2. ✅ Implement decompose API
3. ✅ Update UI component
4. ⏳ **Implement Worker Processor** (Next)
5. ⏳ Implement ScraperFactory strategies
6. ⏳ Add monitoring & logging
7. ⏳ Deploy to production

---

## 📚 References

- [BullMQ Documentation](https://docs.bullmq.io/)
- [Redis Documentation](https://redis.io/docs/)
- [Playwright Scraping](https://playwright.dev/)

---

**Status**: ✅ 95% Complete - Chỉ cần implement Worker Processor
