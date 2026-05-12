/**
 * Debug: Inspect HTML structure from Decodo
 * Find correct selectors for video links
 */

import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import * as cheerio from "cheerio";
import { decodoScrape } from "@/lib/decodo/decodo-client";

async function debugHtmlStructure() {
  console.log("\n████████████████████████████████████████████████████████");
  console.log("██  🔍 Debugging TikTok Hashtag HTML Structure       ██");
  console.log("████████████████████████████████████████████████████████\n");

  try {
    const url = "https://www.tiktok.com/tag/trending";
    console.log(`Fetching: ${url}\n`);

    const result = await decodoScrape(url, "universal");
    const html = result.results?.[0]?.content || "";

    const $ = cheerio.load(html);

    console.log(`[1] HTML Size: ${html.length} bytes\n`);

    // Check for various link patterns
    const patterns = [
      { name: 'a[href*="/video/"]', sel: 'a[href*="/video/"]' },
      { name: 'a[href*="video"]', sel: 'a[href*="video"]' },
      { name: 'a[href^="/"]', sel: 'a[href^="/"]' },
      { name: "a[data-testid]", sel: "a[data-testid]" },
      { name: 'div[data-testid*="video"]', sel: 'div[data-testid*="video"]' },
      { name: "a.video-card", sel: "a.video-card" },
      { name: 'a[class*="video"]', sel: 'a[class*="video"]' },
    ];

    console.log(`[2] Checking selectors:\n`);

    for (const pattern of patterns) {
      const count = $(pattern.sel).length;
      console.log(`  ${pattern.name}: ${count} elements`);

      if (count > 0 && count <= 5) {
        $(pattern.sel)
          .slice(0, 3)
          .each((_, el) => {
            const href = $(el).attr("href");
            const text = $(el).text().substring(0, 50);
            console.log(`    → href="${href}" text="${text}"`);
          });
      }
    }

    // Check page text for video indicators
    console.log(`\n[3] Page text analysis:\n`);
    const bodyText = $("body").text();
    console.log(`  Total text length: ${bodyText.length}`);
    console.log(`  Contains "video": ${bodyText.includes("video")}`);
    console.log(`  Contains "/video/": ${bodyText.includes("/video/")}`);
    console.log(`  Contains "trending": ${bodyText.includes("trending")}`);

    // Check for all links
    console.log(`\n[4] All links (first 10):\n`);
    $("a")
      .slice(0, 10)
      .each((_, el) => {
        const href = $(el).attr("href");
        const text = $(el).text().substring(0, 30);
        console.log(`  ${href} → "${text}"`);
      });

    // Check for video data attributes
    console.log(`\n[5] Elements with 'video' in data attributes:\n`);
    $("[data-testid*='video'], [data-e2e*='video']")
      .slice(0, 5)
      .each((_, el) => {
        console.log(
          `  ${el.name}:`,
          $(el).attr("data-testid") || $(el).attr("data-e2e"),
        );
      });

    // Check HTML structure around #trending
    console.log(`\n[6] HTML structure sample (first 1000 chars):\n`);
    console.log(html.substring(0, 1000));

    // Check for JSON data in script tags
    console.log(`\n[7] Script tags with JSON:\n`);
    $("script")
      .slice(0, 3)
      .each((_, el) => {
        const html = $(el).html() || "";
        const len = html.length;
        const preview = html.substring(0, 100);
        console.log(`  Script (${len} bytes): ${preview}...`);
      });
  } catch (error) {
    console.error("❌ Error:", error);
  }

  console.log("\n████████████████████████████████████████████████████████\n");
}

debugHtmlStructure();
