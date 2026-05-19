# Security

## Required Before Production

- Set `ADMIN_USERNAME` and `ADMIN_PASSWORD`.
- Rotate any key that was ever committed or shared in documentation.
- Keep `.env.local` out of Git.
- Use HTTPS for `NEXT_PUBLIC_APP_URL` and all OAuth callbacks.
- Store uploaded/published videos in a proper object storage service for production.

## Protected Surfaces

The root UI, dashboard pages, and API routes are protected by `proxy.ts` with Basic Auth when admin credentials are configured. OAuth callback routes and `/api/health` remain public because external services must reach them.

## Tenant Isolation

Runtime data is scoped with `tenant_id`. The current tenant is resolved in this order:

- `tenantId` query parameter
- `x-tenant-id` request header
- `tenant_id` cookie
- `DEFAULT_TENANT_ID`, falling back to `default`

Before adding public customer access, replace Basic Auth with real user authentication and derive `tenant_id` from the authenticated user's workspace membership.

## Runtime Artifacts

Do not commit generated media or debug captures:

- `debug/`
- `.media-tmp/`
- `public/prepared-videos/`
- `public/uploads/ready/`

## Upload Rules

The upload endpoint accepts at most 10 files per request, each up to 500 MB, and only these video formats:

- `.mp4`
- `.mov`
- `.m4v`
- `.webm`
