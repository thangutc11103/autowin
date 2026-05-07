# 🚀 Quick Start - Test External Scraper

## Step 1: Chuẩn bị Environment

```bash
# 1. Ensure Redis is running
docker run -d -p 6379:6379 redis:latest

# 2. Check Redis connection
redis-cli ping
# Should return: PONG
```

## Step 2: Configure .env

Đảm bảo `.env` có:

```env
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_DB=0
```

## Step 3: Terminal 1 - Run Next.js + Default Worker

```bash
npm run dev:with-worker
```

Output sẽ hiển thị:
```
✅ [JOB] Setting up worker...
✅ Connected to Redis
✅ Waiting for jobs from queue...
```

## Step 4: Terminal 2 - Run External Scraper

```bash
npm run scraper
# Or: tsx scripts/external-scraper.ts
```

Output sẽ hiển thị:
```
✅ [EXTERNAL SCRAPER] Connected to Redis
🟢 [WORKER] Worker ready and listening...
⏳ Waiting for jobs from queue...
```

## Step 5: Terminal 3 - Monitor Redis

```bash
redis-cli MONITOR
```

Khi có jobs, bạn sẽ thấy tất cả Redis commands in real-time.

## Step 6: Test qua UI

1. Mở browser: `http://localhost:3000/discover`
2. Điền filter (ví dụ: Hashtag = "trending", Limit = 5)
3. Click "Find" button
4. Watch terminals:
   - Terminal 1 (worker): See "[JOB]" logs
   - Terminal 2 (scraper): See "[SCRAPER]" logs
   - Terminal 3 (redis monitor): See Redis commands

## Expected Flow

```
UI Submit
  ↓
API: /api/filter/decompose
  ↓
Jobs added to Redis Queue
  ↓
Worker picks up job (Terminal 1)
  ↓
External Scraper processes (Terminal 2)
  ↓
Results stored in Redis
  ↓
Job marked as completed
```

## Check Results in Redis

```bash
redis-cli

# 1. List all results
> KEYS results:*

# 2. Get specific result
> GET results:BATCHID:JOBID

# 3. Get batch results list
> LRANGE results:batch:BATCHID 0 -1

# 4. Get job data
> HGETALL bull:crawl-tasks:job:JOBID

# 5. Get queue stats
> LLEN bull:crawl-tasks:wait      # Jobs waiting
> LLEN bull:crawl-tasks:active    # Jobs active
> LLEN bull:crawl-tasks:completed # Jobs completed
```

## Troubleshooting

### Error: "Connection refused"
- Redis not running
- Wrong REDIS_HOST/REDIS_PORT in .env
- Fix: `docker run -d -p 6379:6379 redis:latest`

### Error: "Worker not picking up jobs"
- External scraper still running from old version
- Try: Kill and restart with `npm run scraper`

### Jobs stuck in "active"
- External scraper crashed/disconnected
- Restart external scraper terminal
- BullMQ will move job back to wait after timeout

### Results not storing
- Check Terminal 2 output for errors
- Verify Redis connection in external scraper

---

## 🎯 Next: Implement Real Playwright

Once testing is stable, replace mock scraper with:

```typescript
import { chromium } from 'playwright';

async function playwrightScraper(jobData: CrawlJobData) {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  try {
    await page.goto(jobData.targetUrl);
    // Extract video data from DOM
    // ...
  } finally {
    await browser.close();
  }
}
```

---

## 📊 Monitor with Redis Dashboard

Optional: Install Bull Board for visual dashboard

```bash
npm install @bull-board/express @bull-board/ui
```

Then add to app/api:
```typescript
import { createBullBoard } from '@bull-board/express';
import { BullAdapter } from '@bull-board/api/bullAdapter';

// Middleware in API route...
```

Access at: `http://localhost:3000/bull`
