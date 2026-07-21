import { NextResponse, type NextRequest } from "next/server";
import { getMaintenanceDecision } from "@/lib/maintenance/policy";
import { createMaintenanceResponse } from "@/lib/maintenance/response";
import { getMaintenanceService } from "@/lib/maintenance/service";
import type { MaintenanceSnapshot } from "@/lib/maintenance/types";

const PUBLIC_API_PATHS = [
  /^\/api\/health(?:\/.*)?$/,
  /^\/api\/auth\/[^/]+\/callback$/,
  /^\/api\/auth\/login$/,
];

function isPublicPath(pathname: string): boolean {
  return (
    pathname.startsWith("/_next/") ||
    pathname === "/login" ||
    pathname.startsWith("/privacy") ||
    pathname.startsWith("/terms") ||
    pathname.startsWith("/data-deletion") ||
    pathname === "/favicon.ico" ||
    pathname === "/robots.txt" ||
    pathname === "/sitemap.xml" ||
    PUBLIC_API_PATHS.some((pattern) => pattern.test(pathname))
  );
}

function isProtectedPath(pathname: string): boolean {
  if (isPublicPath(pathname)) return false;
  return pathname === "/" || pathname.startsWith("/api/") || !pathname.includes(".");
}

function hasTrustedUserHeader(request: NextRequest): boolean {
  return (
    process.env.TRUST_AUTH_HEADERS === "true" &&
    Boolean(
      request.headers.get("x-user-id")?.trim() ||
        request.headers.get("x-user-email")?.trim(),
    )
  );
}

async function getDefaultMaintenanceState(): Promise<MaintenanceSnapshot> {
  return getMaintenanceService().getEffectiveState();
}

export async function handleProxyRequest(
  request: NextRequest,
  dependencies: {
    getMaintenanceState(): Promise<MaintenanceSnapshot>;
  } = { getMaintenanceState: getDefaultMaintenanceState },
): Promise<NextResponse> {
  const { pathname } = request.nextUrl;
  const maintenance = await dependencies.getMaintenanceState();

  if (maintenance.state.enabled) {
    const decision = getMaintenanceDecision({
      pathname,
      hasSessionCookie: Boolean(request.cookies.get("autowin_session")?.value),
    });
    if (decision !== "allow") {
      return createMaintenanceResponse(request, maintenance.state);
    }
  }

  if (!isProtectedPath(pathname)) return NextResponse.next();
  if (hasTrustedUserHeader(request)) return NextResponse.next();
  if (request.cookies.get("autowin_session")?.value) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json(
      { error: "Authentication required" },
      { status: 401 },
    );
  }

  const loginUrl = request.nextUrl.clone();
  loginUrl.pathname = "/login";
  loginUrl.search = "";
  return NextResponse.redirect(loginUrl);
}
