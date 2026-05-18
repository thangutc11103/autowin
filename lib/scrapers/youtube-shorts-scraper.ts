import { chromium, devices, type Browser, type Page } from "playwright";
import type { JobType } from "@/types/job";
import type { ScraperCrawlResult, ScraperVideo } from "./scraper-factory";

const YOUTUBE_ORIGIN = "https://www.youtube.com";

interface YouTubeShortsVideo extends ScraperVideo {
  platform: "youtube";
}

interface YouTubeShortCandidate {
  videoId: string;
  videoUrl: string;
  title: string;
  thumbnail_url: string | null;
  author?: string;
}

export class YouTubeShortsScraper {
  private normalizeInputValue(value: string): string {
    return value
      .trim()
      .replace(/^#/, "")
      .replace(/^@/, "")
      .replace(/^\/+/, "")
      .replace(/\/+$/, "");
  }

  private getListingUrl(url: string, type: JobType): string {
    try {
      const parsed = new URL(url);
      const segments = parsed.pathname.split("/").filter(Boolean);

      if (type === "hashtag") {
        const tagIndex = segments.indexOf("hashtag");
        const tag = tagIndex >= 0 ? segments[tagIndex + 1] : "";

        if (tag) {
          return `${YOUTUBE_ORIGIN}/hashtag/${encodeURIComponent(
            this.normalizeInputValue(decodeURIComponent(tag)),
          )}/shorts`;
        }
      }

      if (type === "account") {
        const handle = segments.find((segment) => segment.startsWith("@"));

        if (handle) {
          return `${YOUTUBE_ORIGIN}/${encodeURIComponent(
            this.normalizeInputValue(decodeURIComponent(handle)),
          ).replace(/^/, "@")}/shorts`;
        }
      }
    } catch {
      return url;
    }

    return url;
  }

  private extractSourceAuthor(listingUrl: string): string | undefined {
    try {
      const parsed = new URL(listingUrl);
      const handle = parsed.pathname
        .split("/")
        .filter(Boolean)
        .find((segment) => segment.startsWith("@"));

      return handle ? handle.replace(/^@/, "") : undefined;
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
      return `${YOUTUBE_ORIGIN}${trimmed}`;
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

  private async dismissConsent(page: Page): Promise<void> {
    await page
      .getByRole("button", { name: /accept all|i agree|đồng ý|chấp nhận/i })
      .first()
      .click({ timeout: 2500 })
      .catch(() => undefined);
  }

  private async extractShortCandidates(
    page: Page,
    listingUrl: string,
    limit: number,
  ): Promise<YouTubeShortCandidate[]> {
    const author = this.extractSourceAuthor(listingUrl);
    const payload = JSON.stringify({
      author: author ?? null,
      limit,
      origin: YOUTUBE_ORIGIN,
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

      const normalizeTitle = (rawTitle) => {
        const title = (rawTitle || "")
          .replace(/,\\s*[\\d,.]+\\s*(triệu|Tr|N|K|M|B)?\\s*(lượt xem|views).*$/i, "")
          .replace(/\\s+–\\s+phát video ngắn.*$/i, "")
          .replace(/\\s+-\\s+play short.*$/i, "")
          .replace(/\\s+/g, " ")
          .trim();

        return title && !/^(more actions|thao tác khác|shorts)$/i.test(title)
          ? title
          : "YouTube Short";
      };

      const getBestThumbnail = (renderer) => {
        const endpointThumb =
          renderer.onTap?.innertubeCommand?.reelWatchEndpoint?.thumbnail?.thumbnails;
        const viewModelSources =
          renderer.thumbnailViewModel?.thumbnailViewModel?.image?.sources;
        const sources = endpointThumb || viewModelSources || [];
        const best = sources
          .slice()
          .sort((a, b) => (b.width || 0) * (b.height || 0) - (a.width || 0) * (a.height || 0))[0];

        return normalizeImageUrl(best && best.url);
      };

      const addCandidate = (candidate) => {
        if (!candidate.videoId || seen.has(candidate.videoId)) {
          return;
        }

        seen.add(candidate.videoId);
        candidates.push(candidate);
      };

      const visitInitialData = (node) => {
        if (!node || typeof node !== "object" || candidates.length >= payload.limit) {
          return;
        }

        if (node.shortsLockupViewModel) {
          const renderer = node.shortsLockupViewModel;
          const command = renderer.onTap?.innertubeCommand;
          const url = command?.commandMetadata?.webCommandMetadata?.url;
          const urlMatch = url && url.match(/\\/shorts\\/([^/?#]+)/);
          const videoId = command?.reelWatchEndpoint?.videoId || (urlMatch && urlMatch[1]);

          if (videoId) {
            addCandidate({
              videoId,
              videoUrl: payload.origin + "/shorts/" + videoId,
              title: normalizeTitle(renderer.accessibilityText),
              thumbnail_url: getBestThumbnail(renderer),
              author: payload.author || undefined,
            });
          }
        }

        Object.values(node).forEach(visitInitialData);
      };

      visitInitialData(window.ytInitialData);

      document.querySelectorAll("a[href*='/shorts/']").forEach((link) => {
        const href = link.getAttribute("href") || "";
        const match = href.match(/\\/shorts\\/([^/?#]+)/);
        const videoId = match && match[1];

        if (!videoId) {
          return;
        }

        const container =
          link.closest("ytd-rich-item-renderer, ytd-grid-video-renderer, ytd-reel-item-renderer, ytd-video-renderer, #content") ||
          link.parentElement ||
          link;
        const img = container.querySelector("img") || link.querySelector("img");
        const titleEl =
          container.querySelector("h3") ||
          container.querySelector("h3 span") ||
          container.querySelector("#video-title") ||
          link;
        const titleFromElement =
          titleEl.getAttribute("title") ||
          titleEl.textContent ||
          "";
        const titleFromLink =
          link.getAttribute("title") ||
          link.getAttribute("aria-label") ||
          "";
        const rawTitle = titleFromElement || titleFromLink;
        const imageSrc = img
          ? (img.currentSrc || img.src || img.getAttribute("src"))
          : null;

        addCandidate({
          videoId,
          videoUrl: payload.origin + "/shorts/" + videoId,
          title: normalizeTitle(rawTitle),
          thumbnail_url: normalizeImageUrl(imageSrc),
          author: payload.author || undefined,
        });
      });

      return candidates.slice(0, payload.limit);
    })()`)) as YouTubeShortCandidate[];
  }

  async crawlUrl(
    url: string,
    type: JobType,
    limit = 30,
  ): Promise<ScraperCrawlResult> {
    const requestedLimit = Number.isFinite(limit) && limit > 0 ? limit : 30;
    const listingUrl = this.getListingUrl(url, type);

    console.log(`\n[YouTube ${type}] Shorts listing: ${listingUrl}`);
    console.log(`  [Limit] ${requestedLimit}`);

    if (type !== "hashtag" && type !== "account") {
      return {
        platform: "youtube",
        type,
        url: listingUrl,
        count: 0,
        data: [],
        error: "YouTube scraper only supports hashtag and account jobs",
      };
    }

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
      await this.preparePage(page);

      await page.goto(listingUrl, {
        waitUntil: "domcontentloaded",
        timeout: 60000,
      });
      await this.dismissConsent(page);
      await page.waitForTimeout(3500);

      let candidates = await this.extractShortCandidates(
        page,
        listingUrl,
        requestedLimit,
      );

      for (let attempt = 0; attempt < 6 && candidates.length < requestedLimit; attempt += 1) {
        await page.mouse.wheel(0, 1800);
        await page.waitForTimeout(1200);
        candidates = await this.extractShortCandidates(
          page,
          listingUrl,
          requestedLimit,
        );
      }

      await context.close();

      const videos: YouTubeShortsVideo[] = candidates
        .slice(0, requestedLimit)
        .map((candidate) => ({
          platform: "youtube",
          video_url: candidate.videoUrl,
          video_id: candidate.videoId,
          author: candidate.author,
          thumbnail_url:
            this.normalizeImageUrl(candidate.thumbnail_url) ||
            `https://i.ytimg.com/vi/${candidate.videoId}/hqdefault.jpg`,
          title: candidate.title,
          rawPayload: {
            source: "playwright-youtube-shorts-listing",
            listingUrl,
            shortUrl: candidate.videoUrl,
          },
        }));

      console.log(
        `  [Done] Found ${videos.length} shorts, returning ${videos.length}`,
      );

      return {
        platform: "youtube",
        type,
        url: listingUrl,
        count: videos.length,
        data: videos,
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error(`  [Error] ${msg}`);

      return {
        platform: "youtube",
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
