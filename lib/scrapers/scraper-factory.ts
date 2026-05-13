import type { Platform } from "@/types/video";
import type { JobType } from "@/types/job";
import { TikTokDecodoScraper } from "./tiktok-decodo-scraper";

/**
 * Strategy Pattern: Factory để tạo các Scraper khác nhau cho từng nền tảng
 * Mỗi platform có strategy riêng để crawl dữ liệu
 */

export interface ScraperStrategy {
  crawl(url: string, type: JobType, limit?: number): Promise<any>;
}

// Production Scraper cho TikTok - Sử dụng Decodo API + Cheerio
// Không cần Playwright, không cần Proxy
class TikTokScraper implements ScraperStrategy {
  private decodoScraper = new TikTokDecodoScraper();
  /**
   * Crawl TikTok using Decodo API + Cheerio (Production-ready)
   * No Playwright needed, automatic bot detection handling
   */
  async crawl(url: string, type: JobType, limit?: number) {
    try {
      console.log(`[TikTok] Crawling ${type}: ${url}`);

      const result = await this.decodoScraper.crawlUrl(url, type, limit);

      if (!result.success || !result.data) {
        return {
          platform: "tiktok",
          type,
          url,
          count: 0,
          data: [],
          error: "Failed to crawl hashtag",
        };
      }

      // Transform to factory format
      const videos = result.data.map((v: any) => ({
        video_url: v.video_url,
        video_id: v.video_id,
        author: v.author,
        platform: "tiktok",
        title: `${v.author}'s TikTok`,
        views: null, // Will be null until we enrich with metadata
      }));

      console.log(`[TikTok] Found ${videos.length} videos`);

      return {
        platform: "tiktok",
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
  async crawl(url: string, type: JobType, _limit?: number): Promise<any> {
    // TODO: Implement Douyin crawling logic
    console.log(`Crawling Douyin ${type}: ${url}`);
    return {
      platform: "douyin",
      type,
      url,
      data: {},
    };
  }
}

// Example Scraper cho Facebook
class FacebookScraper implements ScraperStrategy {
  async crawl(url: string, type: JobType, _limit?: number): Promise<any> {
    // TODO: Implement Facebook crawling logic
    console.log(`Crawling Facebook ${type}: ${url}`);
    return {
      platform: "facebook",
      type,
      url,
      data: {},
    };
  }
}

// Example Scraper cho Instagram
class InstagramScraper implements ScraperStrategy {
  async crawl(url: string, type: JobType, _limit?: number): Promise<any> {
    // TODO: Implement Instagram crawling logic
    console.log(`Crawling Instagram ${type}: ${url}`);
    return {
      platform: "instagram",
      type,
      url,
      data: {},
    };
  }
}

// Example Scraper cho YouTube
class YouTubeScraper implements ScraperStrategy {
  async crawl(url: string, type: JobType, _limit?: number): Promise<any> {
    // TODO: Implement YouTube crawling logic
    console.log(`Crawling YouTube ${type}: ${url}`);
    return {
      platform: "youtube",
      type,
      url,
      data: {},
    };
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
