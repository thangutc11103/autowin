# Website Maintenance Mode Design

**Status:** Approved for implementation
**Date:** 2026-07-21
**Project:** find-app

## Purpose

Add a global maintenance mode that can be enabled or disabled immediately from an owner/admin control page or a terminal command. While enabled, visitors can only see a maintenance response and cannot use normal pages or business APIs. Existing BullMQ workers continue processing jobs that they have already received.

## Confirmed Requirements

- Maintenance mode applies globally, not per tenant.
- Activation and deactivation are manual; there is no scheduler.
- Normal pages return a branded maintenance page.
- Business API routes return a structured `503 Service Unavailable` response.
- Static assets and health checks remain available.
- Only an already-authenticated `owner` or `admin` may use the maintenance control page and API while maintenance is active.
- If the administrative session expires during maintenance, the terminal command is the recovery path.
- The maintenance title, message, and optional estimated reopening time are editable.
- BullMQ workers continue processing and do not read the maintenance flag.
- A runtime environment override can force maintenance mode on during an emergency.

## Non-Goals

- Scheduled activation or deactivation.
- Per-tenant maintenance windows.
- Pausing, cancelling, or draining BullMQ jobs.
- Allowing administrators to use the rest of the product while maintenance is active.
- A public login flow during maintenance.
- Adding a new external service or testing framework.

## Considered Approaches

### Redis state with an environment override — selected

The administrative UI and CLI write the same Redis record. `proxy.ts` reads that record through a dedicated low-latency reader. `MAINTENANCE_MODE=true` has higher priority and forces maintenance on.

This uses infrastructure already required by the project, propagates across application replicas, and supports immediate changes without a restart. Redis failures require explicit timeout and fallback behavior.

### PostgreSQL state with a process cache

This is more durable, but it would place a database query on the request interception path. Next.js 16 recommends that Proxy avoid slow data fetching, so this approach adds unnecessary latency and database coupling.

### Environment variables only

This is operationally simple but usually requires a restart or redeployment. It cannot provide an immediate administrative switch, so it is retained only as an emergency override.

## Architecture

### Maintenance state

Redis stores one JSON document under `find-app:maintenance:state:v1` without a TTL:

```ts
interface MaintenanceState {
  version: 1;
  enabled: boolean;
  title: string;
  message: string;
  estimatedEndAt: string | null;
  updatedAt: string;
  updatedBy: string;
}
```

Defaults:

- `enabled`: `false`
- `title`: `Hệ thống đang được bảo trì`
- `message`: `Chúng tôi đang nâng cấp hệ thống. Vui lòng quay lại sau.`
- `estimatedEndAt`: `null`

Input limits are 120 characters for the title and 1,000 characters for the message. `estimatedEndAt`, when present, must be a valid ISO 8601 timestamp. The UI may display the time in the browser's locale, but Redis always stores ISO 8601.

### State precedence

The effective state is resolved in this order:

1. `MAINTENANCE_MODE=true` or `1` forces maintenance on.
2. Otherwise, use the Redis record.
3. If no Redis record exists, use the disabled defaults.

When the environment override is active, optional `MAINTENANCE_TITLE`, `MAINTENANCE_MESSAGE`, and `MAINTENANCE_UNTIL` values override the displayed copy. The Admin API reports `source: "environment"`, and attempts to disable maintenance return HTTP `409` with an explanation.

### Redis access and caching

Maintenance checks use a dedicated Redis client rather than the existing queue-oriented client, whose retry behavior can wait indefinitely. The maintenance client must use a short connection/command timeout, no offline queue, and no unbounded retries.

A module-local snapshot may be cached for two seconds as an optimization only; correctness must not depend on that cache being shared between processes. When Redis is unavailable:

- An environment-forced state remains active.
- A process with a last-known state continues using it and logs a rate-limited warning.
- A new process with no known state fails open using the disabled default and logs a warning.

This prevents Redis latency from hanging every request while preserving an active maintenance state on processes that already observed it.

### Request enforcement

`proxy.ts` evaluates maintenance before its existing authentication routing.

Always allowed:

- `/_next/*` and static file requests.
- `/favicon.ico`, `/robots.txt`, and `/sitemap.xml`.
- `/api/health` and its subroutes.

Conditionally allowed while maintenance is active:

- `/maintenance-control` only when the `autowin_session` cookie is present; the page performs full server-side role validation.
- `/api/admin/maintenance`, `/api/auth/me`, and `/api/auth/logout` only for requests carrying the session cookie; their route handlers still perform authoritative authentication and authorization.

All other page requests receive a self-contained HTML response with status `503`. The response does not depend on React hydration, the database, or external assets. All dynamic text is HTML-escaped.

All other `/api/*` requests receive:

```json
{
  "error": "Service unavailable",
  "code": "MAINTENANCE_MODE",
  "maintenance": {
    "title": "...",
    "message": "...",
    "estimatedEndAt": null
  }
}
```

Maintenance responses include:

- `Retry-After: 300`
- `Cache-Control: no-store, max-age=0`
- `X-Robots-Tag: noindex, nofollow`

When maintenance is disabled, the existing authentication behavior in `proxy.ts` remains unchanged.

## Administrative Control

### Control page

`/maintenance-control` is a server-protected route. It reads the session cookie, resolves the current user, and only renders the control UI for `owner` or `admin`; any other request is redirected to `/`, which returns the maintenance response when active.

The page contains:

- Current effective status and source (`Redis` or `Environment override`).
- Editable title, message, and optional estimated reopening time.
- A preview of the visitor-facing message.
- A confirmation dialog before activation.
- An immediate disable action when Redis controls the state.
- A disabled control with recovery guidance when the environment override is active.

The existing Admin page adds a maintenance card linking to this control page.

### Admin API

`GET /api/admin/maintenance` returns the effective state and source with `Cache-Control: no-store`.

`PUT /api/admin/maintenance`:

1. Calls `requireAdmin`.
2. Validates the JSON body and normalizes whitespace.
3. Rejects attempts to disable an environment-forced state with HTTP `409`.
4. Writes the Redis document with `updatedAt` and the current user identifier in `updatedBy`.
5. Invalidates the local snapshot in the current process.

Authorization remains authoritative in the route handler even though Proxy filters requests optimistically.

## Terminal Operation

The CLI uses the same state parser and Redis store as the Admin API:

```powershell
npm run maintenance -- status
npm run maintenance -- on
npm run maintenance -- on --title "Đang nâng cấp" --message "Vui lòng quay lại sau" --until "2026-07-21T18:00:00+07:00"
npm run maintenance -- off
```

`status` prints both the Redis state and the effective state so operators can see when an environment override is active. `on` and `off` exit non-zero on invalid input or Redis failure. The CLI does not require the web server to be reachable.

## User Experience

The maintenance response is a compact, responsive Vietnamese-first page using the product's neutral dashboard visual language. It includes the current title, message, optional estimated reopening time, a small status indicator, and a reload button. It contains no external fonts, scripts, or images.

The control page follows the existing Admin layout and interaction patterns. Activation is visually treated as a high-impact action; deactivation is prominent and requires no second confirmation.

## Security

- Every state mutation requires `owner` or `admin` authorization through `requireAdmin`.
- Proxy cookie checks are only routing optimizations and never replace route-level authorization.
- Visitor-facing HTML escapes every dynamic value.
- Redis stores no credentials or session data in the maintenance document.
- Maintenance state is global and cannot be influenced by tenant headers, query parameters, or cookies.
- Environment override values are read only on the server.
- Logs record state changes and the updater but never log session tokens or Redis credentials.

## Worker Behavior

No worker code imports the maintenance module. Existing BullMQ crawl, media, and publishing workers continue processing queued and active jobs. New jobs cannot be created through the web application because business APIs return `503`.

## Testing Strategy

Tests use Node's built-in test runner through `tsx`, avoiding a new test dependency.

Unit coverage:

- State defaults, normalization, validation, and ISO timestamp parsing.
- Environment override precedence.
- HTML escaping and visitor-page rendering.
- Route policy for static assets, health checks, control routes, pages, and APIs.
- Redis timeout/fallback decisions and local snapshot invalidation.
- CLI argument parsing and the shared state format.

Integration coverage:

- Disabled mode preserves the existing authentication behavior.
- Enabled mode returns HTML `503` for pages and JSON `503` for business APIs.
- Maintenance responses contain the required headers.
- Health checks remain reachable.
- Owner/admin can read and update state; editor/viewer and unauthenticated requests cannot.
- Environment-forced mode cannot be disabled by Admin or CLI.
- Worker modules remain independent of the maintenance flag.

## Success Criteria

- Routine Admin and terminal changes propagate to application replicas within two seconds.
- Visitors cannot use normal pages or business APIs while maintenance is enabled.
- An already-authenticated owner/admin can disable Redis-controlled maintenance from `/maintenance-control`.
- Terminal operation can recover the site without access to the UI.
- `MAINTENANCE_MODE=true` forces maintenance even if Redis is unavailable.
- Redis unavailability never causes requests to hang indefinitely.
- Existing authentication, health checks, and BullMQ worker processing continue to behave as designed.
