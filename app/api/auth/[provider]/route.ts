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
import { getTenantIdFromRequest } from "@/lib/tenant-context";
import { getCurrentUser } from "@/lib/auth/session-auth";

export const runtime = "nodejs";

const rateLimiter = createRateLimiter(20);

export async function GET(
  request: NextRequest,
  context: RouteContext<"/api/auth/[provider]">,
) {
  try {
    const limitResponse = await rateLimiter(request);
    if (limitResponse) return limitResponse;

    const { provider } = await context.params;
    const tenantId = getTenantIdFromRequest(request);
    const currentUser = await getCurrentUser(request);
    const config = getOAuthProvider(provider);

    console.log(
      `[OAuth Init] Provider: ${provider}, Tenant: ${tenantId}, User: ${currentUser?.id || "anonymous"}`,
    );

    if (!config) {
      console.error(`[OAuth Init] Unsupported provider: ${provider}`);
      return NextResponse.json(
        { error: "Unsupported OAuth provider" },
        { status: 404 },
      );
    }

    const missingEnv = getMissingEnv(config);
    if (missingEnv.length > 0) {
      console.error(
        `[OAuth Init] Missing env for ${provider}: ${missingEnv.join(", ")}`,
      );
      return NextResponse.json(
        { error: "OAuth provider is not configured", missingEnv },
        { status: 500 },
      );
    }

    const state = createOAuthState();
    console.log(`[OAuth Init] Saving state for ${provider}`);

    await oauthStorage.saveOAuthState({
      state,
      provider: config.provider,
      tenantId,
      userId: currentUser?.id,
    });

    const authUrl = config.getAuthUrl(state);
    console.log(`[OAuth Init] Redirecting to: ${authUrl.substring(0, 100)}...`);

    const response = NextResponse.redirect(authUrl);

    response.cookies.set(config.stateCookie, state, {
      httpOnly: true,
      maxAge: 10 * 60,
      path: "/",
      sameSite: "lax",
      secure: shouldUseSecureCookie(),
    });

    console.log(
      `[OAuth Init] ${provider} redirect setup complete, secure: ${shouldUseSecureCookie()}`,
    );
    return response;
  } catch (error) {
    console.error(`[OAuth Init] Error:`, error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
