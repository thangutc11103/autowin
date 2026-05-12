/**
 * Test: Decodo with platform-specific targets
 */

import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import * as cheerio from "cheerio";
import { decodoScrape } from "@/lib/decodo/decodo-client";

async function testPlatformTargets() {
  console.log("\n████████████████████████████████████████████████████████");
  console.log("██  🎯 Testing Platform-Specific Decodo Targets      ██");
  console.log("████████████████████████████████████████████████████████\n");

  const url = "https://www.tiktok.com/tag/trending";
  const targets = ["universal", "tiktok_hashtag", "tiktok", "tiktok_post"];

  for (const target of targets) {
    try {
      console.log(`\n[${target}]`);
      const result = await decodoScrape(url, target as any);
      const html = result.results?.[0]?.content || result.body || "";

      console.log(`  Size: ${html.length} bytes`);

      if (html.length > 0) {
        const $ = cheerio.load(html);

        // Check for links
        const links = $("a").length;
        const videoLinks = $("a[href*='/video/']").length;

        console.log(`  Links: ${links}, Video links: ${videoLinks}`);

        // Check for video-related elements
        const hasVideoText = html.includes("/video/") ? "✅" : "❌";
        console.log(`  Has "/video/" URLs: ${hasVideoText}`);

        // Sample first few elements
        if (links > 0) {
          console.log(`  Sample links:`);
          $("a")
            .slice(0, 3)
            .each((_, el) => {
              const href = $(el).attr("href");
              const text = $(el).text().substring(0, 30);
              console.log(`    → ${href}`);
            });
        }
      }
    } catch (error) {
      console.error(`  ❌ Error:`, (error as Error).message);
    }
  }

  console.log("\n████████████████████████████████████████████████████████\n");
}

testPlatformTargets();
