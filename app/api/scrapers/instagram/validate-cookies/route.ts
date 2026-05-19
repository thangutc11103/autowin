import { chromium, type BrowserContext } from "playwright";
import type { NextRequest } from "next/server";
import { createRateLimiter } from "@/lib/rate-limit";

export const runtime = "nodejs";

const rateLimiter = createRateLimiter(10); // 10 requests per minute (sensitive endpoint)

interface ValidateCookiesRequest {
  cookies?: string;
  tag?: string;
}

function parseInstagramCookies(cookieHeader: string) {
  return cookieHeader
    .split(";")
    .map((cookie) => cookie.trim())
    .filter(Boolean)
    .map((cookie) => {
      const separatorIndex = cookie.indexOf("=");
      const name =
        separatorIndex >= 0 ? cookie.slice(0, separatorIndex).trim() : "";
      const value =
        separatorIndex >= 0 ? cookie.slice(separatorIndex + 1).trim() : "";

      return {
        name,
        value,
        domain: ".instagram.com",
        path: "/",
        secure: true,
        httpOnly: true,
        sameSite: "Lax" as const,
      };
    })
    .filter((cookie) => cookie.name && cookie.value);
}

async function addInstagramCookies(
  context: BrowserContext,
  cookieHeader: string,
) {
  const cookies = parseInstagramCookies(cookieHeader);

  if (cookies.length === 0) {
    throw new Error("Cookie header is empty or invalid");
  }

  await context.addCookies(cookies);
}

function normalizeTag(value: string | undefined): string {
  return (
    (value || "trending")
      .trim()
      .replace(/^#/, "")
      .replace(/^@/, "")
      .replace(/^\/+/, "")
      .replace(/\/+$/, "") || "trending"
  );
}

export async function POST(request: NextRequest) {
  // Rate limiting
  const rateLimitResponse = await rateLimiter(request);
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  let browser;

  try {
    const body = (await request
      .json()
      .catch(() => ({}))) as ValidateCookiesRequest;
    const cookieHeader =
      typeof body.cookies === "string" ? body.cookies.trim() : "";

    if (!cookieHeader) {
      return Response.json(
        { success: false, error: "Cookies are required" },
        { status: 400 },
      );
    }

    browser = await chromium.launch({
      headless: true,
      args: [
        "--disable-blink-features=AutomationControlled",
        "--disable-dev-shm-usage",
        "--no-sandbox",
      ],
    });

    const context = await browser.newContext({
      locale: "vi-VN",
      userAgent:
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      viewport: {
        width: 1280,
        height: 900,
      },
    });
    await addInstagramCookies(context, cookieHeader);

    const page = await context.newPage();
    await page.setExtraHTTPHeaders({
      "accept-language": "vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7",
    });

    const tag = normalizeTag(body.tag);
    await page.goto(
      `https://www.instagram.com/explore/tags/${encodeURIComponent(tag)}/`,
      {
        waitUntil: "domcontentloaded",
        timeout: 45000,
      },
    );
    await page.waitForTimeout(2500);

    const validation = await page.evaluate(() => {
      const bodyText = document.body.innerText.toLowerCase();
      const title = document.title.toLowerCase();
      const links = Array.from(document.querySelectorAll("a[href]")).map(
        (link) => link.getAttribute("href") || "",
      );
      const loginLink = links.some((href) => href.includes("/accounts/login"));
      const contentLinks = links.filter(
        (href) => href.includes("/reel/") || href.includes("/p/"),
      ).length;
      const hasError =
        title.includes("không thể tải trang") ||
        bodyText.includes("đã xảy ra lỗi") ||
        bodyText.includes("couldn't load") ||
        bodyText.includes("something went wrong");
      const hasLogin =
        loginLink ||
        bodyText.includes("đăng nhập") ||
        bodyText.includes("log in") ||
        bodyText.includes("sign up");

      return {
        hasError,
        hasLogin,
        contentLinks,
      };
    });

    await context.close();

    if (validation.hasError || validation.hasLogin) {
      return Response.json(
        {
          success: false,
          error:
            "Cookies are not usable for Instagram hashtag pages. Use a logged-in Instagram web session cookie.",
          validation,
        },
        { status: 401 },
      );
    }

    return Response.json({
      success: true,
      validation,
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    return Response.json({ success: false, error: errorMsg }, { status: 500 });
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}
