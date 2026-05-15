/**
 * TikTok Scraper using Decodo API + Cheerio
 * No Playwright needed.
 */

import * as cheerio from "cheerio";
import { chromium, devices, type Browser, type Page } from "playwright";
import { decodoScrape } from "@/lib/decodo/decodo-client";
import type { JobType } from "@/types/job";

interface TikTokListingVideo {
  platform: "tiktok";
  video_url: string;
  video_id: string;
  author: string;
  thumbnail_url: string | null;
  title?: string;
}

export class TikTokDecodoScraper {
  private normalizeVideoUrl(url: string | null | undefined): string | null {
    if (!url) {
      return null;
    }

    const trimmed = url.trim();
    if (!trimmed || !trimmed.includes("/video/")) {
      return null;
    }

    if (trimmed.startsWith("/")) {
      return `https://www.tiktok.com${trimmed}`;
    }

    try {
      const parsed = new URL(trimmed);

      if (parsed.hostname !== "www.tiktok.com" && parsed.hostname !== "tiktok.com") {
        return null;
      }

      return `https://www.tiktok.com${parsed.pathname}`;
    } catch {
      return null;
    }
  }

  private normalizeImageUrl(url: string | undefined): string | null {
    if (!url) {
      return null;
    }

    const trimmed = url.trim();
    if (!trimmed || trimmed.startsWith("data:")) {
      return null;
    }

    if (trimmed.startsWith("//")) {
      return `https:${trimmed}`;
    }

    return trimmed;
  }

  private getFirstSrcsetUrl(srcset: string | undefined): string | null {
    if (!srcset) {
      return null;
    }

    const firstCandidate = srcset.split(",")[0]?.trim().split(/\s+/)[0];
    return this.normalizeImageUrl(firstCandidate);
  }

  private extractThumbnailUrl(
    $: cheerio.CheerioAPI,
    el: Parameters<cheerio.CheerioAPI>[0],
  ): string | null {
    const candidates = [
      $(el).find("img").first().attr("src"),
      $(el).find("img").first().attr("data-src"),
      $(el).find("img").first().attr("data-lazy-src"),
      $(el).find("video").first().attr("poster"),
      $(el).closest("div, li, article").find("img").first().attr("src"),
      $(el).closest("div, li, article").find("img").first().attr("data-src"),
      $(el).closest("div, li, article").find("video").first().attr("poster"),
    ];

    for (const candidate of candidates) {
      const imageUrl = this.normalizeImageUrl(candidate);
      if (imageUrl) {
        return imageUrl;
      }
    }

    return (
      this.getFirstSrcsetUrl($(el).find("source").first().attr("srcset")) ||
      this.getFirstSrcsetUrl($(el).find("img").first().attr("srcset")) ||
      this.getFirstSrcsetUrl(
        $(el).closest("div, li, article").find("source").first().attr("srcset"),
      ) ||
      this.getFirstSrcsetUrl(
        $(el).closest("div, li, article").find("img").first().attr("srcset"),
      )
    );
  }

  private async createBrowser(): Promise<Browser> {
    return chromium.launch({
      headless: true,
      args: [
        "--disable-blink-features=AutomationControlled",
        "--disable-dev-shm-usage",
        "--no-sandbox",
      ],
    });
  }

  private async extractListingVideosWithPlaywright(
    page: Page,
    limit: number,
  ): Promise<TikTokListingVideo[]> {
    const payload = JSON.stringify({ limit });

    const candidates = (await page.evaluate(`(() => {
      const payload = ${payload};
      const videos = [];
      const seen = new Set();

      const normalizeImageUrl = (rawUrl) => {
        if (!rawUrl || rawUrl.startsWith("data:")) {
          return null;
        }

        if (rawUrl.startsWith("//")) {
          return "https:" + rawUrl;
        }

        return rawUrl;
      };

      const normalizeTitle = (rawTitle, fallback) => {
        const title = (rawTitle || "")
          .replace(/ do .+ tạo với bản nhạc .+$/i, "")
          .replace(/ created by .+ with .+$/i, "")
          .replace(/\\s+/g, " ")
          .trim();

        return title || fallback || "TikTok video";
      };

      document.querySelectorAll("a[href*='/video/']").forEach((link) => {
        const href = link.href || link.getAttribute("href") || "";
        const match = href.match(/@([^/]+)\\/video\\/(\\d+)/);

        if (!match || !match[1] || !match[2] || seen.has(match[2])) {
          return;
        }

        seen.add(match[2]);

        const container =
          link.closest("[data-e2e], article, div") ||
          link.parentElement ||
          link;
        const img = container.querySelector("img") || link.querySelector("img");
        const imageAlt = img ? img.getAttribute("alt") : "";
        const title =
          normalizeTitle(imageAlt, "") ||
          normalizeTitle(container.textContent, "TikTok video");

        videos.push({
          platform: "tiktok",
          video_url: "https://www.tiktok.com/@" + match[1] + "/video/" + match[2],
          video_id: match[2],
          author: match[1],
          thumbnail_url: normalizeImageUrl(img ? (img.src || img.getAttribute("src")) : null),
          title,
        });
      });

      return videos.slice(0, payload.limit);
    })()`)) as TikTokListingVideo[];

    return candidates;
  }

  private async crawlListingWithPlaywright(url: string, limit: number) {
    console.log(`  [->] Playwright TikTok listing: ${url}`);

    let browser: Browser | null = null;

    try {
      browser = await this.createBrowser();
      const context = await browser.newContext({
        ...devices["Desktop Chrome"],
        locale: "vi-VN",
        userAgent:
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      });
      const page = await context.newPage();

      await page.goto(url, {
        waitUntil: "domcontentloaded",
        timeout: 60000,
      });

      await page.waitForTimeout(6000);
      await page.mouse.wheel(0, 1200).catch(() => undefined);
      await page.waitForTimeout(2500);

      const videos = await this.extractListingVideosWithPlaywright(page, limit);

      await context.close();

      return videos;
    } finally {
      if (browser) {
        await browser.close();
      }
    }
  }

  private getPlaywrightFallbackUrl(url: string, type: JobType): string {
    if (type !== "hashtag") {
      return url;
    }

    try {
      const parsed = new URL(url);
      const parts = parsed.pathname.split("/").filter(Boolean);
      const tagIndex = parts.indexOf("tag");
      const hashtag = tagIndex >= 0 ? parts[tagIndex + 1] : "";

      if (hashtag) {
        return `https://www.tiktok.com/search?q=${encodeURIComponent(`#${decodeURIComponent(hashtag)}`)}`;
      }
    } catch {
      return url;
    }

    return url;
  }

  private buildListingResult(
    type: JobType,
    url: string,
    videos: TikTokListingVideo[],
  ) {
    return {
      success: true,
      platform: "tiktok",
      type,
      url,
      count: videos.length,
      data: videos,
    };
  }

  /**
   * Crawl a TikTok listing page and extract video URLs.
   */
  async crawlUrl(url: string, type: JobType, limit = 30) {
    const requestedLimit = Number.isFinite(limit) && limit > 0 ? limit : 30;

    console.log(`\n[TikTok ${type}] Crawling: ${url}`);
    console.log(`  [Limit] ${requestedLimit}`);

    try {
      if (type === "search") {
        const searchVideos = await this.crawlListingWithPlaywright(
          url,
          requestedLimit,
        );

        console.log(
          `  [Done] Found ${searchVideos.length} search videos, returning ${searchVideos.length}`,
        );

        return this.buildListingResult(type, url, searchVideos);
      }

      const result = await decodoScrape(url, "tiktok_post");

      const html = result.results?.[0]?.content || result.content || "";

      if (!html || html.length < 100) {
        throw new Error("Empty HTML response");
      }

      console.log(`  [Info] HTML size: ${html.length} bytes`);

      const $ = cheerio.load(html);
      const videos: TikTokListingVideo[] = [];
      const seen = new Set<string>();

      console.log("  [Extract] Extracting video URLs...");
      $("a[href*='/video/']").each((_, el) => {
        const href = $(el).attr("href");
        const fullUrl = this.normalizeVideoUrl(href);

        if (!fullUrl || seen.has(fullUrl)) {
          return;
        }

        seen.add(fullUrl);

        const authorMatch = fullUrl.match(/@([^/]+)/);
        const videoIdMatch = fullUrl.match(/\/video\/(\d+)/);
        const thumbnailUrl = this.extractThumbnailUrl($, el);

        videos.push({
          platform: "tiktok",
          video_url: fullUrl,
          video_id: videoIdMatch?.[1] || "",
          author: authorMatch?.[1] || "unknown",
          thumbnail_url: thumbnailUrl,
        });
      });

      const limitedVideos = videos.slice(0, requestedLimit);

      if (limitedVideos.length === 0) {
        console.log("  [Fallback] Decodo listing had no video links; trying Playwright listing...");
        const fallbackUrl = this.getPlaywrightFallbackUrl(url, type);
        const playwrightVideos = await this.crawlListingWithPlaywright(
          fallbackUrl,
          requestedLimit,
        );

        console.log(
          `  [Done] Found ${playwrightVideos.length} Playwright videos, returning ${playwrightVideos.length}`,
        );

        return this.buildListingResult(type, url, playwrightVideos);
      }

      console.log(
        `  [Done] Found ${videos.length} videos, returning ${limitedVideos.length}`,
      );

      return this.buildListingResult(type, url, limitedVideos);
    } catch (error) {
      console.error(
        `  [Error] ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }

  /**
   * Crawl hashtag page and extract video URLs.
   */
  async crawlHashtag(hashtag: string, limit = 30) {
    const url = `https://www.tiktok.com/tag/${encodeURIComponent(hashtag)}`;
    const result = await this.crawlUrl(url, "hashtag", limit);

    return {
      ...result,
      hashtag,
    };
  }

  /**
   * Batch crawl multiple hashtags.
   */
  async crawlHashtagBatch(hashtags: string[], limit = 30) {
    console.log(`\n[Batch] Processing ${hashtags.length} hashtags...`);

    const results = [];

    for (const hashtag of hashtags) {
      try {
        const result = await this.crawlHashtag(hashtag, limit);
        results.push(result);

        await new Promise((r) => setTimeout(r, 1000));
      } catch (error) {
        console.error(
          `  [Error] Skipped #${hashtag}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    return results;
  }
}
