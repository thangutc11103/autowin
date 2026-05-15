/**
 * Decodo Scraper API Client
 * Handles all API communication with Decodo.
 */

export interface DecodoResponse {
  results?: Array<{
    content?: string;
    body?: string;
    html?: string;
    [key: string]: unknown;
  }>;
  content?: string;
  body?: string;
  html?: string;
  statusCode?: number;
  [key: string]: unknown;
}

export interface DecodoScrapeOptions {
  headless?: "html" | "png";
  proxy_pool?: "standard" | "premium";
  device_type?: "desktop" | "mobile" | "tablet";
}

export function extractDecodoHtml(result: DecodoResponse): string {
  return (
    result.results?.[0]?.content ||
    result.results?.[0]?.body ||
    result.results?.[0]?.html ||
    result.content ||
    result.body ||
    result.html ||
    ""
  );
}

export async function decodoScrape(
  url: string,
  target: string = "universal",
  options: DecodoScrapeOptions = {},
): Promise<DecodoResponse> {
  const token = process.env.DECODO_TOKEN;

  if (!token || token.includes("YOUR_")) {
    throw new Error(
      "DECODO_TOKEN not configured in .env.local. Get it from: https://scraper-api.decodo.com",
    );
  }

  try {
    console.log(`  [->] Decodo API: ${target} @ ${url.substring(0, 50)}...`);

    const response = await fetch("https://scraper-api.decodo.com/v2/scrape", {
      method: "POST",
      headers: {
        Authorization: `Basic ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        url,
        target,
        locale: "en-us",
        ...options,
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as DecodoResponse;
    const html = extractDecodoHtml(data);

    console.log(`  [OK] Success (${html.length} bytes)`);

    return data;
  } catch (error) {
    console.log(
      `  [Error] ${error instanceof Error ? error.message : String(error)}`,
    );
    throw error;
  }
}
