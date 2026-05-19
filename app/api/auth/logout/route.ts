import { NextResponse } from "next/server";
import {
  SESSION_COOKIE_NAME,
  revokeCurrentSession,
} from "@/lib/auth/session-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  await revokeCurrentSession(request);
  const response = NextResponse.json({ success: true });
  response.cookies.set(SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
  return response;
}
