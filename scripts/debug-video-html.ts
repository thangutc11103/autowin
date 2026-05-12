/**
 * Debug: Inspect video page HTML structure
 */

import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import * as cheerio from "cheerio";
import { decodoScrape } from "@/lib/decodo/decodo-client";

async function debugVideoHTML() {
  console.log("\n████████████████████████████████████████████████████████");
  console.log("██  🔍 Debugging TikTok Video HTML Structure         ██");
  console.log("████████████████████████████████████████████████████████\n");

  const videoUrl =
    "https://www.tiktok.com/@alecjuliangarza/video/7638768704385289486";

  try {
    const result = await decodoScrape(videoUrl, "tiktok_post");
    const html = result.results?.[0]?.content || "";

    console.log(`[1] HTML Size: ${html.length} bytes\n`);

    // Save HTML for inspection
    const fs = await import("fs");
    fs.writeFileSync("/tmp/tiktok-video-debug.html", html);
    console.log(`[📄] HTML saved to /tmp/tiktok-video-debug.html\n`);

    const $ = cheerio.load(html);

    // Check title
    console.log(`[2] Title Analysis:`);
    const title = $("title").text();
    console.log(`  title: "${title}"`);

    // Check meta tags
    console.log(`\n[3] Meta Tags:`);
    const metaTags = [
      "og:title",
      "og:description",
      "og:image",
      "description",
      "keywords",
      "twitter:title",
    ];

    for (const tag of metaTags) {
      const content = $(`meta[property="${tag}"], meta[name="${tag}"]`).attr(
        "content",
      );
      if (content) {
        console.log(`  ${tag}: "${content}"`);
      }
    }

    // Check for JSON-LD
    console.log(`\n[4] JSON-LD Structured Data:`);
    $('script[type="application/ld+json"]').each((idx, el) => {
      const json = $(el).html() || "";
      if (json.length > 20 && json.length < 500) {
        try {
          const parsed = JSON.parse(json);
          console.log(
            `  [${idx}]:`,
            JSON.stringify(parsed, null, 2).substring(0, 200),
          );
        } catch (e) {
          console.log(`  [${idx}]: ${json.substring(0, 100)}...`);
        }
      }
    });

    // Check for stats/numbers
    console.log(`\n[5] Text containing numbers:`);
    const bodyText = $("body").text();
    const numbers = bodyText.match(
      /(\d+(?:K|M|B)?)\s*(views?|likes?|comments?|shares?)/gi,
    );
    if (numbers) {
      numbers.slice(0, 10).forEach((n) => console.log(`  ${n}`));
    }

    // Check for specific elements
    console.log(`\n[6] Key Elements:`);
    console.log(`  Links: ${$("a").length}`);
    console.log(`  Images: ${$("img").length}`);
    console.log(`  Data attributes: ${$("[data-testid]").length}`);
    console.log(`  Scripts: ${$("script").length}`);

    // Sample of all scripts
    console.log(`\n[7] Script Tags Content (first 5):`);
    $("script")
      .slice(0, 5)
      .each((idx, el) => {
        const html = $(el).html() || "";
        const len = html.length;
        if (len < 200) {
          console.log(`  [${idx}] (${len}b): ${html.substring(0, 100)}...`);
        } else {
          console.log(`  [${idx}] (${len}b): ${html.substring(0, 100)}...`);
        }
      });

    // Check for video metadata in common places
    console.log(`\n[8] Looking for Video Stats:`);

    // TikTok often puts data in JSON within HTML
    const jsonMatches = html.match(
      /"(\w*like\w*|view\w*|comment\w*)":\s*(\d+)/gi,
    );
    if (jsonMatches) {
      console.log(`  Found in JSON: ${jsonMatches.slice(0, 5).join(", ")}`);
    }

    // Check for React/Vue data
    const reactDataMatch = html.match(
      /__UNIVERSAL_DATA_FOR_REHYDRATION__(.+?)}<\/script>/,
    );
    if (reactDataMatch) {
      console.log(
        `  [FOUND] __UNIVERSAL_DATA_FOR_REHYDRATION__ (${reactDataMatch[1].length} chars)`,
      );
      try {
        const jsonStart = "{" + reactDataMatch[1].split("{").slice(1).join("{");
        const parsed = JSON.parse(jsonStart);
        console.log(`  Structure:`, Object.keys(parsed).slice(0, 5).join(", "));
      } catch (e) {
        console.log(`  (Could not parse)`);
      }
    }
  } catch (error) {
    console.error("❌ Error:", error);
  }

  console.log("\n████████████████████████████████████████████████████████\n");
}

debugVideoHTML();
