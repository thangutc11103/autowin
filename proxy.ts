import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_API_PATHS = [
  /^\/api\/health$/,
  /^\/api\/auth\/[^/]+\/callback$/,
];

function isPublicPath(pathname: string) {
  return (
    pathname.startsWith("/_next/") ||
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

function unauthorized() {
  return new NextResponse("Authentication required", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="Find App", charset="UTF-8"',
      "Cache-Control": "no-store",
    },
  });
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

function authMisconfigured() {
  return NextResponse.json(
    { error: "Admin authentication is not configured" },
    { status: 503 },
  );
}

function parseBasicAuth(header: string | null) {
  if (!header?.startsWith("Basic ")) {
    return null;
  }

  try {
    const decoded = atob(header.slice("Basic ".length));
    const separator = decoded.indexOf(":");

    if (separator < 0) {
      return null;
    }

    return {
      username: decoded.slice(0, separator),
      password: decoded.slice(separator + 1),
    };
  } catch {
    return null;
  }
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (!isProtectedPath(pathname)) {
    return NextResponse.next();
  }

  if (hasTrustedUserHeader(request)) {
    return NextResponse.next();
  }

  const username = process.env.ADMIN_USERNAME;
  const password = process.env.ADMIN_PASSWORD;

  if (!username || !password) {
    return process.env.NODE_ENV === "production"
      ? authMisconfigured()
      : NextResponse.next();
  }

  const credentials = parseBasicAuth(request.headers.get("authorization"));

  if (
    credentials?.username !== username ||
    credentials?.password !== password
  ) {
    return unauthorized();
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|.*\\.(?:png|jpg|jpeg|gif|webp|svg|ico)$).*)"],
};
