import { createWriteStream, existsSync } from "fs";
import { mkdir, readFile, rename, rm } from "fs/promises";
import path from "path";
import { Readable } from "stream";
import { finished } from "stream/promises";
import { execFile } from "child_process";
import { promisify } from "util";
import { brotliDecompressSync, gunzipSync, inflateSync } from "zlib";
import ffmpegStatic from "ffmpeg-static";
import { resolveMediaWithYtDlp } from "@/lib/media/yt-dlp-resolver";
import {
  isR2Configured,
  R2_REQUIRED_IN_PRODUCTION_ERROR,
  uploadR2Object,
} from "@/lib/storage/r2";
import type { Video } from "@/types/video";

const execFileAsync = promisify(execFile);
const TIKTOK_API_USER_AGENT =
  "TikTok 26.2.0 rv:262018 (iPhone; iOS 14.4.2; en_US) Cronet";
const OUTPUT_DIR = path.join(
  /* turbopackIgnore: true */ process.cwd(),
  ".media-tmp",
  "prepared-videos",
);
const TEMP_DIR = path.join(
  /* turbopackIgnore: true */ process.cwd(),
  ".media-tmp",
);

interface TikTokDownloadResult {
  videoUrls: string[];
  videoId: string;
  provider: string;
}

interface TikTokProviderCandidate {
  videoUrls: string[];
  videoId?: string;
  provider: string;
}

function getFfmpegPath(): string {
  const configuredPath = process.env.FFMPEG_PATH;

  if (configuredPath) {
    if (!existsSync(configuredPath)) {
      throw new Error(`FFMPEG_PATH does not exist: ${configuredPath}`);
    }

    return configuredPath;
  }

  const ffmpegPath = ffmpegStatic;

  if (!ffmpegPath) {
    throw new Error("ffmpeg is not available. Install ffmpeg-static or set FFMPEG_PATH.");
  }

  if (existsSync(ffmpegPath)) {
    return ffmpegPath;
  }

  const normalizedBundledPath = ffmpegPath.replace(/^[/\\]ROOT[/\\]/, "");
  const projectLocalPath = path.join(
    /* turbopackIgnore: true */ process.cwd(),
    normalizedBundledPath,
  );

  if (existsSync(projectLocalPath)) {
    return projectLocalPath;
  }

  const packageLocalPath = path.join(
    /* turbopackIgnore: true */ process.cwd(),
    "node_modules",
    "ffmpeg-static",
    process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg",
  );

  if (existsSync(packageLocalPath)) {
    return packageLocalPath;
  }

  throw new Error(`ffmpeg binary not found. Tried: ${ffmpegPath}`);
}

function normalizeFileNamePart(value: string): string {
  return value
    .replace(/[^a-z0-9_-]+/gi, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80) || "video";
}

function getExtensionFromUrl(rawUrl: string, fallback: string): string {
  try {
    const parsed = new URL(rawUrl);
    const ext = path.extname(parsed.pathname).replace(/[^a-z0-9.]/gi, "");
    return ext || fallback;
  } catch {
    return fallback;
  }
}

function getVideoTenantId(video: Video): string {
  const rawTenantId = video.rawPayload?.tenantId;
  return typeof rawTenantId === "string" && rawTenantId.trim()
    ? rawTenantId.trim()
    : process.env.DEFAULT_TENANT_ID || "default";
}

async function finalizePreparedVideo(params: {
  video: Video;
  outputPath: string;
  localUrl: string;
  baseName: string;
  source: NonNullable<Video["preparedSource"]>;
  rawPayload?: Record<string, unknown>;
  mediaVideoUrl?: string;
  mediaAudioUrl?: string | null;
}): Promise<Video> {
  if (!isR2Configured()) {
    throw new Error(R2_REQUIRED_IN_PRODUCTION_ERROR);
  }

  const tenantId = getVideoTenantId(params.video);
  const key = `tenants/${tenantId}/prepared/${params.baseName}.mp4`;
  const uploaded = await uploadR2Object({
    key,
    body: await readFile(params.outputPath),
    contentType: "video/mp4",
    cacheControl: "public, max-age=31536000, immutable",
  });

  await rm(params.outputPath, { force: true }).catch(() => undefined);

  return {
    ...params.video,
    url: uploaded.publicUrl,
    mediaVideoUrl: params.mediaVideoUrl,
    mediaAudioUrl: params.mediaAudioUrl,
    preparedLocalPath: undefined,
    preparedLocalUrl: uploaded.publicUrl,
    preparedAt: new Date().toISOString(),
    preparedSource: params.source,
    rawPayload: {
      ...params.video.rawPayload,
      ...params.rawPayload,
      tenantId,
      storageProvider: "cloudflare-r2",
      r2Key: uploaded.key,
      publicUrl: uploaded.publicUrl,
      mimeType: "video/mp4",
    },
  };
}

function extractTikTokVideoId(url: string): string {
  const match = url.match(/\/video\/(\d+)/);

  if (!match?.[1]) {
    throw new Error("TikTok URL does not contain /video/{id}");
  }

  return match[1];
}

async function resolveTikTokRedirect(url: string): Promise<string> {
  if (!url.includes("vm.tiktok.com") && !url.includes("vt.tiktok.com")) {
    return url;
  }

  const response = await fetch(url, {
    redirect: "follow",
  });

  return response.url;
}

function extractTikTokVideoIdFromVideo(video: Video): string {
  const rawId = video.rawPayload?.videoId;

  if (typeof rawId === "string" && /^\d+$/.test(rawId)) {
    return rawId;
  }

  return extractTikTokVideoId(video.url);
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
        value.includes("tikwm.com/video/media"))
    ) {
      urls.push(value);
    }

    return urls;
  }

  if (Array.isArray(value)) {
    value.forEach((item) => findUrlsDeep(item, urls));
    return [...new Set(urls)];
  }

  if (typeof value === "object") {
    Object.values(value).forEach((item) => findUrlsDeep(item, urls));
  }

  return [...new Set(urls)];
}

function findTikTokIdDeep(value: unknown, requestedId: string): string | undefined {
  const raw = JSON.stringify(value);

  if (raw.includes(requestedId)) {
    return requestedId;
  }

  const idMatch =
    raw.match(/"id"\s*:\s*"(\d{16,22})"/) ||
    raw.match(/"aweme_id"\s*:\s*"(\d{16,22})"/);

  return idMatch?.[1];
}

async function getTikTokFromTobyProvider(
  url: string,
  requestedId: string,
): Promise<TikTokProviderCandidate> {
  const mod = await import("@tobyg74/tiktok-api-dl");
  const downloader = mod.Downloader as (
    url: string,
    options?: Record<string, unknown>,
  ) => Promise<unknown>;
  const result = await downloader(url, {
    version: "v1",
    showOriginalResponse: true,
  });

  return {
    provider: "tobyg74-v1",
    videoId: findTikTokIdDeep(result, requestedId),
    videoUrls: findUrlsDeep(result),
  };
}

async function getTikTokFromTikwmProvider(
  url: string,
  requestedId: string,
): Promise<TikTokProviderCandidate> {
  const response = await fetch("https://www.tikwm.com/api/", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      "User-Agent": "Mozilla/5.0",
    },
    body: new URLSearchParams({
      url,
      hd: "1",
    }),
  });
  const text = await response.text();

  if (!response.ok) {
    throw new Error(`TikWM returned HTTP ${response.status}`);
  }

  const result = text ? JSON.parse(text) : null;

  return {
    provider: "tikwm",
    videoId: findTikTokIdDeep(result, requestedId),
    videoUrls: findUrlsDeep(result),
  };
}

function decodeResponseBuffer(buffer: Buffer, encoding: string | null): string {
  const normalizedEncoding = (encoding || "").toLowerCase();

  if (normalizedEncoding.includes("gzip")) {
    return gunzipSync(buffer).toString("utf8");
  }

  if (normalizedEncoding.includes("br")) {
    return brotliDecompressSync(buffer).toString("utf8");
  }

  if (normalizedEncoding.includes("deflate")) {
    return inflateSync(buffer).toString("utf8");
  }

  if (buffer[0] === 0x1f && buffer[1] === 0x8b) {
    return gunzipSync(buffer).toString("utf8");
  }

  return buffer.toString("utf8");
}

async function fetchTikTokApiJson(apiUrl: string) {
  const response = await fetch(apiUrl, {
    headers: {
      "Accept": "application/json",
      "Accept-Encoding": "gzip, deflate, br",
      "User-Agent": TIKTOK_API_USER_AGENT,
    },
  });

  if (!response.ok) {
    throw new Error(`TikTok API returned HTTP ${response.status}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  const text = decodeResponseBuffer(buffer, response.headers.get("content-encoding")).trim();

  if (!text) {
    throw new Error("TikTok API returned an empty response");
  }

  try {
    return JSON.parse(text) as {
      aweme_list?: Array<{
        aweme_id?: string;
        video?: {
          play_addr?: {
            url_list?: string[];
          };
          download_addr?: {
            url_list?: string[];
          };
        };
        image_post_info?: unknown;
      }>;
    };
  } catch {
    throw new Error(
      `TikTok API returned non-JSON response: ${text.slice(0, 80)}`,
    );
  }
}

async function getTikTokDownloadUrlFromAwemeFeed(
  video: Video,
): Promise<TikTokDownloadResult> {
  const resolvedUrl = await resolveTikTokRedirect(video.url);
  const videoId =
    extractTikTokVideoIdFromVideo(video) || extractTikTokVideoId(resolvedUrl);
  const apiUrls = [
    `https://api16-normal-c-useast1a.tiktokv.com/aweme/v1/feed/?aweme_id=${videoId}`,
    `https://api-h2.tiktokv.com/aweme/v1/feed/?aweme_id=${videoId}`,
    `https://api22-normal-c-useast1a.tiktokv.com/aweme/v1/feed/?aweme_id=${videoId}`,
  ];

  let lastError = "";
  let data: {
    aweme_list?: Array<{
      aweme_id?: string;
      video?: {
        play_addr?: {
          url_list?: string[];
        };
        download_addr?: {
          url_list?: string[];
        };
      };
      image_post_info?: unknown;
    }>;
  } | null = null;

  for (const apiUrl of apiUrls) {
    try {
      data = await fetchTikTokApiJson(apiUrl);
      break;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
  }

  if (!data) {
    throw new Error(lastError || "TikTok API failed");
  }
  const item = data.aweme_list?.find(
    (candidate) => candidate.aweme_id === videoId,
  );

  if (!item) {
    throw new Error("TikTok API did not return the requested video");
  }

  if (item.image_post_info) {
    throw new Error("TikTok slideshow download is not supported in this media pipeline yet");
  }

  const videoUrls = [
    ...(item.video?.play_addr?.url_list || []),
    ...(item.video?.download_addr?.url_list || []),
  ].filter((url, index, urls) => url && urls.indexOf(url) === index);

  if (videoUrls.length === 0) {
    throw new Error("TikTok API did not return a playable video URL");
  }

  return {
    videoUrls,
    videoId,
    provider: "aweme-feed",
  };
}

async function getTikTokDownloadUrl(video: Video): Promise<TikTokDownloadResult> {
  const resolvedUrl = await resolveTikTokRedirect(video.url);
  const videoId =
    extractTikTokVideoIdFromVideo(video) || extractTikTokVideoId(resolvedUrl);
  const errors: string[] = [];
  const providers = [
    () => getTikTokFromTobyProvider(resolvedUrl, videoId),
    () => getTikTokFromTikwmProvider(resolvedUrl, videoId),
    () => getTikTokDownloadUrlFromAwemeFeed(video),
  ];

  for (const provider of providers) {
    try {
      const candidate = await provider();

      if (candidate.videoId !== videoId) {
        errors.push(
          `${candidate.provider}: id mismatch (${candidate.videoId || "unknown"})`,
        );
        continue;
      }

      if (candidate.videoUrls.length === 0) {
        errors.push(`${candidate.provider}: no media URLs`);
        continue;
      }

      return {
        provider: candidate.provider,
        videoId,
        videoUrls: candidate.videoUrls,
      };
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }

  throw new Error(errors.join("; ") || "No TikTok provider returned media");
}

async function downloadFile(
  url: string,
  targetPath: string,
  headers: HeadersInit = {},
): Promise<void> {
  console.log(`[MEDIA PREPARE] Downloading media url=${url.slice(0, 120)}`);
  const response = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0",
      ...headers,
    },
  });

  if (!response.ok || !response.body) {
    const errorText = await response.text().catch(() => "");
    console.error(
      `[MEDIA PREPARE] Download failed status=${response.status} contentType=${response.headers.get("content-type") || "unknown"} url=${url.slice(0, 120)}`,
    );
    throw new Error(
      errorText.trim() || `Failed to download media: HTTP ${response.status}`,
    );
  }

  const contentType = response.headers.get("content-type")?.toLowerCase() || "";
  if (contentType.includes("text/html") || contentType.includes("text/plain")) {
    const errorText = await response.text().catch(() => "");
    console.error(
      `[MEDIA PREPARE] Download returned non-media contentType=${contentType} url=${url.slice(0, 120)} body="${errorText.trim().slice(0, 120)}"`,
    );
    throw new Error(
      errorText.trim().slice(0, 160) ||
        `Unexpected media response content type: ${contentType}`,
    );
  }

  const fileStream = createWriteStream(targetPath);
  const readable = Readable.fromWeb(
    response.body as unknown as Parameters<typeof Readable.fromWeb>[0],
  );
  await finished(readable.pipe(fileStream));
}

async function downloadFirstAvailableFile(params: {
  urls: string[];
  targetPath: string;
  headers?: HeadersInit;
}): Promise<void> {
  let lastError = "";

  for (const url of params.urls) {
    try {
      await downloadFile(url, params.targetPath, params.headers);
      return;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      await rm(params.targetPath, { force: true }).catch(() => undefined);
    }
  }

  throw new Error(lastError || "Failed to download media");
}

async function muxVideoAndAudio(params: {
  videoPath: string;
  audioPath: string;
  outputPath: string;
}): Promise<void> {
  await execFileAsync(
    getFfmpegPath(),
    [
      "-y",
      "-i",
      params.videoPath,
      "-i",
      params.audioPath,
      "-c:v",
      "copy",
      "-c:a",
      "aac",
      "-b:a",
      "192k",
      "-map",
      "0:v:0",
      "-map",
      "1:a:0",
      "-shortest",
      params.outputPath,
    ],
    {
      windowsHide: true,
      timeout: Number(process.env.FFMPEG_TIMEOUT_MS || 120000),
      maxBuffer: 10 * 1024 * 1024,
    },
  );
}

async function getMediaUrls(video: Video): Promise<{
  mediaVideoUrl: string;
  mediaAudioUrl?: string | null;
}> {
  if (video.mediaVideoUrl) {
    console.log(`[MEDIA PREPARE] Using stored media URL video=${video.id} platform=${video.platform}`);
    return {
      mediaVideoUrl: video.mediaVideoUrl,
      mediaAudioUrl: video.mediaAudioUrl,
    };
  }

  console.log(`[MEDIA PREPARE] Resolving media with yt-dlp video=${video.id} platform=${video.platform}`);
  const resolved = await resolveMediaWithYtDlp(video.url);

  if (!resolved.success || !resolved.mediaVideoUrl) {
    throw new Error(resolved.error || "Could not resolve media URL");
  }

  return {
    mediaVideoUrl: resolved.mediaVideoUrl,
    mediaAudioUrl: resolved.mediaAudioUrl,
  };
}

async function refreshFacebookMediaUrls(video: Video): Promise<{
  mediaVideoUrl: string;
  mediaAudioUrl?: string | null;
} | null> {
  if (video.platform !== "facebook") {
    return null;
  }

  console.log(`[MEDIA PREPARE] Refreshing Facebook media URL video=${video.id} url=${video.url}`);
  const { FacebookPlaywrightScraper } = await import(
    "@/lib/scrapers/facebook-decodo-scraper"
  );
  const scraper = new FacebookPlaywrightScraper();
  const result = await scraper.crawlUrl(video.url, "url", 1);
  const freshVideo = result.data[0];
  const rawPayload = freshVideo?.rawPayload;
  const mediaVideoUrl =
    rawPayload && typeof rawPayload.mediaVideoUrl === "string"
      ? rawPayload.mediaVideoUrl
      : null;

  if (!mediaVideoUrl) {
    console.error(`[MEDIA PREPARE] Facebook refresh did not return media URL video=${video.id}`);
    return null;
  }

  console.log(`[MEDIA PREPARE] Facebook refresh returned media URL video=${video.id}`);
  return {
    mediaVideoUrl,
    mediaAudioUrl:
      rawPayload && typeof rawPayload.mediaAudioUrl === "string"
        ? rawPayload.mediaAudioUrl
        : null,
  };
}

export async function prepareVideoForPosting(video: Video): Promise<Video> {
  console.log(`[MEDIA PREPARE] Start video=${video.id} platform=${video.platform}`);
  await mkdir(OUTPUT_DIR, { recursive: true });
  await mkdir(TEMP_DIR, { recursive: true });

  const baseName = `${normalizeFileNamePart(video.platform)}-${normalizeFileNamePart(video.id)}-${Date.now()}`;
  const outputPath = path.join(OUTPUT_DIR, `${baseName}.mp4`);
  const localUrl = `/prepared-videos/${baseName}.mp4`;

  let tiktokError: string | null = null;

  if (video.platform === "tiktok") {
    try {
      console.log(`[MEDIA PREPARE] TikTok provider chain start video=${video.id}`);
      const tiktokMedia = await getTikTokDownloadUrl(video);
      const tempPath = path.join(TEMP_DIR, `${baseName}-tiktok.mp4`);

      console.log(
        `[MEDIA PREPARE] TikTok provider success video=${video.id} provider=${tiktokMedia.provider} urls=${tiktokMedia.videoUrls.length}`,
      );
      await downloadFirstAvailableFile({
        urls: tiktokMedia.videoUrls,
        targetPath: tempPath,
        headers: {
          "Referer": video.url,
          "User-Agent": TIKTOK_API_USER_AGENT,
        },
      });
      await rename(tempPath, outputPath);

      console.log(`[MEDIA PREPARE] TikTok prepared video=${video.id} provider=${tiktokMedia.provider}`);
      return finalizePreparedVideo({
        video,
        outputPath,
        localUrl,
        baseName,
        source: "tiktok-api",
        rawPayload: {
          preparedTikTokVideoId: tiktokMedia.videoId,
          preparedTikTokProvider: tiktokMedia.provider,
        },
      });
    } catch (error) {
      tiktokError = error instanceof Error ? error.message : String(error);
      console.error(`[MEDIA PREPARE] TikTok provider chain failed video=${video.id}: ${tiktokError}`);
    }
  }

  let mediaUrls;

  try {
    mediaUrls = await getMediaUrls(video);
  } catch (error) {
    const mediaError = error instanceof Error ? error.message : String(error);
    console.error(`[MEDIA PREPARE] Media URL resolve failed video=${video.id}: ${mediaError}`);
    throw new Error(
      tiktokError
        ? `TikTok API failed: ${tiktokError}. Media fallback failed: ${mediaError}`
        : mediaError,
    );
  }
  const prepareWithMediaUrls = async (urls: typeof mediaUrls) => {
    const videoExt = getExtensionFromUrl(urls.mediaVideoUrl, ".mp4");
    const videoTempPath = path.join(TEMP_DIR, `${baseName}-video${videoExt}`);
    const audioTempPath = urls.mediaAudioUrl
      ? path.join(
          TEMP_DIR,
          `${baseName}-audio${getExtensionFromUrl(urls.mediaAudioUrl, ".m4a")}`,
        )
      : null;

    try {
      await downloadFile(urls.mediaVideoUrl, videoTempPath);

      if (audioTempPath && urls.mediaAudioUrl) {
        await downloadFile(urls.mediaAudioUrl, audioTempPath);
        await muxVideoAndAudio({
          videoPath: videoTempPath,
          audioPath: audioTempPath,
          outputPath,
        });

        return finalizePreparedVideo({
          video,
          outputPath,
          localUrl,
          baseName,
          source: "ffmpeg-mux",
          mediaVideoUrl: urls.mediaVideoUrl,
          mediaAudioUrl: urls.mediaAudioUrl,
        });
      }

      await rename(videoTempPath, outputPath);

      return finalizePreparedVideo({
        video,
        outputPath,
        localUrl,
        baseName,
        source: "direct-media",
        mediaVideoUrl: urls.mediaVideoUrl,
        mediaAudioUrl: urls.mediaAudioUrl,
      });
    } finally {
      await rm(videoTempPath, { force: true }).catch(() => undefined);

      if (audioTempPath) {
        await rm(audioTempPath, { force: true }).catch(() => undefined);
      }
    }
  };

  try {
    const prepared = await prepareWithMediaUrls(mediaUrls);
    console.log(`[MEDIA PREPARE] Completed video=${video.id} source=${prepared.preparedSource || "unknown"}`);
    return prepared;
  } catch (error) {
    if (video.platform !== "facebook") {
      throw error;
    }

    console.error(
      `[MEDIA PREPARE] Facebook stored media failed video=${video.id}: ${error instanceof Error ? error.message : String(error)}`,
    );
    const freshMediaUrls = await refreshFacebookMediaUrls(video);
    if (!freshMediaUrls) {
      throw error;
    }

    const prepared = await prepareWithMediaUrls(freshMediaUrls);
    console.log(`[MEDIA PREPARE] Completed video=${video.id} source=${prepared.preparedSource || "unknown"} refreshed=true`);
    return prepared;
  }
}
