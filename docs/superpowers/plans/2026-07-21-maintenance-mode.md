# Website Maintenance Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a manually controlled global maintenance mode that blocks normal pages and business APIs with HTTP 503, while preserving health checks, static assets, an authenticated owner/admin recovery page, terminal recovery, and existing BullMQ worker activity.

**Architecture:** Store one versioned maintenance document in Redis and resolve it behind an environment override. A dedicated fail-fast Redis adapter feeds a two-second process-local snapshot. The Next.js 16 Proxy asks a testable request gate for the effective state before applying the existing authentication behavior. The Admin API, control page, and CLI all use the same parser and service so state shape, precedence, and validation cannot drift.

**Tech Stack:** Next.js 16.2 App Router and Node.js Proxy runtime, React 19, TypeScript 5, ioredis 5, PostgreSQL-backed sessions, Node built-in `node:test` executed through `tsx`.

## Global Constraints

- Follow `docs/superpowers/specs/2026-07-21-maintenance-mode-design.md` as the approved product contract.
- Keep the Redis key global: `find-app:maintenance:state:v1`; do not add tenant input.
- Preserve the existing authentication outcomes when maintenance is disabled.
- Do not import maintenance code from `scripts/worker.ts` or any BullMQ worker module.
- Keep `MAINTENANCE_MODE=true|1|yes|on` higher priority than Redis. An environment-forced state must remain active even when Redis is unreachable.
- All visitor HTML must be self-contained and every dynamic value must be escaped.
- Use red-green-refactor for every behavior change. Do not write production behavior before its failing test.
- Run the local Next.js 16 documentation check again before editing `proxy.ts` or route handlers if the installed Next.js version changes.

## Target File Map

| Path | Responsibility |
|---|---|
| `lib/maintenance/types.ts` | Shared state, snapshot, store, update, and service contracts plus constants. |
| `lib/maintenance/state.ts` | Defaults, stored-state parsing, update validation, environment precedence, and typed errors. |
| `lib/maintenance/service.ts` | Redis read/write orchestration, two-second cache, last-known fallback, warning throttling, and singleton lifecycle. |
| `lib/maintenance/redis-store.ts` | Dedicated ioredis adapter with bounded connection/command behavior. |
| `lib/maintenance/policy.ts` | Pure pathname/cookie allow/block policy and role predicate. |
| `lib/maintenance/response.ts` | Escaped HTML 503 and JSON 503 responses with required headers. |
| `lib/maintenance/proxy-handler.ts` | Maintenance-first request gate followed by the unchanged authentication policy. |
| `proxy.ts` | Thin Next.js Proxy entrypoint and matcher only. |
| `lib/maintenance/admin-api.ts` | Testable GET/PUT controller with injected authorization and service dependencies. |
| `app/api/admin/maintenance/route.ts` | Node route bindings for the Admin controller. |
| `lib/auth/session-auth.ts` | Add token-based session lookup reusable from a Server Component. |
| `app/maintenance-control/page.tsx` | Server-side session and owner/admin guard. |
| `components/admin/maintenance-control.tsx` | Client-side status, edit, preview, activate, and deactivate UI. |
| `app/(dashboard)/admin/page.tsx` | Link/card to the dedicated maintenance control page. |
| `lib/maintenance/cli.ts` | Pure CLI parser and command runner. |
| `scripts/maintenance.ts` | `.env.local` loading, CLI invocation, exit code, and Redis cleanup. |
| `tests/maintenance/*.test.ts` | Unit and integration-style tests using `node:test`. |
| `.env.local.example`, `package.json`, `README.md`, `docs/maintenance.md` | Operator configuration, commands, and recovery documentation. |

---

## Task 1: Define and validate the maintenance state

**Files:**

- Create: `lib/maintenance/types.ts`
- Create: `lib/maintenance/state.ts`
- Create: `tests/maintenance/state.test.ts`

**Interfaces:**

```ts
export interface MaintenanceState {
  version: 1;
  enabled: boolean;
  title: string;
  message: string;
  estimatedEndAt: string | null;
  updatedAt: string;
  updatedBy: string;
}

export type MaintenanceSource = "default" | "redis" | "last-known" | "environment";

export interface MaintenanceSnapshot {
  state: MaintenanceState;
  source: MaintenanceSource;
  environmentForced: boolean;
  stale: boolean;
}

export interface MaintenanceUpdate {
  enabled: boolean;
  title?: string;
  message?: string;
  estimatedEndAt?: string | null;
  updatedBy: string;
}
```

- [ ] Write tests for deterministic defaults, whitespace normalization, title/message limits, empty values, ISO conversion, malformed stored JSON, schema version rejection, and environment truthy values.
- [ ] Add precedence tests proving `MAINTENANCE_MODE=true` forces `enabled: true`, configured environment copy overrides Redis copy, invalid environment copy falls back safely, and `MAINTENANCE_MODE=false` leaves Redis authoritative.
- [ ] Run `npx tsx --test tests/maintenance/state.test.ts` and confirm failure because the modules do not exist.
- [ ] Implement these exact public exports in `state.ts`: `MaintenanceValidationError`, `MaintenanceEnvironmentOverrideError`, `createDefaultMaintenanceState`, `parseStoredMaintenanceState`, `normalizeMaintenanceUpdate`, `isMaintenanceEnvironmentForced`, and `resolveEnvironmentMaintenanceState`.
- [ ] Use epoch time and updater `system` for a missing-record default so tests and CLI output are stable; use the injected clock only for persisted updates.
- [ ] Normalize title and message with `trim()` plus collapsed internal whitespace. Reject a blank title/message, title over 120 characters, message over 1,000 characters, non-boolean `enabled`, and invalid `estimatedEndAt`.
- [ ] Convert a valid reopening time with `new Date(value).toISOString()` before persistence. For environment values, never turn maintenance off due to invalid copy: fall back to the base title/message and `null` ETA.
- [ ] Run `npx tsx --test tests/maintenance/state.test.ts` and confirm all state tests pass.
- [ ] Commit with `git add lib/maintenance/types.ts lib/maintenance/state.ts tests/maintenance/state.test.ts && git commit -m "feat: define maintenance state contract"`.

## Task 2: Build the fail-fast Redis service

**Files:**

- Create: `lib/maintenance/redis-store.ts`
- Create: `lib/maintenance/service.ts`
- Create: `tests/maintenance/service.test.ts`

**Interfaces:**

```ts
export interface MaintenanceKeyValueStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  close(): Promise<void>;
}

export interface MaintenanceServiceContract {
  getRedisState(options?: { fresh?: boolean }): Promise<MaintenanceSnapshot>;
  getEffectiveState(options?: { fresh?: boolean }): Promise<MaintenanceSnapshot>;
  updateState(input: MaintenanceUpdate): Promise<MaintenanceSnapshot>;
  invalidateCache(): void;
  close(): Promise<void>;
}
```

- [ ] Write an in-memory fake store and tests for missing Redis records, valid records, a two-second cache hit, `fresh: true`, cache invalidation after `set`, environment precedence, and updater/timestamp persistence.
- [ ] Add failure tests: a process with a last-known record returns it with `source: "last-known"` and `stale: true`; a fresh process fails open to disabled defaults; an environment-forced process stays enabled; disabling while the override is active throws `MaintenanceEnvironmentOverrideError`.
- [ ] Add a warning-throttle test with an injected logger and clock so repeated Redis failures log at most once per 30 seconds.
- [ ] Run `npx tsx --test tests/maintenance/service.test.ts` and confirm failure because the service is missing.
- [ ] Implement `MaintenanceService` with constructor dependencies `{ store, env, now, cacheTtlMs, warningIntervalMs, logger }`. Keep `lastKnownState` separate from the expiring cache so a Redis outage can use it after the two-second cache expires.
- [ ] Implement `createMaintenanceRedisStore()` using ioredis with `lazyConnect: true`, `connectTimeout: 250`, `commandTimeout: 250`, `enableOfflineQueue: false`, `maxRetriesPerRequest: 0`, and `retryStrategy: () => null`. Recreate a client whose status is `end`, connect a `wait` client before commands, and attach an error listener that does not expose credentials.
- [ ] Export `getMaintenanceService()` from `service.ts` using a `globalThis` singleton for development hot reload, plus `closeMaintenanceService()` for the CLI and tests. Do not modify or reuse `lib/redis.ts`.
- [ ] Ensure `getEffectiveState()` resolves Redis/default/last-known first and then applies the environment override, so `MAINTENANCE_TITLE`, `MAINTENANCE_MESSAGE`, and `MAINTENANCE_UNTIL` can selectively override the stored display copy.
- [ ] Run `npx tsx --test tests/maintenance/state.test.ts tests/maintenance/service.test.ts` and confirm all tests pass.
- [ ] Commit with `git add lib/maintenance/redis-store.ts lib/maintenance/service.ts tests/maintenance/service.test.ts && git commit -m "feat: add resilient maintenance state service"`.

## Task 3: Enforce maintenance in Next.js Proxy

**Files:**

- Create: `lib/maintenance/policy.ts`
- Create: `lib/maintenance/response.ts`
- Create: `lib/maintenance/proxy-handler.ts`
- Modify: `proxy.ts`
- Create: `tests/maintenance/policy.test.ts`
- Create: `tests/maintenance/proxy.test.ts`

**Interfaces:**

```ts
export type MaintenanceDecision = "allow" | "block-page" | "block-api";

export function getMaintenanceDecision(input: {
  pathname: string;
  hasSessionCookie: boolean;
}): MaintenanceDecision;

export function createMaintenanceResponse(
  request: NextRequest,
  state: MaintenanceState,
): NextResponse;

export async function handleProxyRequest(
  request: NextRequest,
  dependencies?: {
    getMaintenanceState(): Promise<MaintenanceSnapshot>;
  },
): Promise<NextResponse>;
```

- [ ] Write policy tests covering `/_next/*`, extension-bearing public files, favicon/robots/sitemap, `/api/health` subpaths, control routes with and without `autowin_session`, ordinary pages, login, auth callbacks, and business APIs.
- [ ] Write response tests proving page responses are HTML 503, API responses are JSON 503 with code `MAINTENANCE_MODE`, required public fields, and all three headers. Include a malicious title such as `<script>alert(1)</script>` and assert it is escaped.
- [ ] Write request-gate tests with an injected snapshot getter: disabled mode still redirects an unauthenticated page to `/login` and returns the existing API 401; enabled mode blocks login and business routes; health remains reachable; a session-bearing maintenance-control request reaches its server guard.
- [ ] Run `npx tsx --test tests/maintenance/policy.test.ts tests/maintenance/proxy.test.ts` and confirm failure because the request gate does not exist.
- [ ] Implement the allowlist exactly as approved. Cookie presence only allows routing to `/maintenance-control`, `/api/admin/maintenance`, `/api/auth/me`, and `/api/auth/logout`; it does not authorize them.
- [ ] Implement a complete UTF-8 HTML document with inline CSS, status badge, escaped title/message/ETA, and a same-path reload link. Do not reference fonts, images, scripts, React hydration, or external resources.
- [ ] Return `Retry-After: 300`, `Cache-Control: no-store, max-age=0`, and `X-Robots-Tag: noindex, nofollow` for both response types.
- [ ] Move the existing Proxy authentication helpers unchanged into `proxy-handler.ts`, perform the maintenance decision first, and call those helpers only after an allow/disabled result. Keep `proxy.ts` as an async wrapper plus the existing matcher.
- [ ] Run the two new test files, then `npx tsc --noEmit`; both must pass.
- [ ] Commit with `git add lib/maintenance/policy.ts lib/maintenance/response.ts lib/maintenance/proxy-handler.ts proxy.ts tests/maintenance/policy.test.ts tests/maintenance/proxy.test.ts && git commit -m "feat: enforce maintenance at request boundary"`.

## Task 4: Add the authorized Admin API

**Files:**

- Create: `lib/maintenance/admin-api.ts`
- Create: `app/api/admin/maintenance/route.ts`
- Modify: `lib/auth/session-auth.ts`
- Create: `tests/maintenance/admin-api.test.ts`

**Interfaces:**

```ts
export async function getCurrentUserBySessionToken(
  sessionToken: string,
): Promise<CurrentUser | null>;

export function createMaintenanceAdminApi(dependencies: {
  requireAdmin(request: Request): Promise<Response | null>;
  getCurrentUser(request: Request): Promise<CurrentUser | null>;
  getRequestUserId(request: Request): string | null;
  service: MaintenanceServiceContract;
}): {
  get(request: Request): Promise<Response>;
  put(request: Request): Promise<Response>;
};
```

- [ ] Write controller tests with injected dependencies for unauthenticated 401, viewer/editor 403, authorized GET, authorized PUT, invalid JSON 400, validation 400, environment override 409, Redis failure 503, `Cache-Control: no-store`, and `updatedBy` derived from session or Basic-auth identity.
- [ ] Run `npx tsx --test tests/maintenance/admin-api.test.ts` and confirm it fails before the controller exists.
- [ ] Extract the existing database query in `getCurrentUser()` into `getCurrentUserBySessionToken(sessionToken)`. Keep the cookie parser and public behavior of `getCurrentUser(request)` unchanged by making it delegate to the new helper.
- [ ] Implement the controller so both methods call the injected `requireAdmin`. Parse PUT JSON as unknown data and let the shared validator own field rules. Do not return Redis credentials, stack traces, or internal error objects.
- [ ] Map errors exactly: malformed/invalid input to 400, environment-forced disable to 409, and store/unexpected failures to 503. Log the server error message without request headers or cookies.
- [ ] Bind `GET` and `PUT` in the route file using `requireAdmin`, `getCurrentUser`, `getRequestUserId`, and `getMaintenanceService()`. Export `runtime = "nodejs"` and `dynamic = "force-dynamic"`.
- [ ] Run the Admin API tests and `npx tsc --noEmit`.
- [ ] Commit with `git add lib/maintenance/admin-api.ts app/api/admin/maintenance/route.ts lib/auth/session-auth.ts tests/maintenance/admin-api.test.ts && git commit -m "feat: add maintenance admin api"`.

## Task 5: Build the owner/admin control page

**Files:**

- Create: `app/maintenance-control/page.tsx`
- Create: `components/admin/maintenance-control.tsx`
- Modify: `app/(dashboard)/admin/page.tsx`
- Modify: `lib/maintenance/policy.ts`
- Create: `tests/maintenance/access.test.ts`

**Interfaces:**

```ts
export function isMaintenanceAdmin(
  user: { role: string } | null | undefined,
): boolean;
```

- [ ] Add a failing role-predicate test proving only `owner` and `admin` pass; `editor`, `viewer`, unknown roles, and missing users fail.
- [ ] Run `npx tsx --test tests/maintenance/access.test.ts` and confirm the missing predicate failure.
- [ ] Implement `isMaintenanceAdmin` in `policy.ts`.
- [ ] Implement the server page with `export const dynamic = "force-dynamic"`, `await cookies()`, `SESSION_COOKIE_NAME`, and `getCurrentUserBySessionToken`. Redirect missing/non-admin users to `/`; render the client control only for owner/admin.
- [ ] Implement the client component with these concrete states: `loading`, `saving`, `error`, fetched `snapshot`, `title`, `message`, and browser-local `estimatedEndAt`. GET on mount with `cache: "no-store"`; PUT JSON for every mutation; replace local state only from a successful API response.
- [ ] Render current effective status and source, title/message/optional ETA inputs, visitor preview, and operator guidance. Activation must use `window.confirm`; deactivation is immediate. Disable all mutation controls while saving and disable deactivation when `environmentForced` is true with terminal/env recovery guidance.
- [ ] Add a visible maintenance card/link in the existing Admin page header beside the new-user action. Import `Link` from `next/link`; do not make the dashboard layout itself accessible during maintenance.
- [ ] Run `npx tsx --test tests/maintenance/access.test.ts`, `npx tsc --noEmit`, and `npm run lint -- app/maintenance-control/page.tsx components/admin/maintenance-control.tsx 'app/(dashboard)/admin/page.tsx' lib/maintenance/policy.ts`.
- [ ] Start `npm run dev`, sign in as owner/admin, and manually verify inactive, active, environment-forced, validation-error, and narrow-screen states. Record any visual correction in the same task before committing.
- [ ] Commit with `git add app/maintenance-control/page.tsx components/admin/maintenance-control.tsx 'app/(dashboard)/admin/page.tsx' lib/maintenance/policy.ts tests/maintenance/access.test.ts && git commit -m "feat: add maintenance control page"`.

## Task 6: Add terminal operation and recovery documentation

**Files:**

- Create: `lib/maintenance/cli.ts`
- Create: `scripts/maintenance.ts`
- Create: `tests/maintenance/cli.test.ts`
- Modify: `package.json`
- Modify: `.env.local.example`
- Create: `docs/maintenance.md`
- Modify: `README.md`

**CLI grammar:**

```text
status
on [--title <text>] [--message <text>] [--until <ISO-8601>]
off
```

- [ ] Write parser tests for all three commands, quoted values, missing option values, unknown commands/options, flags passed to `off`, and invalid `--until` forwarded to the shared validator.
- [ ] Write runner tests with a fake service: `status` prints both Redis and effective snapshots, `on` preserves omitted copy fields, `off` requests `enabled: false`, failures return exit code 1, and `close()` always runs.
- [ ] Run `npx tsx --test tests/maintenance/cli.test.ts` and confirm failure because the CLI module does not exist.
- [ ] Implement `parseMaintenanceCliArgs(argv)` and `runMaintenanceCli(argv, dependencies)`. Use updater `cli:<local username>` from `USERNAME` or `USER`, falling back to `cli:unknown`; never print environment secrets.
- [ ] In `scripts/maintenance.ts`, load `.env.local` first and `.env` second without overriding existing values, execute the runner, set `process.exitCode`, and close the maintenance service in `finally`.
- [ ] Add `"maintenance": "tsx scripts/maintenance.ts"` and one explicit `"test:maintenance"` command listing every `tests/maintenance/*.test.ts` file; avoid wildcard behavior differences on PowerShell.
- [ ] Document the normal Admin workflow, all four terminal examples, `MAINTENANCE_MODE` precedence, the fact that env override changes require process restart/redeploy, recovery when a session expires, Redis outage behavior, response allowlist, and worker behavior in `docs/maintenance.md`.
- [ ] Add commented environment examples for `MAINTENANCE_MODE`, `MAINTENANCE_TITLE`, `MAINTENANCE_MESSAGE`, and `MAINTENANCE_UNTIL` to `.env.local.example`, and link the maintenance runbook from README.
- [ ] Run `npm run test:maintenance` and all four CLI commands against a disposable development Redis key/state. Restore maintenance to off after the check; do not use production Redis credentials.
- [ ] Commit with `git add lib/maintenance/cli.ts scripts/maintenance.ts tests/maintenance/cli.test.ts package.json package-lock.json .env.local.example docs/maintenance.md README.md && git commit -m "feat: add maintenance cli and runbook"`.

## Task 7: Full-system verification and cleanup

**Files:**

- Modify only files required by failures discovered in this task.

- [ ] Run `npm run test:maintenance` and confirm zero failures.
- [ ] Run `npx tsc --noEmit` and confirm zero type errors.
- [ ] Run `npm run lint` and distinguish pre-existing warnings/errors from regressions; fix every maintenance-related regression.
- [ ] Run `npm run build` to verify Next.js 16 accepts the Proxy Node dependencies, route exports, Server Component cookie usage, and client/server import boundaries.
- [ ] With a development Redis instance, start `npm run dev`, turn maintenance on through the CLI, and verify with HTTP requests: `/` is HTML 503, `/login` is HTML 503, a business `/api/*` endpoint is JSON 503, `/api/health` is not blocked, and static assets load.
- [ ] While active, verify an existing owner/admin session can load `/maintenance-control`, GET/PUT the Admin API, and turn Redis-controlled maintenance off. Verify editor/viewer/unauthenticated requests cannot use the control API.
- [ ] Set `MAINTENANCE_MODE=true` in a disposable local process, verify Admin and CLI cannot disable the effective state, then remove the override and restart the process.
- [ ] Stop the disposable Redis instance or point the development process at an unused port; verify a forced environment state stays on and the request returns within one second. Restore local configuration afterward.
- [ ] Run `rg -n "maintenance" scripts/worker.ts lib/queue* lib/**/worker*` and confirm no worker imports or reads the maintenance flag. Adjust the path list to existing worker directories without changing their code.
- [ ] Run `rg -n "TODO|FIXME|placeholder|\.\.\." lib/maintenance app/maintenance-control components/admin/maintenance-control.tsx scripts/maintenance.ts tests/maintenance` and remove implementation placeholders while retaining legitimate UI punctuation.
- [ ] Review the git diff against every success criterion in the approved design, then run `git status --short` to ensure only intentional files remain.
- [ ] If verification required fixes, commit them with `git add <exact-fixed-files> && git commit -m "fix: harden maintenance mode verification"`. If no fixes were needed, do not create an empty commit.

## Completion Evidence

Before reporting completion, capture and summarize:

- `npm run test:maintenance` result and test count.
- `npx tsc --noEmit` result.
- `npm run lint` result, including any clearly pre-existing issues.
- `npm run build` result.
- Manual HTTP status/content-type/header matrix for page, API, health, control, and environment override cases.
- Final commit list and `git status --short`.

