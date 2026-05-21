import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { createRateLimiter } from "@/lib/rate-limit";
import {
  getAccountsRedirect,
  getOAuthProvider,
  shouldUseSecureCookie,
  type OAuthProvider,
} from "@/lib/oauth-utils";
import { oauthStorage } from "@/lib/oauth-storage";
import { getTenantIdFromRequest } from "@/lib/tenant-context";

export const runtime = "nodejs";

const rateLimiter = createRateLimiter(20);

function redirectWithClearedState(
  provider: OAuthProvider,
  stateCookie: string,
) {
  const response = NextResponse.redirect(
    getAccountsRedirect(provider, "error"),
  );
  response.cookies.set(stateCookie, "", {
    httpOnly: true,
    maxAge: 0,
    path: "/",
    sameSite: "lax",
    secure: shouldUseSecureCookie(),
  });

  return response;
}

export async function GET(
  request: NextRequest,
  context: RouteContext<"/api/auth/[provider]/callback">,
) {
  const limitResponse = await rateLimiter(request);
  if (limitResponse) return limitResponse;

  const { provider } = await context.params;
  const config = getOAuthProvider(provider);

  if (!config) {
    console.error("[OAuth Callback] Unsupported provider:", provider);
    return NextResponse.json(
      { error: "Unsupported OAuth provider" },
      { status: 404 },
    );
  }

  const { searchParams } = new URL(request.url);
  const error = searchParams.get("error");
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const expectedState = request.cookies.get(config.stateCookie)?.value;

  console.log("[OAuth Callback]", {
    provider,
    hasCode: !!code,
    hasState: !!state,
    stateMatchesCookie: state === expectedState,
    error,
  });

  const stateMatchesCookie = Boolean(
    state && expectedState && state === expectedState,
  );
  const consumedState = state
    ? await oauthStorage.consumeOAuthState({
        state,
        provider: config.provider,
      })
    : { valid: false };
  const stateMatchesDatabase = consumedState.valid;
  const tenantId = consumedState.tenantId || getTenantIdFromRequest(request);
  const userId = consumedState.userId;

  if (error) {
    console.error(
      `[OAuth/${config.label}/Callback] Provider returned error: ${error}`,
    );
    await oauthStorage.addDebugEvent(
      {
        type: "oauth_error",
        provider: config.provider,
        message: `${config.label} returned an OAuth error`,
        details: {
          error,
          errorDescription: searchParams.get("error_description"),
        },
      },
      tenantId,
    );
    return redirectWithClearedState(config.provider, config.stateCookie);
  }

  if (!code || !state || (!stateMatchesCookie && !stateMatchesDatabase)) {
    console.error(
      `[OAuth/${config.label}/Callback] Invalid authorization response`,
      {
        hasCode: Boolean(code),
        hasState: Boolean(state),
        stateMatchesCookie,
        stateMatchesDatabase,
        provider: config.provider,
      },
    );
    await oauthStorage.addDebugEvent(
      {
        type: "oauth_error",
        provider: config.provider,
        message: `${config.label} callback failed state/code validation`,
        details: {
          hasCode: Boolean(code),
          hasState: Boolean(state),
          hasExpectedState: Boolean(expectedState),
          stateMatchesCookie,
          stateMatchesDatabase,
          cookieTenant: consumedState.tenantId,
          requestTenant: getTenantIdFromRequest(request),
        },
      },
      tenantId,
    );
    return redirectWithClearedState(config.provider, config.stateCookie);
  }

  try {
    await oauthStorage.addDebugEvent(
      {
        type: "oauth_callback",
        provider: config.provider,
        message: `${config.label} callback received; exchanging code`,
        details: {
          hasCode: true,
        },
      },
      tenantId,
    );

    const tokenData = await config.exchangeCode(code);

    for (const account of config.toAccounts(tokenData)) {
      await oauthStorage.addAccount({ ...account, userId }, tenantId);
    }

    const response = NextResponse.redirect(
      getAccountsRedirect(config.provider, "success"),
    );
    response.cookies.set(config.stateCookie, "", {
      httpOnly: true,
      maxAge: 0,
      path: "/",
      sameSite: "lax",
      secure: shouldUseSecureCookie(),
    });

    return response;
  } catch (exchangeError) {
    const errorMessage =
      exchangeError instanceof Error
        ? exchangeError.message.slice(0, 500)
        : String(exchangeError).slice(0, 500);

    console.error(`[OAuth/${config.label}/Callback] Token exchange failed`, {
      error: errorMessage,
      provider: config.provider,
      tenantId,
      userId,
      stack: exchangeError instanceof Error ? exchangeError.stack : undefined,
    });

    await oauthStorage.addDebugEvent(
      {
        type: "oauth_error",
        provider: config.provider,
        message: `${config.label} token exchange failed`,
        details: {
          error: errorMessage,
          errorType:
            exchangeError instanceof Error
              ? exchangeError.constructor.name
              : "unknown",
        },
      },
      tenantId,
    );
    return redirectWithClearedState(config.provider, config.stateCookie);
  }
}
