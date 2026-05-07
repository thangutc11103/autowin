# 🔗 Integration Guide: Complete Step-by-Step

## Phase 1: Development Setup (Local Machine)

### 1.1 Install Dependencies ✅

```bash
npm install bullmq ioredis
```

**Status**: ✅ Already done

### 1.2 Setup Redis Locally

**Option A: Docker (Recommended)**

```bash
# Start Redis container
docker run -d \
  --name find-app-redis \
  -p 6379:6379 \
  redis:latest

# Test connection
docker exec find-app-redis redis-cli ping
# Should output: PONG
```

**Option B: WSL / Linux**

```bash
sudo apt-get install redis-server
sudo service redis-server start
redis-cli ping # Should output: PONG
```

**Option C: Windows (Microsoft Redis)**

Download from: https://github.com/microsoftarchive/redis/releases

### 1.3 Create Environment Files

**Create `.env.local`:**

```env
# Redis Configuration
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_DB=0

# App
NEXT_PUBLIC_API_URL=http://localhost:3000
```

**Create `.env.development` (optional):**

```env
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_DB=0
DEBUG=true
LOG_LEVEL=debug
```

### 1.4 Verify Setup

```bash
# Start Next.js dev server
npm run dev

# In another terminal, test API:
curl -X POST http://localhost:3000/api/filter/decompose \
  -H "Content-Type: application/json" \
  -d '{
    "platform": "tiktok",
    "filters": {
      "hashtag": ["test"],
      "limit": 5
    }
  }'

# Expected Response:
# {
#   "batchId": "batch-xxxx-xxxx",
#   "totalJobs": 1,
#   "platform": "tiktok",
#   "message": "Successfully submitted 1 jobs to crawl queue"
# }
```

---

## Phase 2: Test Decomposition

### 2.1 Run Test Script

```bash
# Requires ts-node to be installed
npx ts-node scripts/test-decompose.ts

# Expected output:
# 🧪 Testing Filter Decomposition...
# 📝 Test Request: {...}
# ✅ Validation: PASS
# 📦 Decomposed Jobs: 3
# [Job 1: trending, Job 2: viral, Job 3: funny]
```

### 2.2 Verify Job Structure

Each decomposed job should have:

```typescript
{
  platform: "tiktok",           // ✅
  type: "hashtag",              // ✅ (category | hashtag | account)
  value: "trending",            // ✅ (cleaned value)
  targetUrl: "https://...",     // ✅ (auto-generated URL)
  limit: 5,                      // ✅
  jobId: "batch-xxx-0",          // ✅ (unique ID)
  batchId: "batch-xxx",          // ✅ (group ID)
  createdAt: "2024-01-01T..."   // ✅
}
```

---

## Phase 3: Worker Processor Setup

### 3.1 Option A: In-Process Worker (Development)

Great for testing, not suitable for production.

**Add to `package.json` scripts:**

```json
{
  "scripts": {
    "dev": "next dev",
    "dev:with-worker": "concurrently \"next dev\" \"npx ts-node scripts/worker.ts\"",
    "worker": "npx ts-node scripts/worker.ts",
    "test:decompose": "npx ts-node scripts/test-decompose.ts"
  }
}
```

**Run development with worker:**

```bash
npm run dev:with-worker

# Or in separate terminals:
# Terminal 1: npm run dev
# Terminal 2: npm run worker
```

### 3.2 Option B: Separate Worker Service (Production)

Create a separate service directory:

```bash
# Create worker service
mkdir worker-service
cd worker-service
npm init -y

# Install deps
npm install bullmq ioredis ts-node typescript
```

**`worker-service/src/index.ts`:**

```typescript
import { Worker } from "bullmq";
import Redis from "ioredis";

const connection = new Redis({
  host: process.env.REDIS_HOST || "localhost",
  port: parseInt(process.env.REDIS_PORT || "6379"),
  password: process.env.REDIS_PASSWORD,
});

const worker = new Worker(
  "crawl-tasks",
  async (job) => {
    console.log(`Processing: ${job.data.value}`);
    // Implement scraping logic
    return { success: true };
  },
  { connection, concurrency: 5 },
);

worker.run();
```

**`worker-service/package.json`:**

```json
{
  "name": "find-app-worker",
  "scripts": {
    "start": "ts-node src/index.ts",
    "dev": "ts-node src/index.ts"
  }
}
```

---

## Phase 4: Implement ScraperFactory

### 4.1 TikTok Scraper Example

Create `lib/scrapers/tiktok-scraper.ts`:

```typescript
import { chromium } from "playwright-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import type { JobType } from "@/types/job";

chromium.use(StealthPlugin());

export class TikTokScraper {
  async crawl(url: string, type: JobType) {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.createIncognitoBrowserContext();
    const page = await context.newPage();

    try {
      // Stealth headers
      await page.setUserAgent(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      );

      await page.goto(url, { waitUntil: "networkidle" });

      // Extract video data based on type
      let videos = [];

      if (type === "hashtag") {
        videos = await this.extractHashtagVideos(page);
      } else if (type === "account") {
        videos = await this.extractAccountVideos(page);
      }

      return {
        platform: "tiktok",
        type,
        url,
        videosFound: videos.length,
        videos: videos.slice(0, 10), // First 10
      };
    } finally {
      await browser.close();
    }
  }

  private async extractHashtagVideos(page: any) {
    // Selector for TikTok videos on hashtag page
    return await page.locator('[data-testid="video-card"]').all();
  }

  private async extractAccountVideos(page: any) {
    // Selector for TikTok videos on account page
    return await page.locator('[data-testid="video-card"]').all();
  }
}
```

### 4.2 Update ScraperFactory

Modify `lib/scrapers/scraper-factory.ts`:

```typescript
import { TikTokScraper } from "./tiktok-scraper";
// ... import other scrapers

export class ScraperFactory {
  private static scrapers = {
    tiktok: new TikTokScraper(),
    // ... other platform scrapers
  };

  static getScraper(platform: Platform) {
    const scraper = this.scrapers[platform];
    if (!scraper) throw new Error(`No scraper for ${platform}`);
    return scraper;
  }
}
```

---

## Phase 5: End-to-End Flow Testing

### 5.1 Manual Test

**Terminal 1: Start Redis**

```bash
docker run -p 6379:6379 redis:latest
```

**Terminal 2: Start Next.js Server**

```bash
npm run dev
```

**Terminal 3: Start Worker**

```bash
npm run worker
```

**Terminal 4: Send Test Request**

```bash
curl -X POST http://localhost:3000/api/filter/decompose \
  -H "Content-Type: application/json" \
  -d '{
    "platform": "tiktok",
    "filters": {
      "hashtag": ["trending", "viral"],
      "kenh": ["popular"],
      "limit": 3
    }
  }'
```

**Expected Output:**

Terminal 2 (API):

```
✅ API received request
📦 Decomposed 3 jobs
✅ Jobs submitted to queue
```

Terminal 3 (Worker):

```
[JOB batch-xxx-0] Started: hashtag=trending
[JOB batch-xxx-0] ✓ Setup complete
[JOB batch-xxx-0] ✓ Scraper initialized
[JOB batch-xxx-0] ⧖ Crawling...
[JOB batch-xxx-0] ✅ SUCCESS
```

---

## Phase 6: Error Handling & Debugging

### 6.1 Common Issues

**Issue 1: Redis Connection Error**

```
Error: connect ECONNREFUSED 127.0.0.1:6379
```

**Solution:**

```bash
# Check if Redis is running
redis-cli ping # Should return PONG

# If not running:
docker run -d -p 6379:6379 redis:latest
```

**Issue 2: Job Fails with Timeout**

```
Job failed: Job worker is not ready
```

**Solution:**

```typescript
// In worker setup, ensure connection is ready
await connection.ping();
```

**Issue 3: API Route Not Found**

```
404 Not Found: /api/filter/decompose
```

**Solution:**

```bash
# Verify file exists: app/api/filter/decompose/route.ts
# Restart Next.js server
npm run dev
```

### 6.2 Monitoring & Debugging

**Check Queue Status:**

```typescript
import { getCrawlQueue } from "@/lib/queue";

const queue = getCrawlQueue();
const jobs = await queue.getJobs(["waiting", "active", "completed"]);
console.log("Queue jobs:", jobs);
```

**View Redis Data:**

```bash
redis-cli

# List all keys
> KEYS *

# Get specific job data
> HGETALL bull:crawl-tasks:batch-xxx-0

# Monitor queue
> MONITOR
```

---

## Phase 7: Production Deployment

### 7.1 Environment Setup

```env
# Production Redis (Redis Cloud / Upstash)
REDIS_HOST=redis-prod.c123.us-east-1-2.ec2.cloud.redislabs.com
REDIS_PORT=18921
REDIS_PASSWORD=your_secure_password_here
REDIS_DB=0

# App
NEXT_PUBLIC_API_URL=https://your-app.com
NODE_ENV=production
```

### 7.2 Deploy Next.js Server

```bash
# Vercel (Recommended)
npm i -g vercel
vercel

# Or Docker
docker build -t find-app .
docker run -p 3000:3000 find-app
```

### 7.3 Deploy Worker Service

```bash
# Option A: Same container with health check
docker run -d \
  --name find-app-worker \
  -e REDIS_HOST=redis-prod.com \
  -e REDIS_PASSWORD=xxx \
  worker-service:latest

# Option B: Separate container orchestration
# Using Docker Compose, Kubernetes, or AWS ECS
```

---

## 📊 Testing Checklist

- [ ] Redis running & accessible
- [ ] Environment variables configured
- [ ] API endpoint responding
- [ ] Filters decomposing correctly
- [ ] Jobs adding to queue
- [ ] Worker processing jobs
- [ ] Error handling working
- [ ] Retry mechanism tested
- [ ] Monitoring dashboard accessible
- [ ] Production credentials validated

---

## 🎯 Quick Commands Reference

```bash
# Development
npm run dev                    # Next.js server
npm run worker                 # Start worker
npm run dev:with-worker        # Both together
npm run test:decompose         # Test decomposition

# Redis
redis-cli                      # Connect to Redis
docker run -p 6379:6379 redis  # Start Docker Redis

# Production
npm run build                  # Build Next.js
npm start                      # Start production server

# Monitoring
curl http://localhost:3000/api/filter/decompose  # API test
docker logs find-app-redis                        # Redis logs
```

---

**Next Step**: Implement real ScraperFactory strategies for each platform!
