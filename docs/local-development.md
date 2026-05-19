# 🚀 Quick Start: Filter to Redis in 5 Minutes

**TL;DR** - Get the system running in minimal steps

---

## ⚡ Ultra Quick Setup

### 1. Start Redis (Terminal 1)

**Option A: Docker (Recommended)**

```bash
docker run -d -p 6379:6379 redis:latest
```

**If Docker Error (on Windows):**

1. Open **Docker Desktop** application
2. Wait for it to fully start (check system tray)
3. Then run the command above

**Option B: Redis Server (If Docker not available)**

```bash
# Windows: Download from https://github.com/microsoftarchive/redis/releases
# Extract and run redis-server.exe
# Or if you have Redis installed:
redis-server
```

**Option C: Using WSL (Windows Subsystem for Linux)**

```bash
wsl
docker run -d -p 6379:6379 redis:latest
```

### 2. Create `.env.local` (Terminal Current)

```bash
cat > .env.local << EOF
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_DB=0
NEXT_PUBLIC_API_URL=http://localhost:3000
EOF
```

### 3. Install Dependencies (Already done ✅)

```bash
npm install  # Already installed bullmq & ioredis
```

### 4. Start Dev Server (Terminal 2)

```bash
npm run dev
```

### 5. Start Worker (Terminal 3)

```bash
npm run worker
```

### 6. Test It 🎯

**Browser:**

```
http://localhost:3000 → Go to Discover → Select TikTok → Enter "#trending" → Click Find
```

**Or Terminal:**

```bash
curl -X POST http://localhost:3000/api/filter/decompose \
  -H "Content-Type: application/json" \
  -d '{"platform":"tiktok","filters":{"hashtag":["trending"],"limit":5}}'
```

**Expected Output:**

```json
{
  "batchId": "batch-...",
  "totalJobs": 1,
  "platform": "tiktok",
  "message": "Successfully submitted 1 jobs to crawl queue"
}
```

---

## ✅ Verification Checklist

- [ ] Redis running (redis-cli ping = PONG)
- [ ] .env.local created with REDIS_HOST=localhost
- [ ] npm run dev starts without errors
- [ ] API endpoint returns 200 with jobs submitted
- [ ] npm run worker shows "Worker READY"
- [ ] UI sends request when clicking "Find"

---

## 📂 Important Files to Know

| File                                   | Purpose                         |
| -------------------------------------- | ------------------------------- |
| `app/api/filter/decompose/route.ts`    | API endpoint (where filters go) |
| `lib/filter-decomposer.ts`             | Splits filters into jobs        |
| `lib/queue.ts`                         | Sends jobs to Redis             |
| `scripts/worker.ts`                    | Processes jobs                  |
| `components/discover/filter-panel.tsx` | UI that calls API               |

---

## 🔍 How to Monitor

**See what's in Redis:**

```bash
redis-cli
> KEYS bull:crawl-tasks:*
> HGETALL bull:crawl-tasks:batch-xxx-0
```

**See worker processing:**

```
npm run worker
# Watch terminal for [JOB xxx] STARTED/✅ SUCCESS messages
```

**See API requests:**

```
npm run dev
# Watch terminal for API logs
```

---

## 🆘 If Something Breaks

### Issue: Port 6379 already allocated

```
Error: Bind for 0.0.0.0:6379 failed: port is already allocated
```

**Solution A: Stop existing Redis/Container**

```bash
# Find what's using port 6379 (Windows)
netstat -ano | findstr :6379

# Or kill all Redis containers
docker ps
docker stop <container_id>

# Then try again
docker run -d -p 6379:6379 redis:latest
```

**Solution B: Use different port (Easier)**

```bash
# Use port 6380 instead
docker run -d -p 6380:6379 redis:latest

# Update .env.local
REDIS_HOST=localhost
REDIS_PORT=6380    # Change from 6379 to 6380
REDIS_PASSWORD=
REDIS_DB=0
NEXT_PUBLIC_API_URL=http://localhost:3000
```

**Then test:**

```bash
redis-cli -p 6380 ping  # Should return PONG
```

### Issue: Docker daemon not running (Windows)

```
Error: failed to connect to the docker API at npipe:////./pipe/dockerDesktopLinuxEngine
```

**Solution:**

1. Open **Docker Desktop** (search in Start menu)
2. Wait 30-60 seconds for it to fully start
3. Check system tray - look for Docker icon
4. Once running, try the command again:
   ```bash
   docker run -d -p 6379:6379 redis:latest
   ```

**If Docker Desktop won't start:**

- Right-click Docker Desktop → Settings → Resources → Check if WSL 2 is available
- Or reinstall Docker Desktop from https://www.docker.com/products/docker-desktop

**Alternative: Use Redis without Docker**

```bash
# Download: https://github.com/microsoftarchive/redis/releases
# Extract and run: redis-server.exe
# Or if installed via package manager:
redis-server
```

### Issue: "Cannot find module 'bullmq'"

```bash
npm install bullmq ioredis
```

### Issue: "404 Not Found /api/filter/decompose"

```bash
# Restart npm run dev
# Verify file: app/api/filter/decompose/route.ts exists
```

### Issue: Worker says "Queue connection error"

```bash
# Make sure Redis is running:
redis-cli ping  # Should return PONG
```

---

## 📊 What's Happening

```
You click "Find"
    ↓
API receives request
    ↓
Splits #trending, #viral into 2 jobs
    ↓
Sends to Redis queue
    ↓
Worker picks up jobs
    ↓
Worker processes each job
    ↓
Jobs marked as completed
```

---

## 🎯 What's Next

1. ✅ **Right now**: System is decomposing filters and queuing jobs
2. 🔄 **Next**: Implement actual scrapers (TikTok, Douyin, etc.)
3. 💾 **Then**: Store results in database
4. 📊 **Finally**: Add monitoring dashboard

---

## 📚 More Info

- Full setup: See `docs/redis.md`
- Integration: See `INTEGRATION_GUIDE.md`
- Overview: See `IMPLEMENTATION_SUMMARY.md`

---

**That's it!** 🎉 Your job queue system is running!
