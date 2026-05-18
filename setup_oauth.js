const fs = require('fs');
const path = require('path');

const baseDir = process.cwd();

// Create directories
const dirs = [
  "app\\api\\auth\\tiktok\\callback",
  "app\\api\\auth\\meta\\callback",
  "app\\api\\auth\\youtube\\callback"
];

console.log("Creating directories...");
dirs.forEach(dir => {
  const fullPath = path.join(baseDir, dir);
  fs.mkdirSync(fullPath, { recursive: true });
  console.log("✓ Created:", dir);
});

// File contents
const fileContents = {
  "app\\api\\auth\\tiktok\\route.ts": `import type { NextRequest } from "next/server";
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
        "Set-Cookie": \`oauth_state_tiktok=\${state}; Path=/; Max-Age=600; HttpOnly; Secure; SameSite=Lax\`,
      },
    });
    return response;
  } catch (error) {
    console.error("[OAuth/TikTok]", error);
    return Response.json({ error: "Auth failed" }, { status: 500 });
  }
}`,
  
  "app\\api\\auth\\tiktok\\callback\\route.ts": `import type { NextRequest } from "next/server";
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
        { error: \`TikTok OAuth error: \${error}\` },
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
      headers: { Location: \`\${baseUrl}/(dashboard)/accounts?oauth=tiktok&success=true\` },
    });
  } catch (error) {
    console.error("[OAuth/TikTok/Callback]", error);
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    return new Response(null, {
      status: 302,
      headers: { Location: \`\${baseUrl}/(dashboard)/accounts?oauth=tiktok&error=true\` },
    });
  }
}`,

  "app\\api\\auth\\meta\\route.ts": `import type { NextRequest } from "next/server";
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
        "Set-Cookie": \`oauth_state_meta=\${state}; Path=/; Max-Age=600; HttpOnly; Secure; SameSite=Lax\`,
      },
    });
    return response;
  } catch (error) {
    console.error("[OAuth/Meta]", error);
    return Response.json({ error: "Auth failed" }, { status: 500 });
  }
}`,

  "app\\api\\auth\\meta\\callback\\route.ts": `import type { NextRequest } from "next/server";
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
        { error: \`Meta OAuth error: \${error}\` },
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
      headers: { Location: \`\${baseUrl}/(dashboard)/accounts?oauth=meta&success=true\` },
    });
  } catch (error) {
    console.error("[OAuth/Meta/Callback]", error);
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    return new Response(null, {
      status: 302,
      headers: { Location: \`\${baseUrl}/(dashboard)/accounts?oauth=meta&error=true\` },
    });
  }
}`,

  "app\\api\\auth\\youtube\\route.ts": `import type { NextRequest } from "next/server";
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
        "Set-Cookie": \`oauth_state_google=\${state}; Path=/; Max-Age=600; HttpOnly; Secure; SameSite=Lax\`,
      },
    });
    return response;
  } catch (error) {
    console.error("[OAuth/Google]", error);
    return Response.json({ error: "Auth failed" }, { status: 500 });
  }
}`,

  "app\\api\\auth\\youtube\\callback\\route.ts": `import type { NextRequest } from "next/server";
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
        { error: \`Google OAuth error: \${error}\` },
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
      headers: { Location: \`\${baseUrl}/(dashboard)/accounts?oauth=youtube&success=true\` },
    });
  } catch (error) {
    console.error("[OAuth/Google/Callback]", error);
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    return new Response(null, {
      status: 302,
      headers: { Location: \`\${baseUrl}/(dashboard)/accounts?oauth=youtube&error=true\` },
    });
  }
}`
};

// Create files
console.log("\nCreating files...");
Object.entries(fileContents).forEach(([filePath, content]) => {
  const fullPath = path.join(baseDir, filePath);
  fs.writeFileSync(fullPath, content, 'utf8');
  console.log("✓ Created:", filePath);
});

console.log("\n✅ All 6 files and 3 directories created successfully!");
