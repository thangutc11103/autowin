import { chromium, type Browser, type Page, type Response } from "playwright";
import type { JobType } from "@/types/job";
import type { ScraperCrawlResult, ScraperVideo } from "./scraper-factory";

const INSTAGRAM_ORIGIN = "https://www.instagram.com";

interface InstagramListingVideo extends ScraperVideo {
  platform: "instagram";
}

interface InstagramReelCandidate {
  shortcode: string;
  reelUrl: string;
  title: string;
  thumbnail_url: string | null;
  author?: string;
}

interface InstagramDetailResult {
  title: string | null;
  description: string | null;
  imageSrc: string | null;
  domVideoSrc: string | null;
  mediaVideoUrl: string | null;
  mediaAudioUrl: string | null;
  videoResponseCount: number;
  audioResponseCount: number;
}

interface InstagramMediaResponse {
  url: string;
  contentLength: number;
  efg: string;
}

export class InstagramPlaywrightScraper {
  private getListingUrl(url: string, type: JobType): string {
    if (type !== "account") {
      return url;
    }

    try {
      const parsed = new URL(url);
      const account = parsed.pathname.split("/").filter(Boolean)[0];

      if (account) {
        return `${INSTAGRAM_ORIGIN}/${encodeURIComponent(account)}/reels/`;
      }
    } catch {
      return url;
    }

    return url;
  }

  private extractSourceAuthor(sourceUrl: string): string | undefined {
    try {
      const parsed = new URL(sourceUrl);
      return parsed.pathname.split("/").filter(Boolean)[0];
    } catch {
      return undefined;
    }
  }

  private normalizeImageUrl(rawUrl: string | null | undefined): string | null {
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
      return `${INSTAGRAM_ORIGIN}${trimmed}`;
    }

    try {
      const parsed = new URL(trimmed);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        return null;
      }

      return parsed.toString();
    } catch {
      return null;
    }
  }

  private normalizeMediaUrl(rawUrl: string | null | undefined): string | null {
    if (!rawUrl) {
      return null;
    }

    const trimmed = rawUrl.trim();
    if (!trimmed || trimmed.startsWith("data:") || trimmed.startsWith("blob:")) {
      return null;
    }

    if (trimmed.startsWith("//")) {
      return `https:${trimmed}`;
    }

    try {
      const parsed = new URL(trimmed);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        return null;
      }

      if (parsed.pathname.endsWith(".mp4")) {
        parsed.searchParams.delete("bytestart");
        parsed.searchParams.delete("byteend");
      }

      return parsed.toString();
    } catch {
      return null;
    }
  }

  private decodeEfgTag(rawUrl: string): string {
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

  private isAudioTrack(rawUrl: string, decodedEfg: string): boolean {
    return `${rawUrl} ${decodedEfg}`.toLowerCase().includes("audio");
  }

  private getMediaScore(response: InstagramMediaResponse): number {
    const bitrateMatch = response.efg.match(/"bitrate":(\d+)/);
    const bitrate = bitrateMatch ? Number(bitrateMatch[1]) : 0;
    const resolutionScore =
      response.efg.includes("720") ? 3 : response.efg.includes("540") ? 2 : 1;

    return resolutionScore * 1_000_000_000 + bitrate + response.contentLength;
  }

  private getBestMediaUrl(responses: InstagramMediaResponse[]): string | null {
    return (
      [...responses]
        .sort((a, b) => this.getMediaScore(b) - this.getMediaScore(a))
        .map((response) => this.normalizeMediaUrl(response.url))
        .find((url): url is string => Boolean(url)) || null
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

  private async preparePage(page: Page): Promise<void> {
    await page.setExtraHTTPHeaders({
      "accept-language": "vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7",
    });
  }

  private async dismissDialogs(page: Page): Promise<void> {
    await page
      .getByRole("button", { name: /allow all|decline optional|not now|later/i })
      .first()
      .click({ timeout: 2500 })
      .catch(() => undefined);
  }

  private async extractReelCandidates(
    page: Page,
    listingUrl: string,
    limit: number,
  ): Promise<InstagramReelCandidate[]> {
    const author = this.extractSourceAuthor(listingUrl);
    const payload = JSON.stringify({
      author: author ?? null,
      limit,
      origin: INSTAGRAM_ORIGIN,
    });

    return (await page.evaluate(`(() => {
      const payload = ${payload};
      const candidates = [];
      const seen = new Set();

      const normalizeImageUrl = (rawUrl) => {
        if (!rawUrl || rawUrl.startsWith("data:")) {
          return null;
        }

        if (rawUrl.startsWith("//")) {
          return "https:" + rawUrl;
        }

        if (rawUrl.startsWith("/")) {
          return payload.origin + rawUrl;
        }

        return rawUrl;
      };

      document.querySelectorAll("a[href*='/reel/']").forEach((link) => {
        const href = link.getAttribute("href") || "";
        const match = href.match(/\\/reel\\/([^/?#]+)/);
        const shortcode = match && match[1];

        if (!shortcode || seen.has(shortcode)) {
          return;
        }

        seen.add(shortcode);

        const img = link.querySelector("img");
        const imageSrc = img ? (img.currentSrc || img.src || img.getAttribute("src")) : null;
        const alt = img ? (img.alt || img.getAttribute("alt") || "") : "";
        const label = link.getAttribute("aria-label") || "";
        const text = link.textContent ? link.textContent.trim() : "";
        const title =
          alt.trim() ||
          label.trim() ||
          text ||
          (payload.author ? payload.author + " Instagram reel" : "Instagram reel");

        candidates.push({
          shortcode,
          reelUrl: payload.origin + "/reel/" + shortcode + "/",
          title,
          thumbnail_url: normalizeImageUrl(imageSrc),
          author: payload.author || undefined,
        });
      });

      return candidates.slice(0, payload.limit);
    })()`)) as InstagramReelCandidate[];
  }

  private async extractDetailMetadata(
    page: Page,
    candidate: InstagramReelCandidate,
  ): Promise<InstagramDetailResult> {
    const videoResponses: InstagramMediaResponse[] = [];
    const audioResponses: InstagramMediaResponse[] = [];
    const collectMediaResponse = (response: Response) => {
      const contentType = response.headers()["content-type"] || "";
      const contentLength = Number(response.headers()["content-length"] || 0);
      const url = response.url();

      if (
        !url.includes(".mp4") &&
        !contentType.toLowerCase().includes("video/")
      ) {
        return;
      }

      const efg = this.decodeEfgTag(url);
      const targetResponses = this.isAudioTrack(url, efg)
        ? audioResponses
        : videoResponses;

      targetResponses.push({
        url,
        contentLength,
        efg,
      });
    };

    page.on("response", collectMediaResponse);

    try {
      await page.goto(candidate.reelUrl, {
        waitUntil: "domcontentloaded",
        timeout: 30000,
      });
      await page.waitForTimeout(1200);
      await page
        .locator("video")
        .first()
        .click({ timeout: 2500 })
        .catch(() => undefined);
      await page.waitForTimeout(2500);

      const metadata = (await page.evaluate(`(() => {
        const getMeta = (selector) => {
          const el = document.querySelector(selector);
          return el ? el.getAttribute("content") : null;
        };

        const titleEl = document.querySelector("title");
        const video = document.querySelector("video");

        return {
          title:
            getMeta("meta[property='og:title']") ||
            (titleEl && titleEl.textContent ? titleEl.textContent.trim() : null),
          description:
            getMeta("meta[property='og:description']") ||
            getMeta("meta[name='description']"),
          imageSrc:
            getMeta("meta[property='og:image']") ||
            getMeta("meta[name='twitter:image']"),
          domVideoSrc: video
            ? (video.src || video.currentSrc || video.getAttribute("src"))
            : null,
        };
      })()`)) as InstagramDetailResult;

      return {
        ...metadata,
        mediaVideoUrl:
          this.getBestMediaUrl(videoResponses) ||
          this.normalizeMediaUrl(metadata.domVideoSrc),
        mediaAudioUrl: this.getBestMediaUrl(audioResponses),
        videoResponseCount: videoResponses.length,
        audioResponseCount: audioResponses.length,
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.log(`  [Detail skip] ${candidate.reelUrl}: ${msg}`);
      return {
        title: null,
        description: null,
        imageSrc: null,
        domVideoSrc: null,
        mediaVideoUrl: null,
        mediaAudioUrl: null,
        videoResponseCount: videoResponses.length,
        audioResponseCount: audioResponses.length,
      };
    } finally {
      page.off("response", collectMediaResponse);
    }
  }

  async crawlUrl(
    url: string,
    type: JobType,
    limit = 30,
  ): Promise<ScraperCrawlResult> {
    const requestedLimit = Number.isFinite(limit) && limit > 0 ? limit : 30;
    const listingUrl = this.getListingUrl(url, type);

    console.log(`\n[Instagram ${type}] Playwright listing: ${listingUrl}`);
    console.log(`  [Limit] ${requestedLimit}`);

    if (type !== "account") {
      return {
        platform: "instagram",
        type,
        url: listingUrl,
        count: 0,
        data: [],
        error: "Instagram scraper only supports account jobs",
      };
    }

    let browser: Browser | null = null;

    try {
      browser = await this.createBrowser();
      const context = await browser.newContext({
        locale: "vi-VN",
        userAgent:
          "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        viewport: {
          width: 1280,
          height: 900,
        },
      });
      const page = await context.newPage();
      await this.preparePage(page);

      await page.goto(listingUrl, {
        waitUntil: "domcontentloaded",
        timeout: 45000,
      });
      await this.dismissDialogs(page);
      await page.waitForTimeout(3500);

      let candidates = await this.extractReelCandidates(
        page,
        listingUrl,
        requestedLimit,
      );

      for (let attempt = 0; attempt < 6 && candidates.length < requestedLimit; attempt += 1) {
        await page.mouse.wheel(0, 1400);
        await page.waitForTimeout(1200);
        candidates = await this.extractReelCandidates(
          page,
          listingUrl,
          requestedLimit,
        );
      }

      const videos: InstagramListingVideo[] = [];
      for (const candidate of candidates.slice(0, requestedLimit)) {
        const detail = await this.extractDetailMetadata(page, candidate);
        const detailTitle = detail.description || detail.title;
        const title =
          detailTitle && !detailTitle.toLowerCase().includes("instagram")
            ? detailTitle
            : candidate.title;

        videos.push({
          platform: "instagram",
          video_url: candidate.reelUrl,
          video_id: candidate.shortcode,
          author: candidate.author,
          thumbnail_url:
            this.normalizeImageUrl(detail.imageSrc) ||
            this.normalizeImageUrl(candidate.thumbnail_url),
          title,
          rawPayload: {
            source: "playwright-instagram-reels-listing",
            reelUrl: candidate.reelUrl,
            listingUrl,
            detailTitle: detail.title,
            detailDescription: detail.description,
            domVideoSrc: detail.domVideoSrc,
            mediaVideoUrl: detail.mediaVideoUrl,
            mediaAudioUrl: detail.mediaAudioUrl,
            videoResponseCount: detail.videoResponseCount,
            audioResponseCount: detail.audioResponseCount,
          },
        });
      }

      await context.close();

      console.log(
        `  [Done] Found ${videos.length} reels, returning ${videos.length}`,
      );

      return {
        platform: "instagram",
        type,
        url: listingUrl,
        count: videos.length,
        data: videos,
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error(`  [Error] ${msg}`);

      return {
        platform: "instagram",
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
