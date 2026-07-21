export type MaintenanceDecision = "allow" | "block-page" | "block-api";

export function isMaintenanceAdmin(
  user: { role: string } | null | undefined,
): boolean {
  return user?.role === "owner" || user?.role === "admin";
}

const STATIC_ROOT_PATHS = new Set([
  "/favicon.ico",
  "/robots.txt",
  "/sitemap.xml",
]);

const SESSION_CONTROL_API_PATHS = new Set([
  "/api/admin/maintenance",
  "/api/auth/me",
  "/api/auth/logout",
]);

function isStaticPagePath(pathname: string): boolean {
  return (
    pathname.startsWith("/_next/") ||
    STATIC_ROOT_PATHS.has(pathname) ||
    /\.[a-z0-9]+$/i.test(pathname)
  );
}

export function getMaintenanceDecision(input: {
  pathname: string;
  hasSessionCookie: boolean;
}): MaintenanceDecision {
  const { pathname, hasSessionCookie } = input;

  if (pathname.startsWith("/api/")) {
    if (/^\/api\/health(?:\/.*)?$/.test(pathname)) return "allow";
    if (hasSessionCookie && SESSION_CONTROL_API_PATHS.has(pathname)) {
      return "allow";
    }
    return "block-api";
  }

  if (isStaticPagePath(pathname)) return "allow";
  if (pathname === "/maintenance-control" && hasSessionCookie) return "allow";
  return "block-page";
}
