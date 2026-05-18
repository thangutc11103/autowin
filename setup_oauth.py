#!/usr/bin/env python3
"""
OAuth Routes Setup Script
Creates all necessary OAuth route files and directories for the Next.js application.
"""

import os
import sys
from pathlib import Path

# Project root
PROJECT_ROOT = Path(__file__).parent

# Directories to create
DIRS = [
    'app/api/auth/tiktok/callback',
    'app/api/auth/meta/callback',
    'app/api/auth/youtube/callback',
]

# File contents mapping
FILES = {
    'app/api/auth/tiktok/route.ts': '''import type { NextRequest } from "next/server";
import { getTikTokAuthUrl } from "@/lib/oauth-utils";
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
''',
    'app/api/auth/tiktok/callback/route.ts': '''import type { NextRequest } from "next/server";
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

    oauthStorage.addAccount({
      platform: "tiktok",
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token,
      expiresAt: new Date(Date.now() + tokenData.expires_in * 1000).toISOString(),
      handle: tokenData.open_id,
      connectedAt: new Date().toISOString(),
    });

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
''',
    'app/api/auth/meta/route.ts': '''import type { NextRequest } from "next/server";
import { getMetaAuthUrl } from "@/lib/oauth-utils";
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
''',
    'app/api/auth/meta/callback/route.ts': '''import type { NextRequest } from "next/server";
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

    oauthStorage.addAccount({
      platform: "facebook",
      accessToken: tokenData.access_token,
      connectedAt: new Date().toISOString(),
    });

    oauthStorage.addAccount({
      platform: "instagram",
      accessToken: tokenData.access_token,
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
''',
    'app/api/auth/youtube/route.ts': '''import type { NextRequest } from "next/server";
import { getGoogleAuthUrl } from "@/lib/oauth-utils";
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
''',
    'app/api/auth/youtube/callback/route.ts': '''import type { NextRequest } from "next/server";
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
''',
}

def main():
    """Create all directories and files."""
    print("🚀 OAuth Routes Setup")
    print("=" * 50)
    
    # Create directories
    print("\n📁 Creating directories...")
    for dir_path in DIRS:
        full_path = PROJECT_ROOT / dir_path
        full_path.mkdir(parents=True, exist_ok=True)
        print(f"  ✓ {dir_path}")
    
    # Create files
    print("\n📄 Creating route files...")
    for file_path, content in FILES.items():
        full_path = PROJECT_ROOT / file_path
        full_path.parent.mkdir(parents=True, exist_ok=True)
        full_path.write_text(content, encoding='utf-8')
        print(f"  ✓ {file_path}")
    
    print("\n✅ Setup complete!")
    print("\n" + "=" * 50)
    print("Created 6 OAuth route files:")
    print("  1. app/api/auth/tiktok/route.ts")
    print("  2. app/api/auth/tiktok/callback/route.ts")
    print("  3. app/api/auth/meta/route.ts")
    print("  4. app/api/auth/meta/callback/route.ts")
    print("  5. app/api/auth/youtube/route.ts")
    print("  6. app/api/auth/youtube/callback/route.ts")
    print("\n🎉 Ready to use! Restart your dev server with: npm run dev")

if __name__ == '__main__':
    main()
