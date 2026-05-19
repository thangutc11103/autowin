import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_API_PATHS = [
  /^\/api\/health(?:\/.*)?$/,
  /^\/api\/auth\/[^/]+\/callback$/,
  /^\/api\/auth\/login$/,
];

function isPublicPath(pathname: string) {
  return (
    pathname.startsWith("/_next/") ||
    pathname === "/login" ||
    pathname.startsWith("/privacy") ||
    pathname.startsWith("/terms") ||
    pathname === "/favicon.ico" ||
    pathname === "/robots.txt" ||
    pathname === "/sitemap.xml" ||
    PUBLIC_API_PATHS.some((pattern) => pattern.test(pathname))
  );
}

function isProtectedPath(pathname: string) {
  if (isPublicPath(pathname)) {
    return false;
  }

  return pathname === "/" || pathname.startsWith("/api/") || !pathname.includes(".");
}

function hasTrustedUserHeader(request: NextRequest) {
  return (
    process.env.TRUST_AUTH_HEADERS === "true" &&
    Boolean(
      request.headers.get("x-user-id")?.trim() ||
        request.headers.get("x-user-email")?.trim(),
    )
  );
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (!isProtectedPath(pathname)) {
    return NextResponse.next();
  }

  if (hasTrustedUserHeader(request)) {
    return NextResponse.next();
  }

  if (request.cookies.get("autowin_session")?.value) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const loginUrl = request.nextUrl.clone();
  loginUrl.pathname = "/login";
  loginUrl.search = "";
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|.*\\.(?:png|jpg|jpeg|gif|webp|svg|ico)$).*)"],
};
