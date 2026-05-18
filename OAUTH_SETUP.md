# OAuth Routes Setup

Due to Next.js limitations with dynamic folder creation in the file tools, you need to manually create these OAuth route files.

## Step 1: Create Directory Structure

```bash
# Create TikTok OAuth routes
mkdir -p app/api/auth/tiktok/callback

# Create Meta (Facebook/Instagram) OAuth routes  
mkdir -p app/api/auth/meta/callback

# Create YouTube OAuth routes
mkdir -p app/api/auth/youtube/callback
```

## Step 2: Create Route Files

### app/api/auth/tiktok/route.ts

```typescript
import type { NextRequest } from "next/server";
import { getTikTokAuthUrl, exchangeTikTokCode } from "@/lib/oauth-utils";
import { createRateLimiter } from "@/lib/rate-limit";
import { oauthStorage } from "@/lib/oauth-storage";

export const runtime = "nodejs";
const rateLimiter = createRateLimiter(20);

export async function GET(request: NextRequest) {
  const limitResponse = await rateLimiter(request);
  if (limitResponse) return limitResponse;

  try {
    const state = crypto.getRandomValues(new Uint8Array(32)).reduce(
      (acc, val) => acc + val.toString(16).padStart(2, "0"), ""
    );
    
    const response = new Response(null, {
      status: 302,
      headers: {
        Location: getTikTokAuthUrl(state),
        "Set-Cookie": `oauth_state_tiktok=${state}; Path=/; Max-Age=600; HttpOnly; Secure; SameSite=Lax`,
      },
    });
    return response;
  } catch (error) {
    console.error("[OAuth/TikTok]", error);
    return Response.json({ error: "Auth failed" }, { status: 500 });
  }
}
```

### app/api/auth/tiktok/callback/route.ts

```typescript
import type { NextRequest } from "next/server";
import { exchangeTikTokCode } from "@/lib/oauth-utils";
import { createRateLimiter } from "@/lib/rate-limit";
import { oauthStorage } from "@/lib/oauth-storage";

export const runtime = "nodejs";
const rateLimiter = createRateLimiter(20);

export async function GET(request: NextRequest) {
  const limitResponse = await rateLimiter(request);
  if (limitResponse) return limitResponse;

  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get("code");
    const error = searchParams.get("error");

    if (error) {
      return Response.json(
        { error: `TikTok OAuth error: ${error}` },
        { status: 401 }
      );
    }

    if (!code) {
      return Response.json({ error: "No authorization code" }, { status: 400 });
    }

    const tokenData = await exchangeTikTokCode(code);

    // Store token
    oauthStorage.addAccount({
      platform: "tiktok",
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token,
      expiresAt: new Date(Date.now() + tokenData.expires_in * 1000).toISOString(),
      handle: tokenData.open_id,
      connectedAt: new Date().toISOString(),
    });

    // Redirect to accounts page
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    return new Response(null, {
      status: 302,
      headers: { Location: `${baseUrl}/(dashboard)/accounts?oauth=tiktok&success=true` },
    });
  } catch (error) {
    console.error("[OAuth/TikTok/Callback]", error);
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    return new Response(null, {
      status: 302,
      headers: { Location: `${baseUrl}/(dashboard)/accounts?oauth=tiktok&error=true` },
    });
  }
}
```

### app/api/auth/meta/route.ts

```typescript
import type { NextRequest } from "next/server";
import { getMetaAuthUrl, exchangeMetaCode } from "@/lib/oauth-utils";
import { createRateLimiter } from "@/lib/rate-limit";

export const runtime = "nodejs";
const rateLimiter = createRateLimiter(20);

export async function GET(request: NextRequest) {
  const limitResponse = await rateLimiter(request);
  if (limitResponse) return limitResponse;

  try {
    const state = crypto.getRandomValues(new Uint8Array(32)).reduce(
      (acc, val) => acc + val.toString(16).padStart(2, "0"), ""
    );
    
    const response = new Response(null, {
      status: 302,
      headers: {
        Location: getMetaAuthUrl(state),
        "Set-Cookie": `oauth_state_meta=${state}; Path=/; Max-Age=600; HttpOnly; Secure; SameSite=Lax`,
      },
    });
    return response;
  } catch (error) {
    console.error("[OAuth/Meta]", error);
    return Response.json({ error: "Auth failed" }, { status: 500 });
  }
}
```

### app/api/auth/meta/callback/route.ts

```typescript
import type { NextRequest } from "next/server";
import { exchangeMetaCode } from "@/lib/oauth-utils";
import { createRateLimiter } from "@/lib/rate-limit";
import { oauthStorage } from "@/lib/oauth-storage";

export const runtime = "nodejs";
const rateLimiter = createRateLimiter(20);

export async function GET(request: NextRequest) {
  const limitResponse = await rateLimiter(request);
  if (limitResponse) return limitResponse;

  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get("code");
    const error = searchParams.get("error");

    if (error) {
      return Response.json(
        { error: `Meta OAuth error: ${error}` },
        { status: 401 }
      );
    }

    if (!code) {
      return Response.json({ error: "No authorization code" }, { status: 400 });
    }

    const tokenData = await exchangeMetaCode(code);

    // Store token for both Facebook and Instagram
    oauthStorage.addAccount({
      platform: "facebook",
      accessToken: tokenData.access_token,
      tokenType: "bearer",
      connectedAt: new Date().toISOString(),
    });

    oauthStorage.addAccount({
      platform: "instagram",
      accessToken: tokenData.access_token,
      tokenType: "bearer",
      connectedAt: new Date().toISOString(),
    });

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    return new Response(null, {
      status: 302,
      headers: { Location: `${baseUrl}/(dashboard)/accounts?oauth=meta&success=true` },
    });
  } catch (error) {
    console.error("[OAuth/Meta/Callback]", error);
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    return new Response(null, {
      status: 302,
      headers: { Location: `${baseUrl}/(dashboard)/accounts?oauth=meta&error=true` },
    });
  }
}
```

### app/api/auth/youtube/route.ts

```typescript
import type { NextRequest } from "next/server";
import { getGoogleAuthUrl, exchangeGoogleCode } from "@/lib/oauth-utils";
import { createRateLimiter } from "@/lib/rate-limit";

export const runtime = "nodejs";
const rateLimiter = createRateLimiter(20);

export async function GET(request: NextRequest) {
  const limitResponse = await rateLimiter(request);
  if (limitResponse) return limitResponse;

  try {
    const state = crypto.getRandomValues(new Uint8Array(32)).reduce(
      (acc, val) => acc + val.toString(16).padStart(2, "0"), ""
    );
    
    const response = new Response(null, {
      status: 302,
      headers: {
        Location: getGoogleAuthUrl(state),
        "Set-Cookie": `oauth_state_google=${state}; Path=/; Max-Age=600; HttpOnly; Secure; SameSite=Lax`,
      },
    });
    return response;
  } catch (error) {
    console.error("[OAuth/Google]", error);
    return Response.json({ error: "Auth failed" }, { status: 500 });
  }
}
```

### app/api/auth/youtube/callback/route.ts

```typescript
import type { NextRequest } from "next/server";
import { exchangeGoogleCode } from "@/lib/oauth-utils";
import { createRateLimiter } from "@/lib/rate-limit";
import { oauthStorage } from "@/lib/oauth-storage";

export const runtime = "nodejs";
const rateLimiter = createRateLimiter(20);

export async function GET(request: NextRequest) {
  const limitResponse = await rateLimiter(request);
  if (limitResponse) return limitResponse;

  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get("code");
    const error = searchParams.get("error");

    if (error) {
      return Response.json(
        { error: `Google OAuth error: ${error}` },
        { status: 401 }
      );
    }

    if (!code) {
      return Response.json({ error: "No authorization code" }, { status: 400 });
    }

    const tokenData = await exchangeGoogleCode(code);

    oauthStorage.addAccount({
      platform: "youtube",
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token,
      expiresAt: new Date(Date.now() + tokenData.expires_in * 1000).toISOString(),
      connectedAt: new Date().toISOString(),
    });

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    return new Response(null, {
      status: 302,
      headers: { Location: `${baseUrl}/(dashboard)/accounts?oauth=youtube&success=true` },
    });
  } catch (error) {
    console.error("[OAuth/Google/Callback]", error);
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    return new Response(null, {
      status: 302,
      headers: { Location: `${baseUrl}/(dashboard)/accounts?oauth=youtube&error=true` },
    });
  }
}
```

## Step 3: Update Accounts Page

Replace mock data in `app/(dashboard)/accounts/page.tsx` with real OAuth integration.

## Step 4: Update Automation Page

Replace mock data in `app/(dashboard)/automation/page.tsx` with real channel status from OAuth storage.

## Usage Links

- TikTok Auth: `/api/auth/tiktok`
- Meta Auth (Facebook/Instagram): `/api/auth/meta`
- YouTube Auth: `/api/auth/youtube`

Callbacks redirect to:
- TikTok: `https://dribble-bucked-ninetieth.ngrok-free.dev/api/auth/tiktok/callback`
- Meta: `https://dribble-bucked-ninetieth.ngrok-free.dev/api/auth/meta/callback`
- YouTube: `https://dribble-bucked-ninetieth.ngrok-free.dev/api/auth/youtube/callback`
