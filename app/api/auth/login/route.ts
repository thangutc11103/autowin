import { NextResponse } from "next/server";
import {
  DEVICE_COOKIE_NAME,
  SESSION_COOKIE_NAME,
  loginWithPassword,
} from "@/lib/auth/session-auth";
import { getTenantIdFromRequest } from "@/lib/tenant-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const login = typeof body.login === "string" ? body.login.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";

  if (!login || !password) {
    return NextResponse.json(
      { error: "Username and password are required" },
      { status: 400 },
    );
  }

  try {
    const deviceCookie = request.headers
      .get("cookie")
      ?.split(";")
      .map((part) => part.trim())
      .find((part) => part.startsWith(`${DEVICE_COOKIE_NAME}=`))
      ?.slice(DEVICE_COOKIE_NAME.length + 1);
    const tenantId = getTenantIdFromRequest(request);
    const result = await loginWithPassword({
      request,
      login,
      password,
      deviceId: deviceCookie,
      tenantId,
    });
    const response = NextResponse.json({ success: true, user: result.user });
    const secure = process.env.NODE_ENV === "production";

    response.cookies.set(SESSION_COOKIE_NAME, result.sessionToken, {
      httpOnly: true,
      sameSite: "lax",
      secure,
      path: "/",
      maxAge: 60 * 60 * 24 * 14,
    });
    response.cookies.set(DEVICE_COOKIE_NAME, result.deviceId, {
      httpOnly: true,
      sameSite: "lax",
      secure,
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });

    return response;
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Login failed" },
      { status: 401 },
    );
  }
}
