/**
 * TikTok Scraper using Decodo API + Cheerio
 * No Playwright needed!
 */

import * as cheerio from "cheerio";
import { decodoScrape } from "@/lib/decodo/decodo-client";

export class TikTokDecodoScraper {
  /**
   * Format large numbers with K, M, B suffix
   */
  private formatNumber(num: number): string {
    if (num >= 1000000000) {
      return (num / 1000000000).toFixed(1) + "B";
    }
    if (num >= 1000000) {
      return (num / 1000000).toFixed(1) + "M";
    }
    if (num >= 1000) {
      return (num / 1000).toFixed(1) + "K";
    }
    return String(num);
  }

  /**
   * Crawl hashtag page and extract video URLs
   */
  async crawlHashtag(hashtag: string) {
    const url = `https://www.tiktok.com/tag/${encodeURIComponent(hashtag)}`;

    console.log(`\n[🎵 TikTok Hashtag] Crawling: #${hashtag}`);

    try {
      const result = await decodoScrape(url, "tiktok_post");

      // Extract HTML from Decodo response
      const html = result.results?.[0]?.content || result.content || "";

      if (!html || html.length < 100) {
        throw new Error("Empty HTML response");
      }

      console.log(`  [ℹ️] HTML size: ${html.length} bytes`);

      // Parse with Cheerio
      const $ = cheerio.load(html);

      const videos: any[] = [];
      const seen = new Set<string>();

      // Extract video URLs
      console.log(`  [🔍] Extracting video URLs...`);
      $("a[href*='/video/']").each((_, el) => {
        const href = $(el).attr("href");

        if (!href) return;

        let fullUrl = href;

        // Convert relative to absolute URL
        if (href.startsWith("/")) {
          fullUrl = `https://www.tiktok.com${href}`;
        }

        if (!fullUrl.includes("/video/")) {
          return;
        }

        if (seen.has(fullUrl)) {
          return;
        }

        seen.add(fullUrl);

        const authorMatch = fullUrl.match(/@([^/]+)/);
        const videoIdMatch = fullUrl.match(/\/video\/(\d+)/);

        videos.push({
          platform: "tiktok",
          video_url: fullUrl,
          video_id: videoIdMatch?.[1] || "",
          author: authorMatch?.[1] || "unknown",
        });
      });

      console.log(`  [✅] Found ${videos.length} videos`);

      return {
        success: true,
        platform: "tiktok",
        hashtag,
        count: videos.length,
        data: videos.slice(0, 5), // Limit to 5
      };
    } catch (error) {
      console.error(
        `  [❌] Error: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }

  /**
   * Crawl single TikTok video and extract metadata
   */
  async crawlVideo(videoUrl: string) {
    console.log(
      `\n[🎬 TikTok Video] Crawling: ${videoUrl.split("/video/")[1]?.split("?")[0]}`,
    );

    try {
      const result = await decodoScrape(videoUrl, "tiktok_post");

      const html = result.results?.[0]?.content || result.content || "";

      if (!html || html.length < 100) {
        throw new Error("Empty HTML response");
      }

      console.log(`  [ℹ️] HTML size: ${html.length} bytes`);

      const $ = cheerio.load(html);

      // Extract title
      const title = $("title").text().trim() || "TikTok Video";

      // Extract structured data (JSON-LD)
      let structuredData: any = null;

      $('script[type="application/ld+json"]').each((_, el) => {
        try {
          const json = JSON.parse($(el).html() || "{}");

          if (json["@type"] === "VideoObject") {
            structuredData = json;
          }
        } catch {
          // Ignore parse errors
        }
      });

      // Extract author from URL
      const authorMatch = videoUrl.match(/@([^/]+)/);
      const author = authorMatch?.[1] || "unknown";

      // Extract from meta description (contains likes)
      // Format: "146.4K Likes, TikTok video from username..."
      const metaDescription =
        $('meta[name="description"]').attr("content") || "";
      const likesMatch = metaDescription.match(/([\d.]+[KM]?)\s+Likes?/i);
      const likes = likesMatch?.[1] || "N/A";

      // Try to find comment count in JSON
      let commentCount = "N/A";
      const htmlStr = $.html() || "";
      const commentMatch = htmlStr.match(/"commentCount":\s*(\d+)/);
      if (commentMatch) {
        commentCount = commentMatch[1];
      }

      // Try to extract views from page text or meta
      let views = "N/A";
      const viewsMatch = htmlStr.match(/"playCount":\s*(\d+)/);
      if (viewsMatch) {
        views = this.formatNumber(parseInt(viewsMatch[1]));
      }

      console.log(`  [✅] Extracted metadata`);

      return {
        success: true,
        platform: "tiktok",
        url: videoUrl,
        title,
        author,
        data: {
          description: structuredData?.description || metaDescription || null,
          thumbnail: structuredData?.thumbnailUrl || null,
          uploadDate: structuredData?.uploadDate || null,
          views,
          likes,
          comments: commentCount,
          authorName: structuredData?.author?.name || author,
          duration: structuredData?.duration || null,
        },
      };
    } catch (error) {
      console.error(
        `  [❌] Error: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }

  /**
   * Batch crawl multiple hashtags
   */
  async crawlHashtagBatch(hashtags: string[]) {
    console.log(`\n[📊 Batch] Processing ${hashtags.length} hashtags...`);

    const results = [];

    for (const hashtag of hashtags) {
      try {
        const result = await this.crawlHashtag(hashtag);
        results.push(result);

        // Rate limiting
        await new Promise((r) => setTimeout(r, 1000));
      } catch (error) {
        console.error(
          `  [❌] Skipped #${hashtag}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    return results;
  }
}
