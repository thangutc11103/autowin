import type { NextRequest } from "next/server";

export const DEFAULT_TENANT_ID = "default";

const TENANT_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_-]{1,63}$/;

export function normalizeTenantId(value: string | null | undefined): string {
  const trimmed = value?.trim();

  if (!trimmed) {
    return process.env.DEFAULT_TENANT_ID?.trim() || DEFAULT_TENANT_ID;
  }

  if (!TENANT_ID_PATTERN.test(trimmed)) {
    throw new Error("Invalid tenant id");
  }

  return trimmed;
}

export function getTenantIdFromRequest(request: Request | NextRequest): string {
  const url = new URL(request.url);
  const queryTenant = url.searchParams.get("tenantId");
  const headerTenant = request.headers.get("x-tenant-id");
  const cookieTenant =
    "cookies" in request
      ? request.cookies.get("tenant_id")?.value
      : parseCookieTenant(request.headers.get("cookie"));

  return normalizeTenantId(queryTenant || headerTenant || cookieTenant);
}

function parseCookieTenant(cookieHeader: string | null): string | undefined {
  if (!cookieHeader) {
    return undefined;
  }

  return cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith("tenant_id="))
    ?.slice("tenant_id=".length);
}

