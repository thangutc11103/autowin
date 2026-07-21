# Find App

Find App is a Next.js dashboard for discovering short-form videos, preparing selected clips, connecting OAuth accounts, and queueing publish jobs.

## Core Services

- `app/` - Next.js app routes, dashboard pages, and API handlers.
- `lib/scrapers/` - TikTok, Instagram, Facebook, and YouTube discovery adapters.
- `lib/database/` - PostgreSQL persistence for scraped videos, OAuth accounts, and posting queues.
- `lib/publish/` - Platform publishing adapters.
- `scripts/worker.ts` - BullMQ worker for crawl and publish jobs.

## Local Development

```bash
npm install
npm run dev
```

Run the worker in a second terminal:

```bash
npm run worker
```

Required environment values are listed in `.env.local.example`.

## Documentation

- [Local development](docs/local-development.md)
- [Deployment](docs/deployment.md)
- [Architecture](docs/architecture.md)
- [Redis](docs/redis.md)
- [Reference](docs/reference.md)
- [Security](docs/security.md)
- [Maintenance mode](docs/maintenance.md)

## Production Notes

Set `ADMIN_USERNAME` and `ADMIN_PASSWORD` before deploying. In production, protected pages and API routes are blocked if these values are missing.

The app is tenant-aware. Until full user login and a workspace switcher are added, requests use `DEFAULT_TENANT_ID=default` unless a tenant is supplied with `tenantId`, `x-tenant-id`, or the `tenant_id` cookie.

Generated media and debug artifacts are intentionally ignored:

- `debug/`
- `.media-tmp/`
- `public/prepared-videos/`
- `public/uploads/ready/`
