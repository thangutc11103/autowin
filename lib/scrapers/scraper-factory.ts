import type { Platform } from "@/types/video";
import type { JobType } from "@/types/job";

/**
 * Strategy Pattern: Factory để tạo các Scraper khác nhau cho từng nền tảng
 * Mỗi platform có strategy riêng để crawl dữ liệu
 */

export interface ScraperStrategy {
  crawl(url: string, type: JobType): Promise<any>;
}

// Example Scraper cho TikTok
class TikTokScraper implements ScraperStrategy {
  async crawl(url: string, type: JobType): Promise<any> {
    // TODO: Implement TikTok crawling logic
    // Sử dụng Playwright + stealth plugin để vượt qua anti-bot
    console.log(`Crawling TikTok ${type}: ${url}`);
    return {
      platform: "tiktok",
      type,
      url,
      data: {},
    };
  }
}

// Example Scraper cho Douyin
class DouyinScraper implements ScraperStrategy {
  async crawl(url: string, type: JobType): Promise<any> {
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
  async crawl(url: string, type: JobType): Promise<any> {
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
  async crawl(url: string, type: JobType): Promise<any> {
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
  async crawl(url: string, type: JobType): Promise<any> {
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
