import { chromium, devices, type Browser, type Page, type Response } from "playwright";
import type { JobType } from "@/types/job";
import type { ScraperCrawlResult, ScraperVideo } from "./scraper-factory";

const FACEBOOK_WEB_ORIGIN = "https://facebook.com";
const FACEBOOK_MOBILE_ORIGIN = "https://m.facebook.com";

interface FacebookListingVideo extends ScraperVideo {
  platform: "facebook";
}

interface FacebookReelCandidate {
  reelId: string;
  reelUrl: string;
  detailUrl: string;
  title: string;
  thumbnail_url: string | null;
  author?: string;
}

interface FacebookDetailResult {
  videoSrc: string | null;
  poster: string | null;
  imageSrc: string | null;
  title: string | null;
}

interface FacebookVideoResponse {
  url: string;
  contentLength: number;
}

export class FacebookPlaywrightScraper {
  private decodeFacebookEfgTag(rawUrl: string): string {
    try {
      const parsed = new URL(rawUrl);
      const efg = parsed.searchParams.get("efg");

      if (!efg) {
        return "";
      }

      return Buffer.from(efg, "base64").toString("utf8");
    } catch {
      return "";
    }
  }

  private isFacebookAudioTrack(rawUrl: string): boolean {
    return this.decodeFacebookEfgTag(rawUrl).toLowerCase().includes("audio");
  }

  private getListingUrl(url: string, type: JobType): string {
    if (type !== "account") {
      return url;
    }

    try {
      const parsed = new URL(url);
      const profileId = parsed.searchParams.get("id");

      if (parsed.pathname === "/profile.php" && profileId) {
        const next = new URL(`${FACEBOOK_WEB_ORIGIN}/profile.php`);
        next.searchParams.set("id", profileId);
        next.searchParams.set("sk", "reels_tab");
        return next.toString();
      }

      const account = parsed.pathname.split("/").filter(Boolean)[0];

      if (account) {
        if (/^\d+$/.test(account)) {
          const next = new URL(`${FACEBOOK_WEB_ORIGIN}/profile.php`);
          next.searchParams.set("id", account);
          next.searchParams.set("sk", "reels_tab");
          return next.toString();
        }

        return `${FACEBOOK_WEB_ORIGIN}/${encodeURIComponent(account)}/reels/`;
      }
    } catch {
      return url;
    }

    return url;
  }

  private extractSourceAuthor(sourceUrl: string): string | undefined {
    try {
      const parsed = new URL(sourceUrl);
      const profileId = parsed.searchParams.get("id");

      if (profileId) {
        return profileId;
      }

      return parsed.pathname.split("/").filter(Boolean)[0];
    } catch {
      return undefined;
    }
  }

  private buildMobileReelUrl(reelId: string): string {
    return `${FACEBOOK_MOBILE_ORIGIN}/reel/${encodeURIComponent(reelId)}`;
  }

  private normalizeMediaUrl(rawUrl: string | null | undefined): string | null {
    if (!rawUrl) {
      return null;
    }

    const trimmed = rawUrl.trim();
    if (!trimmed || trimmed.startsWith("data:")) {
      return null;
    }

    if (trimmed.startsWith("//")) {
      return `https:${trimmed}`;
    }

    if (trimmed.startsWith("/")) {
      return `${FACEBOOK_MOBILE_ORIGIN}${trimmed}`;
    }

    try {
      const parsed = new URL(trimmed);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        return null;
      }

      if (parsed.hostname.includes("fbcdn.net") && parsed.pathname.endsWith(".mp4")) {
        parsed.searchParams.delete("bytestart");
        parsed.searchParams.delete("byteend");
      }

      return parsed.toString();
    } catch {
      return null;
    }
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

  private async preparePage(page: Page): Promise<void> {
    await page.setExtraHTTPHeaders({
      "accept-language": "vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7",
    });
  }

  private async extractReelCandidates(
    page: Page,
    listingUrl: string,
    limit: number,
  ): Promise<FacebookReelCandidate[]> {
    const author = this.extractSourceAuthor(listingUrl);
    const payload = JSON.stringify({
      author: author ?? null,
      limit,
      mobileOrigin: FACEBOOK_MOBILE_ORIGIN,
    });

    return (await page.evaluate(`(() => {
      const payload = ${payload};
      const candidates = [];
      const seen = new Set();

      const addCandidate = (reelId, sourceEl) => {
        if (!reelId || seen.has(reelId)) {
          return;
        }

        seen.add(reelId);
        const root = sourceEl ? sourceEl.closest("a, [role='link'], div, article") : null;
        const img =
          (root ? root.querySelector("img[src], img[data-src]") : null) ||
          (sourceEl ? sourceEl.querySelector("img[src], img[data-src]") : null);
        const labelRoot = root && root.closest("[aria-label]");
        const ariaLabel =
          (root ? root.getAttribute("aria-label") : "") ||
          (sourceEl ? sourceEl.getAttribute("aria-label") : "") ||
          (labelRoot ? labelRoot.getAttribute("aria-label") : "") ||
          "";
        const text =
          (root && root.textContent ? root.textContent.trim() : "") ||
          (sourceEl && sourceEl.textContent ? sourceEl.textContent.trim() : "");
        const title = ariaLabel.trim() || text || "Facebook reel";
        const imageSrc = img ? (img.src || img.getAttribute("src") || img.getAttribute("data-src")) : null;

        candidates.push({
          reelId,
          reelUrl: "https://facebook.com/reel/" + reelId,
          detailUrl: payload.mobileOrigin + "/reel/" + reelId,
          title,
          thumbnail_url: normalizeImageUrl(imageSrc),
          author: payload.author || undefined,
        });
      };

      const normalizeImageUrl = (rawUrl) => {
        if (!rawUrl || rawUrl.startsWith("data:")) {
          return null;
        }

        if (rawUrl.startsWith("//")) {
          return "https:" + rawUrl;
        }

        if (rawUrl.startsWith("/")) {
          return payload.mobileOrigin + rawUrl;
        }

        return rawUrl;
      };

      document.querySelectorAll("a[href]").forEach((link) => {
        const href = link.getAttribute("href") || "";
        const match = href.match(/\\/reel\\/(\\d+)/) || href.match(/[?&]v=(\\d+)/);
        addCandidate(match && match[1], link);
      });

      const html = document.documentElement.innerHTML || "";
      const patterns = [
        /(?:https?:\\\\?\\/\\\\?\\/)?(?:www\\\\.)?facebook\\\\.com\\\\?\\/reel\\\\?\\/(\\d+)/g,
        /\\\\?\\/reel\\\\?\\/(\\d+)/g,
        /"video_id"\\s*:\\s*"(\\d+)"/g,
        /"creation_story"[^]*?"id"\\s*:\\s*"(\\d+)"/g,
      ];

      patterns.forEach((pattern) => {
        let match;
        while ((match = pattern.exec(html)) && candidates.length < payload.limit) {
          addCandidate(match[1], null);
        }
      });

      return candidates.slice(0, payload.limit);
    })()`)) as FacebookReelCandidate[];
  }

  private async extractDetailVideo(
    page: Page,
    candidate: FacebookReelCandidate,
  ): Promise<FacebookListingVideo | null> {
    const videoResponses: FacebookVideoResponse[] = [];
    const audioResponses: FacebookVideoResponse[] = [];
    const collectVideoResponse = (response: Response) => {
      const contentType = response.headers()["content-type"] || "";
      const contentLength = Number(response.headers()["content-length"] || 0);
      const url = response.url();

      if (!contentType.toLowerCase().includes("video/") || contentLength <= 0) {
        return;
      }

      const targetResponses = this.isFacebookAudioTrack(url)
        ? audioResponses
        : videoResponses;

      targetResponses.push({
        url,
        contentLength,
      });
    };

    const getLargestMediaUrl = (responses: FacebookVideoResponse[]) => {
      return (
        responses
          .sort((a, b) => b.contentLength - a.contentLength)
          .map((response) => this.normalizeMediaUrl(response.url))
          .find((url): url is string => Boolean(url)) || null
      );
    };

    const getLargestMediaBytes = (responses: FacebookVideoResponse[]) => {
      if (responses.length === 0) {
        return undefined;
      }

      return responses.sort((a, b) => b.contentLength - a.contentLength)[0]
        ?.contentLength;
    };

    page.on("response", collectVideoResponse);

    await page.goto(candidate.detailUrl, {
      waitUntil: "domcontentloaded",
      timeout: 45000,
    });

    await page.waitForTimeout(1500);
    await page
      .locator("video")
      .first()
      .click({ timeout: 3000 })
      .catch(async () => {
        await page.mouse.click(330, 450).catch(() => undefined);
      });
    await page.waitForTimeout(5000);
    page.off("response", collectVideoResponse);

    const detail = (await page.evaluate(`(() => {
      const videos = Array.from(document.querySelectorAll("video"));
      const video = videos.find((item) => item.src || item.currentSrc || item.getAttribute("src")) || null;
      const img = document.querySelector("img[src]");
      const titleEl = document.querySelector("title");
      const labelEl = document.querySelector("[aria-label]");

      return {
        videoSrc: video ? (video.src || video.currentSrc || video.getAttribute("src")) : null,
        poster: video ? (video.poster || video.getAttribute("poster")) : null,
        imageSrc: img ? (img.src || img.getAttribute("src")) : null,
        title:
          (titleEl && titleEl.textContent ? titleEl.textContent.trim() : "") ||
          (labelEl ? labelEl.getAttribute("aria-label") : null) ||
          null,
      };
    })()`)) as FacebookDetailResult;

    const domVideoUrl = this.normalizeMediaUrl(detail.videoSrc);
    const networkVideoUrl = getLargestMediaUrl(videoResponses);
    const networkAudioUrl = getLargestMediaUrl(audioResponses);
    const videoUrl = networkVideoUrl || domVideoUrl;

    if (!videoUrl) {
      console.log(`  [Skip] No video src in Playwright detail: ${candidate.detailUrl}`);
      return null;
    }

    return {
      platform: "facebook",
      video_url: candidate.reelUrl,
      video_id: candidate.reelId,
      author: candidate.author,
      thumbnail_url:
        this.normalizeMediaUrl(detail.poster) ||
        candidate.thumbnail_url ||
        this.normalizeMediaUrl(detail.imageSrc),
      title: detail.title || candidate.title,
      rawPayload: {
        source: "playwright-facebook-reel-detail",
        reelUrl: candidate.reelUrl,
        detailUrl: candidate.detailUrl,
        mediaVideoUrl: videoUrl,
        mediaAudioUrl: networkAudioUrl,
        videoSource: networkVideoUrl ? "network-response" : "dom-video-src",
        videoResponseCount: videoResponses.length,
        audioResponseCount: audioResponses.length,
        selectedVideoBytes: getLargestMediaBytes(videoResponses),
        selectedAudioBytes: getLargestMediaBytes(audioResponses),
      },
    };
  }

  async crawlUrl(
    url: string,
    type: JobType,
    limit = 30,
  ): Promise<ScraperCrawlResult> {
    const requestedLimit = Number.isFinite(limit) && limit > 0 ? limit : 30;
    const listingUrl = this.getListingUrl(url, type);

    console.log(`\n[Facebook ${type}] Playwright listing: ${listingUrl}`);
    console.log(`  [Limit] ${requestedLimit}`);

    let browser: Browser | null = null;

    try {
      browser = await this.createBrowser();
      const context = await browser.newContext({
        locale: "vi-VN",
        userAgent:
          "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        viewport: {
          width: 669,
          height: 904,
        },
      });
      const page = await context.newPage();
      await this.preparePage(page);

      await page.goto(listingUrl, {
        waitUntil: "domcontentloaded",
        timeout: 45000,
      });
      await page.waitForTimeout(3500);

      const candidates = await this.extractReelCandidates(
        page,
        listingUrl,
        requestedLimit,
      );
      console.log(`  [Listing] Found ${candidates.length} reel candidates`);

      const videos: FacebookListingVideo[] = [];
      const detailContext = await browser.newContext({
        ...devices["Pixel 5"],
        locale: "vi-VN",
      });
      const detailPage = await detailContext.newPage();
      await this.preparePage(detailPage);

      for (const candidate of candidates) {
        if (videos.length >= requestedLimit) {
          break;
        }

        const video = await this.extractDetailVideo(detailPage, candidate);
        if (video) {
          videos.push(video);
        }
      }

      await detailContext.close();
      await context.close();

      console.log(
        `  [Done] Found ${videos.length} videos, returning ${videos.length}`,
      );

      return {
        platform: "facebook",
        type,
        url: listingUrl,
        count: videos.length,
        data: videos,
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error(`  [Error] ${msg}`);

      return {
        platform: "facebook",
        type,
        url: listingUrl,
        count: 0,
        data: [],
        error: msg,
      };
    } finally {
      if (browser) {
        await browser.close();
      }
    }
  }
}
