import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { createRateLimiter } from "@/lib/rate-limit";
import {
  createOAuthState,
  getMissingEnv,
  getOAuthProvider,
  shouldUseSecureCookie,
} from "@/lib/oauth-utils";
import { oauthStorage } from "@/lib/oauth-storage";

export const runtime = "nodejs";

const rateLimiter = createRateLimiter(20);

export async function GET(
  request: NextRequest,
  context: RouteContext<"/api/auth/[provider]">,
) {
  const limitResponse = await rateLimiter(request);
  if (limitResponse) return limitResponse;

  const { provider } = await context.params;
  const config = getOAuthProvider(provider);

  if (!config) {
    return NextResponse.json({ error: "Unsupported OAuth provider" }, { status: 404 });
  }

  const missingEnv = getMissingEnv(config);
  if (missingEnv.length > 0) {
    return NextResponse.json(
      { error: "OAuth provider is not configured", missingEnv },
      { status: 500 },
    );
  }

  const state = createOAuthState();
  await oauthStorage.saveOAuthState({
    state,
    provider: config.provider,
  });

  const response = NextResponse.redirect(config.getAuthUrl(state));

  response.cookies.set(config.stateCookie, state, {
    httpOnly: true,
    maxAge: 10 * 60,
    path: "/",
    sameSite: "lax",
    secure: shouldUseSecureCookie(),
  });

  return response;
}
