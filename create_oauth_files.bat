@echo off
setlocal enabledelayedexpansion

REM Create directories
echo Creating directories...
mkdir "app\api\auth\tiktok\callback" 2>nul
mkdir "app\api\auth\meta\callback" 2>nul
mkdir "app\api\auth\youtube\callback" 2>nul
echo Directories created.

REM Create TikTok route.ts
(
echo import type { NextRequest } from "next/server";
echo import { getTikTokAuthUrl } from "@/lib/oauth-utils";
echo import { createRateLimiter } from "@/lib/rate-limit";
echo.
echo export const runtime = "nodejs";
echo const rateLimiter = createRateLimiter(20^);
echo.
echo export async function GET(request: NextRequest^) {
echo   const limitResponse = await rateLimiter(request^);
echo   if (limitResponse^) return limitResponse;
echo.
echo   try {
echo     const state = crypto.getRandomValues(new Uint8Array(32^^)^).reduce(
echo       (acc, val^) =^> acc + val.toString(16^).padStart(2, "0"^), ""
echo     ^);
echo     
echo     const response = new Response(null, {
echo       status: 302,
echo       headers: {
echo         Location: getTikTokAuthUrl(state^),
echo         "Set-Cookie": `oauth_state_tiktok=${state}; Path=/; Max-Age=600; HttpOnly; Secure; SameSite=Lax`,
echo       },
echo     }^);
echo     return response;
echo   } catch (error^) {
echo     console.error("[OAuth/TikTok]", error^);
echo     return Response.json({ error: "Auth failed" }, { status: 500 }^);
echo   }
echo }
) > "app\api\auth\tiktok\route.ts"

echo Created: app\api\auth\tiktok\route.ts
