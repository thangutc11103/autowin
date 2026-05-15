import type { Platform } from "./video";

export interface ScrapedVideo {
  externalId: string;
  title: string;
  url: string;
  platform: Platform;
  author?: string | null;
  thumbnail?: string | null;
  crawledAt: string;
  rawPayload?: Record<string, unknown>;
}

export interface ScrapeResult {
  videos: ScrapedVideo[];
  totalCount?: number;
  platform?: Platform;
  scrapedAt?: string;
  metadata?: {
    platform?: string;
    type?: string;
    value?: string;
    url?: string;
  };
}
