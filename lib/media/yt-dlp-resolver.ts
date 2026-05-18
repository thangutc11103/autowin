import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

const DEFAULT_TIMEOUT_MS = 15000;

interface YtDlpFormat {
  url?: string;
  format_id?: string;
  ext?: string;
  protocol?: string;
  vcodec?: string;
  acodec?: string;
  height?: number;
  width?: number;
  tbr?: number;
  abr?: number;
  filesize?: number;
  filesize_approx?: number;
}

interface YtDlpInfo {
  id?: string;
  title?: string;
  thumbnail?: string;
  duration?: number;
  extractor?: string;
  webpage_url?: string;
  url?: string;
  ext?: string;
  vcodec?: string;
  acodec?: string;
  formats?: YtDlpFormat[];
}

interface CommandCandidate {
  command: string;
  prefixArgs: string[];
}

export interface MediaResolveResult {
  success: boolean;
  mediaVideoUrl?: string;
  mediaAudioUrl?: string;
  thumbnailUrl?: string;
  title?: string;
  duration?: number;
  extractor?: string;
  rawPayload?: Record<string, unknown>;
  error?: string;
}

function getYtDlpCommandCandidates(): CommandCandidate[] {
  if (process.env.YT_DLP_PATH) {
    return [{ command: process.env.YT_DLP_PATH, prefixArgs: [] }];
  }

  return [
    { command: "yt-dlp", prefixArgs: [] },
    { command: "python", prefixArgs: ["-m", "yt_dlp"] },
    { command: "py", prefixArgs: ["-m", "yt_dlp"] },
  ];
}

function buildYtDlpArgs(url: string): string[] {
  const args = [
    "-J",
    "--no-download",
    "--no-playlist",
    "--no-warnings",
    "--skip-download",
  ];

  if (process.env.YT_DLP_COOKIES) {
    args.push("--cookies", process.env.YT_DLP_COOKIES);
  }

  if (process.env.YT_DLP_COOKIES_FROM_BROWSER) {
    args.push("--cookies-from-browser", process.env.YT_DLP_COOKIES_FROM_BROWSER);
  }

  if (process.env.YT_DLP_USER_AGENT) {
    args.push("--user-agent", process.env.YT_DLP_USER_AGENT);
  }

  args.push(url);
  return args;
}

function isDirectHttpUrl(value: string | undefined): value is string {
  return Boolean(value && /^https?:\/\//i.test(value));
}

function isUsableFormat(format: YtDlpFormat): boolean {
  return isDirectHttpUrl(format.url) && format.protocol !== "m3u8_native";
}

function scoreVideoFormat(format: YtDlpFormat): number {
  return (
    (format.height || 0) * 1_000_000_000 +
    (format.width || 0) * 1_000_000 +
    (format.tbr || 0) * 1_000 +
    (format.filesize || format.filesize_approx || 0)
  );
}

function scoreAudioFormat(format: YtDlpFormat): number {
  return (
    (format.abr || format.tbr || 0) * 1_000_000 +
    (format.filesize || format.filesize_approx || 0)
  );
}

function pickMediaUrls(info: YtDlpInfo): {
  mediaVideoUrl?: string;
  mediaAudioUrl?: string;
} {
  const formats = info.formats || [];
  const videoFormats = formats
    .filter(
      (format) =>
        isUsableFormat(format) &&
        Boolean(format.vcodec && format.vcodec !== "none"),
    )
    .sort((a, b) => scoreVideoFormat(b) - scoreVideoFormat(a));

  const audioFormats = formats
    .filter(
      (format) =>
        isUsableFormat(format) &&
        Boolean(format.acodec && format.acodec !== "none") &&
        (!format.vcodec || format.vcodec === "none"),
    )
    .sort((a, b) => scoreAudioFormat(b) - scoreAudioFormat(a));

  const directVideoUrl =
    isDirectHttpUrl(info.url) && (!info.vcodec || info.vcodec !== "none")
      ? info.url
      : undefined;

  return {
    mediaVideoUrl: videoFormats[0]?.url || directVideoUrl,
    mediaAudioUrl: audioFormats[0]?.url,
  };
}

export async function resolveMediaWithYtDlp(
  url: string,
  timeoutMs = Number(process.env.YT_DLP_TIMEOUT_MS || DEFAULT_TIMEOUT_MS),
): Promise<MediaResolveResult> {
  const candidates = getYtDlpCommandCandidates();
  let lastError: unknown = null;

  for (const candidate of candidates) {
    try {
      const { stdout } = await execFileAsync(
        candidate.command,
        [...candidate.prefixArgs, ...buildYtDlpArgs(url)],
        {
          timeout: timeoutMs,
          maxBuffer: 20 * 1024 * 1024,
          windowsHide: true,
        },
      );
      const info = JSON.parse(stdout) as YtDlpInfo;
      const mediaUrls = pickMediaUrls(info);

      if (!mediaUrls.mediaVideoUrl) {
        return {
          success: false,
          error: "yt-dlp did not return a usable video URL",
          rawPayload: {
            source: "yt-dlp",
            extractor: info.extractor,
            formatCount: info.formats?.length || 0,
          },
        };
      }

      return {
        success: true,
        ...mediaUrls,
        thumbnailUrl: info.thumbnail,
        title: info.title,
        duration: info.duration,
        extractor: info.extractor,
        rawPayload: {
          source: "yt-dlp",
          extractor: info.extractor,
          ytDlpId: info.id,
          webpageUrl: info.webpage_url,
          formatCount: info.formats?.length || 0,
          resolvedAt: new Date().toISOString(),
        },
      };
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);

      if (
        message.includes("ENOENT") ||
        message.includes("not recognized") ||
        message.includes("No module named yt_dlp")
      ) {
        continue;
      }

      break;
    }
  }

  const message =
    lastError instanceof Error ? lastError.message : String(lastError);

  return {
    success: false,
    error:
      message.includes("ENOENT") ||
      message.includes("not recognized") ||
      message.includes("No module named yt_dlp")
        ? "yt-dlp is not installed or not found in PATH"
        : message,
    rawPayload: {
      source: "yt-dlp",
      resolvedAt: new Date().toISOString(),
    },
  };
}
