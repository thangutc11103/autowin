import type { Platform } from "@/types/video";
import type { JobType } from "@/types/job";
import { FacebookPlaywrightScraper } from "./facebook-decodo-scraper";
import { InstagramPlaywrightScraper } from "./instagram-playwright-scraper";
import { TikTokDecodoScraper } from "./tiktok-decodo-scraper";
import { YouTubeShortsScraper } from "./youtube-shorts-scraper";

/**
 * Strategy Pattern: Factory để tạo các Scraper khác nhau cho từng nền tảng
 * Mỗi platform có strategy riêng để crawl dữ liệu
 */

export interface ScraperStrategy {
  crawl(
    url: string,
    type: JobType,
    limit?: number,
    options?: ScraperCrawlOptions,
  ): Promise<ScraperCrawlResult>;
}

export interface ScraperCrawlOptions {
  authCookies?: string;
  onVideo?: (video: ScraperVideo) => Promise<void> | void;
}

export interface ScraperVideo {
  video_url: string;
  video_id?: string;
  author?: string;
  thumbnail_url?: string | null;
  platform: Platform;
  title?: string;
  rawPayload?: Record<string, unknown>;
}

export interface ScraperCrawlResult {
  platform: Platform;
  type: JobType;
  url: string;
  count?: number;
  data: ScraperVideo[];
  error?: string;
}

// Production Scraper cho TikTok - Sử dụng Decodo API + Cheerio
// Không cần Playwright, không cần Proxy
class TikTokScraper implements ScraperStrategy {
  private decodoScraper = new TikTokDecodoScraper();
  /**
   * Crawl TikTok using Decodo API + Cheerio (Production-ready)
   * No Playwright needed, automatic bot detection handling
   */
  async crawl(
    url: string,
    type: JobType,
    limit?: number,
  ): Promise<ScraperCrawlResult> {
    try {
      console.log(`[TikTok] Crawling ${type}: ${url}`);

      const result = await this.decodoScraper.crawlUrl(url, type, limit);

      if (!result.success || !result.data) {
        return {
          platform: "tiktok" as const,
          type,
          url,
          count: 0,
          data: [],
          error: "Failed to crawl hashtag",
        };
      }

      // Transform to factory format
      const videos = result.data.map((v) => ({
        video_url: v.video_url,
        video_id: v.video_id,
        author: v.author,
        thumbnail_url: v.thumbnail_url,
        platform: "tiktok" as const,
        title: v.title || `${v.author}'s TikTok`,
        rawPayload: {
          videoId: v.video_id,
        },
      }));

      console.log(`[TikTok] Found ${videos.length} videos`);

      return {
        platform: "tiktok" as const,
        type,
        url,
        count: videos.length,
        data: videos,
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error(`[TikTok Error] ${msg}`);

      return {
        platform: "tiktok",
        type,
        url,
        data: [],
        count: 0,
        error: msg,
      };
    }
  }
}

// Example Scraper cho Douyin
class DouyinScraper implements ScraperStrategy {
  async crawl(url: string, type: JobType): Promise<ScraperCrawlResult> {
    // TODO: Implement Douyin crawling logic
    console.log(`Crawling Douyin ${type}: ${url}`);
    return {
      platform: "douyin",
      type,
      url,
      count: 0,
      data: [],
    };
  }
}

// Example Scraper cho Facebook
class FacebookScraper implements ScraperStrategy {
  private playwrightScraper = new FacebookPlaywrightScraper();

  async crawl(
    url: string,
    type: JobType,
    limit?: number,
    options?: ScraperCrawlOptions,
  ): Promise<ScraperCrawlResult> {
    console.log(`[Facebook] Crawling ${type}: ${url}`);
    return this.playwrightScraper.crawlUrl(url, type, limit, options);
  }
}

// Example Scraper cho Instagram
class InstagramScraper implements ScraperStrategy {
  private playwrightScraper = new InstagramPlaywrightScraper();

  async crawl(
    url: string,
    type: JobType,
    limit?: number,
    options?: ScraperCrawlOptions,
  ): Promise<ScraperCrawlResult> {
    console.log(`[Instagram] Crawling ${type}: ${url}`);
    return this.playwrightScraper.crawlUrl(url, type, limit, {
      authCookies: options?.authCookies,
    });
  }
}

// Example Scraper cho YouTube
class YouTubeScraper implements ScraperStrategy {
  private shortsScraper = new YouTubeShortsScraper();

  async crawl(
    url: string,
    type: JobType,
    limit?: number,
  ): Promise<ScraperCrawlResult> {
    console.log(`[YouTube] Crawling ${type}: ${url}`);
    return this.shortsScraper.crawlUrl(url, type, limit);
  }
}

/**
 * Factory class để lấy scraper dựa trên platform
 */
export class ScraperFactory {
  private static scrapers: Record<Platform, ScraperStrategy> = {
    tiktok: new TikTokScraper(),
    douyin: new DouyinScraper(),
    facebook: new FacebookScraper(),
    instagram: new InstagramScraper(),
    youtube: new YouTubeScraper(),
  };

  /**
   * Lấy scraper cho platform cụ thể
   * @param platform Platform name
   * @returns Scraper strategy cho platform đó
   */
  static getScraper(platform: Platform): ScraperStrategy {
    const scraper = this.scrapers[platform];
    if (!scraper) {
      throw new Error(`No scraper found for platform: ${platform}`);
    }
    return scraper;
  }

  /**
   * Register custom scraper (cho phép mở rộng)
   * @param platform Platform name
   * @param scraper Custom scraper implementation
   */
  static registerScraper(platform: Platform, scraper: ScraperStrategy): void {
    this.scrapers[platform] = scraper;
  }
}
