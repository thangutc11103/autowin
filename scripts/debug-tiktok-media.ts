import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { chromium, devices, type Response } from "playwright";
import { brotliDecompressSync, gunzipSync, inflateSync } from "zlib";
import { decodoScrape, extractDecodoHtml } from "@/lib/decodo/decodo-client";

const DEFAULT_URL = "https://www.tiktok.com/@dt_11103/video/7639684516981853447";
const TIKTOK_API_USER_AGENT =
  "TikTok 26.2.0 rv:262018 (iPhone; iOS 14.4.2; en_US) Cronet";

function extractTikTokVideoId(url: string): string {
  const match = url.match(/\/video\/(\d+)/);

  if (!match?.[1]) {
    throw new Error("TikTok URL does not contain /video/{id}");
  }

  return match[1];
}

function decodeResponseBuffer(buffer: Buffer, encoding: string | null): string {
  const normalizedEncoding = (encoding || "").toLowerCase();

  if (normalizedEncoding.includes("gzip")) {
    return gunzipSync(buffer).toString("utf8");
  }

  if (normalizedEncoding.includes("br")) {
    return brotliDecompressSync(buffer).toString("utf8");
  }

  if (normalizedEncoding.includes("deflate")) {
    return inflateSync(buffer).toString("utf8");
  }

  if (buffer[0] === 0x1f && buffer[1] === 0x8b) {
    return gunzipSync(buffer).toString("utf8");
  }

  return buffer.toString("utf8");
}

function printSection(title: string) {
  console.log(`\n${"=".repeat(70)}`);
  console.log(title);
  console.log("=".repeat(70));
}

async function debugTikTokApi(videoId: string) {
  printSection("1) TikTok mobile feed API");

  const urls = [
    `https://api16-normal-c-useast1a.tiktokv.com/aweme/v1/feed/?aweme_id=${videoId}`,
    `https://api-h2.tiktokv.com/aweme/v1/feed/?aweme_id=${videoId}`,
    `https://api22-normal-c-useast1a.tiktokv.com/aweme/v1/feed/?aweme_id=${videoId}`,
  ];

  for (const url of urls) {
    try {
      const response = await fetch(url, {
        headers: {
          Accept: "application/json",
          "Accept-Encoding": "gzip, deflate, br",
          "User-Agent": TIKTOK_API_USER_AGENT,
        },
      });
      const buffer = Buffer.from(await response.arrayBuffer());
      const text = decodeResponseBuffer(buffer, response.headers.get("content-encoding")).trim();

      console.log(`URL: ${url}`);
      console.log(`HTTP: ${response.status}`);
      console.log(`bytes: ${buffer.length}`);
      console.log(`text head: ${text.slice(0, 160) || "(empty)"}`);

      if (!text) {
        continue;
      }

      const data = JSON.parse(text) as {
        aweme_list?: Array<{
          aweme_id?: string;
          desc?: string;
          video?: {
            play_addr?: { url_list?: string[] };
            download_addr?: { url_list?: string[] };
          };
        }>;
      };
      const items = data.aweme_list || [];
      console.log(`items: ${items.length}`);

      items.slice(0, 5).forEach((item, index) => {
        const urlsCount =
          (item.video?.play_addr?.url_list?.length || 0) +
          (item.video?.download_addr?.url_list?.length || 0);
        console.log(
          `  [${index}] id=${item.aweme_id || "none"} match=${item.aweme_id === videoId} mediaUrls=${urlsCount} desc=${(item.desc || "").slice(0, 80)}`,
        );
      });
    } catch (error) {
      console.log(`ERROR ${url}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

async function debugTikTokWebApi(inputUrl: string, videoId: string) {
  printSection("2) TikTok web item detail API");

  const urls = [
    `https://www.tiktok.com/api/item/detail/?itemId=${videoId}`,
    `https://www.tiktok.com/api/item/detail/?itemId=${videoId}&aid=1988`,
  ];

  for (const url of urls) {
    try {
      const response = await fetch(url, {
        headers: {
          Accept: "application/json,text/plain,*/*",
          Referer: inputUrl,
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        },
      });
      const text = await response.text();

      console.log(`URL: ${url}`);
      console.log(`HTTP: ${response.status}`);
      console.log(`content-type: ${response.headers.get("content-type")}`);
      console.log(`length: ${text.length}`);
      console.log(`head: ${text.slice(0, 200) || "(empty)"}`);
    } catch (error) {
      console.log(`ERROR ${url}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

async function debugDecodo(inputUrl: string, videoId: string) {
  printSection("3) Decodo page HTML");

  for (const target of ["tiktok_post", "universal"]) {
    try {
      const result = await decodoScrape(inputUrl, target);
      const html = extractDecodoHtml(result);
      const idIndex = html.indexOf(videoId);
      const playIndex = html.indexOf("playAddr");
      const downloadIndex = html.indexOf("downloadAddr");

      console.log(`target: ${target}`);
      console.log(`html length: ${html.length}`);
      console.log(`has requested id: ${idIndex >= 0}`);
      console.log(`playAddr index: ${playIndex}`);
      console.log(`downloadAddr index: ${downloadIndex}`);
      console.log(
        `near id: ${idIndex >= 0 ? html.slice(Math.max(0, idIndex - 120), idIndex + 220) : "(missing)"}`,
      );
      console.log(
        `near playAddr: ${playIndex >= 0 ? html.slice(Math.max(0, playIndex - 120), playIndex + 220) : "(missing)"}`,
      );
    } catch (error) {
      console.log(`ERROR Decodo ${target}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

async function debugPlaywright(inputUrl: string) {
  printSection("4) Playwright page DOM/network");

  const browser = await chromium.launch({
    headless: true,
    args: [
      "--disable-blink-features=AutomationControlled",
      "--disable-dev-shm-usage",
      "--no-sandbox",
    ],
  });

  try {
    const context = await browser.newContext({
      ...devices["Desktop Chrome"],
      locale: "vi-VN",
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    });
    const page = await context.newPage();
    const videoResponses: Array<{
      url: string;
      status: number;
      contentType: string;
      contentLength?: string;
    }> = [];

    page.on("response", (response: Response) => {
      const contentType = response.headers()["content-type"] || "";
      const url = response.url();

      if (
        contentType.toLowerCase().includes("video/") ||
        url.includes(".mp4") ||
        url.includes("mime_type=video")
      ) {
        videoResponses.push({
          url,
          status: response.status(),
          contentType,
          contentLength: response.headers()["content-length"],
        });
      }
    });

    await page.goto(inputUrl, {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });
    await page.waitForTimeout(3000);
    await page.locator("video").first().click({ timeout: 3000 }).catch(() => undefined);
    await page.waitForTimeout(8000);

    const dom = await page.evaluate(() => {
      const videos = Array.from(document.querySelectorAll("video")).map((video) => ({
        src: video.src || video.currentSrc || video.getAttribute("src"),
        duration: Number.isFinite(video.duration) ? video.duration : null,
        currentTime: video.currentTime,
        paused: video.paused,
      }));

      return {
        title: document.title,
        bodyHead: document.body.innerText.slice(0, 700),
        videos,
      };
    });

    console.log(JSON.stringify({ dom, videoResponses: videoResponses.slice(0, 12) }, null, 2));
    await context.close();
  } finally {
    await browser.close();
  }
}

async function main() {
  const inputUrl = process.argv[2] || DEFAULT_URL;
  const videoId = extractTikTokVideoId(inputUrl);

  console.log(`Debug TikTok media URL: ${inputUrl}`);
  console.log(`Requested video id: ${videoId}`);

  await debugTikTokApi(videoId);
  await debugTikTokWebApi(inputUrl, videoId);
  await debugDecodo(inputUrl, videoId);
  await debugPlaywright(inputUrl);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
