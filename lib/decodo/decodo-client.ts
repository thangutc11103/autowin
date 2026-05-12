/**
 * Decodo Scraper API Client
 * Handles all API communication with Decodo
 */

export interface DecodoResponse {
  results?: Array<{
    content: string;
    [key: string]: any;
  }>;
  content?: string;
  statusCode?: number;
  [key: string]: any;
}

export async function decodoScrape(
  url: string,
  target: string = "universal",
): Promise<DecodoResponse> {
  const token = process.env.DECODO_TOKEN;

  if (!token || token.includes("YOUR_")) {
    throw new Error(
      "❌ DECODO_TOKEN not configured in .env.local. Get it from: https://scraper-api.decodo.com",
    );
  }

  try {
    console.log(`  [→] Decodo API: ${target} @ ${url.substring(0, 50)}...`);

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
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as DecodoResponse;

    console.log(
      `  [✅] Success (${data.results?.[0]?.content?.length || 0} bytes)`,
    );

    return data;
  } catch (error) {
    console.log(
      `  [✗] Error: ${error instanceof Error ? error.message : String(error)}`,
    );
    throw error;
  }
}
