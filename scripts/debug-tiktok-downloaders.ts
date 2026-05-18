import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { createWriteStream } from "fs";
import { mkdir } from "fs/promises";
import path from "path";
import { Readable } from "stream";
import { finished } from "stream/promises";

const DEFAULT_URL = "https://www.tiktok.com/@dt_11103/video/7639684516981853447";
const OUT_DIR = path.join(process.cwd(), "debug", "tiktok-downloaders");

interface Candidate {
  provider: string;
  id?: string;
  title?: string;
  urls: string[];
  raw?: unknown;
}

function extractTikTokVideoId(url: string): string {
  const match = url.match(/\/video\/(\d+)/);

  if (!match?.[1]) {
    throw new Error("TikTok URL does not contain /video/{id}");
  }

  return match[1];
}

function printSection(title: string) {
  console.log(`\n${"=".repeat(70)}`);
  console.log(title);
  console.log("=".repeat(70));
}

function findUrlsDeep(value: unknown, urls: string[] = []): string[] {
  if (!value) {
    return urls;
  }

  if (typeof value === "string") {
    if (
      /^https?:\/\//i.test(value) &&
      (value.includes(".mp4") ||
        value.includes("mime_type=video") ||
        value.includes("/video/") ||
        value.includes("tikwm.com/video/media"))
    ) {
      urls.push(value);
    }

    return urls;
  }

  if (Array.isArray(value)) {
    value.forEach((item) => findUrlsDeep(item, urls));
    return urls;
  }

  if (typeof value === "object") {
    Object.values(value).forEach((item) => findUrlsDeep(item, urls));
  }

  return [...new Set(urls)];
}

function findIdDeep(value: unknown, requestedId: string): string | undefined {
  const raw = JSON.stringify(value);

  if (raw.includes(requestedId)) {
    return requestedId;
  }

  const idMatch = raw.match(/"id"\s*:\s*"(\d{16,22})"/) || raw.match(/"aweme_id"\s*:\s*"(\d{16,22})"/);
  return idMatch?.[1];
}

async function debugToby(url: string, requestedId: string): Promise<Candidate[]> {
  printSection("1) @tobyg74/tiktok-api-dl");

  const mod = await import("@tobyg74/tiktok-api-dl");
  const downloader = mod.Downloader as (
    url: string,
    options?: Record<string, unknown>,
  ) => Promise<unknown>;
  const candidates: Candidate[] = [];

  for (const version of ["v1", "v2", "v3"]) {
    try {
      const result = await downloader(url, {
        version,
        showOriginalResponse: true,
      });
      const urls = findUrlsDeep(result);
      const id = findIdDeep(result, requestedId);

      console.log(`version: ${version}`);
      console.log(`id: ${id || "unknown"} match=${id === requestedId}`);
      console.log(`urls: ${urls.length}`);
      console.log(JSON.stringify(result, null, 2).slice(0, 1200));

      candidates.push({
        provider: `tobyg74-${version}`,
        id,
        urls,
        raw: result,
      });
    } catch (error) {
      console.log(`ERROR ${version}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return candidates;
}

async function debugTikwm(url: string, requestedId: string): Promise<Candidate[]> {
  printSection("2) TikWM");

  const endpoints = [
    {
      name: "tikwm-api",
      url: "https://www.tikwm.com/api/",
      body: new URLSearchParams({
        url,
        hd: "1",
      }),
    },
    {
      name: "tikwm-api-v2",
      url: "https://www.tikwm.com/api/",
      body: new URLSearchParams({
        url,
      }),
    },
  ];
  const candidates: Candidate[] = [];

  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
          "User-Agent": "Mozilla/5.0",
        },
        body: endpoint.body,
      });
      const text = await response.text();
      const result = text ? JSON.parse(text) : null;
      const urls = findUrlsDeep(result);
      const id = findIdDeep(result, requestedId);

      console.log(`endpoint: ${endpoint.name}`);
      console.log(`HTTP: ${response.status}`);
      console.log(`id: ${id || "unknown"} match=${id === requestedId}`);
      console.log(`urls: ${urls.length}`);
      console.log(JSON.stringify(result, null, 2).slice(0, 1200));

      candidates.push({
        provider: endpoint.name,
        id,
        urls,
        raw: result,
      });
    } catch (error) {
      console.log(`ERROR ${endpoint.name}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return candidates;
}

async function downloadProbe(candidate: Candidate, requestedId: string) {
  if (candidate.id !== requestedId || candidate.urls.length === 0) {
    console.log(`Skip download probe for ${candidate.provider}: id mismatch or no URLs.`);
    return;
  }

  await mkdir(OUT_DIR, { recursive: true });
  const url = candidate.urls[0];
  const outputPath = path.join(OUT_DIR, `${candidate.provider}-${requestedId}.mp4`);
  const response = await fetch(url, {
    headers: {
      Referer: "https://www.tiktok.com/",
      "User-Agent": "Mozilla/5.0",
    },
  });

  console.log(`Download probe ${candidate.provider}: HTTP ${response.status}`);

  if (!response.ok || !response.body) {
    return;
  }

  const fileStream = createWriteStream(outputPath);
  const readable = Readable.fromWeb(
    response.body as unknown as Parameters<typeof Readable.fromWeb>[0],
  );
  await finished(readable.pipe(fileStream));
  console.log(`Saved probe file: ${outputPath}`);
}

async function main() {
  const inputUrl = process.argv[2] || DEFAULT_URL;
  const requestedId = extractTikTokVideoId(inputUrl);

  console.log(`URL: ${inputUrl}`);
  console.log(`requestedId: ${requestedId}`);

  const candidates = [
    ...(await debugToby(inputUrl, requestedId)),
    ...(await debugTikwm(inputUrl, requestedId)),
  ];

  printSection("3) Safe download probes");

  for (const candidate of candidates) {
    await downloadProbe(candidate, requestedId);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
