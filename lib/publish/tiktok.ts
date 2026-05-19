import { createReadStream } from "fs";
import { stat } from "fs/promises";
import path from "path";
import { oauthStorage } from "@/lib/oauth-storage";
import type { PublishTargetContext } from "@/lib/database/posting-storage";

type TikTokPrivacyLevel =
  | "PUBLIC_TO_EVERYONE"
  | "MUTUAL_FOLLOW_FRIENDS"
  | "SELF_ONLY"
  | "FOLLOWER_OF_CREATOR";

interface TikTokApiError {
  code?: string;
  message?: string;
  log_id?: string;
  logid?: string;
}

interface TikTokCreatorInfoResponse {
  data?: {
    creator_username?: string;
    creator_nickname?: string;
    privacy_level_options?: TikTokPrivacyLevel[];
    comment_disabled?: boolean;
    duet_disabled?: boolean;
    stitch_disabled?: boolean;
    max_video_post_duration_sec?: number;
  };
  error?: TikTokApiError;
}

interface TikTokInitResponse {
  data?: {
    publish_id?: string;
    upload_url?: string;
  };
  error?: TikTokApiError;
}

export class TikTokPublishError extends Error {
  response?: unknown;
  status?: number;
  filePath?: string;
  endpoint?: string;

  constructor(params: {
    message: string;
    response?: unknown;
    status?: number;
    filePath?: string;
    endpoint?: string;
  }) {
    super(params.message);
    this.name = "TikTokPublishError";
    this.response = params.response;
    this.status = params.status;
    this.filePath = params.filePath;
    this.endpoint = params.endpoint;
  }
}

function getTikTokErrorMessage(
  data: TikTokInitResponse | TikTokCreatorInfoResponse | string,
  fallback: string,
): string {
  if (typeof data === "string") {
    return fallback;
  }

  if (data.error?.code === "unaudited_client_can_only_post_to_private_accounts") {
    return "TikTok app is unaudited. Set the TikTok account to private and publish with SELF_ONLY, or submit the app for TikTok audit before posting to public accounts.";
  }

  return data.error?.message || data.error?.code || fallback;
}

export interface TikTokPublishResult {
  platformPostId: string;
  response: {
    creatorInfo?: TikTokCreatorInfoResponse;
    init: TikTokInitResponse;
    uploadStatus: number;
    mode: "direct" | "inbox";
  };
}

const TIKTOK_API_BASE = "https://open.tiktokapis.com";
const MIN_CHUNK_SIZE = 5 * 1024 * 1024;
const MAX_CHUNK_SIZE = 64 * 1024 * 1024;

function hasRequiredScope(scope: string | undefined, requiredScope: string): boolean {
  return (scope || "")
    .split(/[,\s]+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .includes(requiredScope);
}

function getPublishMode(): "direct" | "inbox" {
  return process.env.TIKTOK_PUBLISH_MODE === "inbox" ? "inbox" : "direct";
}

function getTikTokEndpoint(mode: "direct" | "inbox"): string {
  return mode === "inbox"
    ? `${TIKTOK_API_BASE}/v2/post/publish/inbox/video/init/`
    : `${TIKTOK_API_BASE}/v2/post/publish/video/init/`;
}

function getContentType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();

  if (ext === ".mov" || ext === ".qt") return "video/quicktime";
  if (ext === ".webm") return "video/webm";
  return "video/mp4";
}

function resolveLocalVideoPath(context: PublishTargetContext): string {
  const preparedLocalPath = context.videoPayload?.preparedLocalPath;

  if (preparedLocalPath) {
    return path.isAbsolute(preparedLocalPath)
      ? preparedLocalPath
      : path.join(process.cwd(), preparedLocalPath);
  }

  const url = context.videoUrl;

  if (/^https?:\/\//i.test(url)) {
    const parsed = new URL(url);
    if (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1") {
      return path.join(process.cwd(), "public", parsed.pathname);
    }
  }

  if (url.startsWith("/")) {
    return path.join(process.cwd(), "public", url);
  }

  throw new Error(
    "TikTok FILE_UPLOAD needs a local prepared video path. Prepare or upload the video again before publishing.",
  );
}

function chooseChunkSize(videoSize: number): number {
  if (videoSize <= MAX_CHUNK_SIZE) {
    return videoSize;
  }

  return MAX_CHUNK_SIZE;
}

function choosePrivacyLevel(
  options: TikTokPrivacyLevel[] | undefined,
): TikTokPrivacyLevel {
  const envPrivacy = process.env.TIKTOK_PRIVACY_LEVEL as
    | TikTokPrivacyLevel
    | undefined;

  if (envPrivacy && options?.includes(envPrivacy)) {
    return envPrivacy;
  }

  if (options?.includes("SELF_ONLY")) {
    return "SELF_ONLY";
  }

  return options?.[0] || "SELF_ONLY";
}

async function parseJsonResponse<T>(response: Response): Promise<T | string> {
  const text = await response.text();

  if (!text) {
    return "" as T;
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    return text;
  }
}

async function queryCreatorInfo(accessToken: string): Promise<TikTokCreatorInfoResponse> {
  const endpoint = `${TIKTOK_API_BASE}/v2/post/publish/creator_info/query/`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json; charset=UTF-8",
    },
  });
  const data = await parseJsonResponse<TikTokCreatorInfoResponse>(response);

  if (
    !response.ok ||
    typeof data === "string" ||
    (data.error?.code && data.error.code !== "ok")
  ) {
    throw new TikTokPublishError({
      message:
        typeof data === "string"
          ? `TikTok creator_info failed with status ${response.status}`
          : getTikTokErrorMessage(
              data,
              `TikTok creator_info failed with status ${response.status}`,
            ),
      response: data,
      status: response.status,
      endpoint,
    });
  }

  return data;
}

async function initializeUpload(params: {
  accessToken: string;
  context: PublishTargetContext;
  creatorInfo?: TikTokCreatorInfoResponse;
  mode: "direct" | "inbox";
  videoSize: number;
  chunkSize: number;
  totalChunkCount: number;
}): Promise<TikTokInitResponse> {
  const endpoint = getTikTokEndpoint(params.mode);
  const body =
    params.mode === "inbox"
      ? {
          source_info: {
            source: "FILE_UPLOAD",
            video_size: params.videoSize,
            chunk_size: params.chunkSize,
            total_chunk_count: params.totalChunkCount,
          },
        }
      : {
          post_info: {
            title: params.context.caption.replace(/\s+/g, " ").slice(0, 2200),
            privacy_level: choosePrivacyLevel(
              params.creatorInfo?.data?.privacy_level_options,
            ),
            disable_duet: true,
            disable_comment: false,
            disable_stitch: true,
            video_cover_timestamp_ms: 1000,
            brand_content_toggle: false,
            brand_organic_toggle: false,
          },
          source_info: {
            source: "FILE_UPLOAD",
            video_size: params.videoSize,
            chunk_size: params.chunkSize,
            total_chunk_count: params.totalChunkCount,
          },
        };

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${params.accessToken}`,
      "Content-Type": "application/json; charset=UTF-8",
    },
    body: JSON.stringify(body),
  });
  const data = await parseJsonResponse<TikTokInitResponse>(response);

  if (
    !response.ok ||
    typeof data === "string" ||
    (data.error?.code && data.error.code !== "ok") ||
    !data.data?.publish_id ||
    !data.data.upload_url
  ) {
    throw new TikTokPublishError({
      message:
        typeof data === "string"
          ? `TikTok upload init failed with status ${response.status}`
          : getTikTokErrorMessage(
              data,
              `TikTok upload init failed with status ${response.status}`,
            ),
      response: data,
      status: response.status,
      endpoint,
    });
  }

  return data;
}

async function uploadVideoFile(params: {
  uploadUrl: string;
  filePath: string;
  videoSize: number;
  chunkSize: number;
  totalChunkCount: number;
}): Promise<number> {
  let offset = 0;
  let lastStatus = 0;

  for (let chunkIndex = 0; chunkIndex < params.totalChunkCount; chunkIndex += 1) {
    const isLastChunk = chunkIndex === params.totalChunkCount - 1;
    const end = isLastChunk
      ? params.videoSize - 1
      : offset + params.chunkSize - 1;
    const contentLength = end - offset + 1;
    const response = await fetch(params.uploadUrl, {
      method: "PUT",
      headers: {
        "Content-Type": getContentType(params.filePath),
        "Content-Length": String(contentLength),
        "Content-Range": `bytes ${offset}-${end}/${params.videoSize}`,
      },
      body: createReadStream(params.filePath, {
        start: offset,
        end,
      }) as unknown as BodyInit,
      duplex: "half",
    } as RequestInit & { duplex: "half" });

    lastStatus = response.status;

    if (response.status !== 201 && response.status !== 206) {
      const data = await parseJsonResponse<unknown>(response);
      throw new TikTokPublishError({
        message: `TikTok video upload failed with status ${response.status}`,
        response: data,
        status: response.status,
        filePath: params.filePath,
      });
    }

    offset = end + 1;
  }

  return lastStatus;
}

export async function publishTikTokVideo(
  context: PublishTargetContext,
): Promise<TikTokPublishResult> {
  const account = await oauthStorage.getStoredAccount(
    context.accountKey,
    context.tenantId,
  );

  if (!account || account.platform !== "tiktok") {
    throw new Error("Selected TikTok account was not found.");
  }

  const mode = getPublishMode();
  const requiredScope = mode === "direct" ? "video.publish" : "video.upload";

  if (!hasRequiredScope(account.scope, requiredScope)) {
    throw new Error(
      `TikTok account is missing ${requiredScope}. Reconnect TikTok with TIKTOK_SCOPES=user.info.basic,${requiredScope}.`,
    );
  }

  const filePath = resolveLocalVideoPath(context);
  const fileStat = await stat(filePath);
  const videoSize = fileStat.size;

  if (videoSize <= 0) {
    throw new Error(`TikTok video file is empty: ${filePath}`);
  }

  const chunkSize = chooseChunkSize(videoSize);
  const totalChunkCount = Math.max(1, Math.floor(videoSize / chunkSize));

  if (chunkSize < MIN_CHUNK_SIZE && videoSize >= MIN_CHUNK_SIZE) {
    throw new Error("TikTok chunk size is below the 5MB minimum.");
  }

  const creatorInfo =
    mode === "direct" ? await queryCreatorInfo(account.accessToken) : undefined;
  const init = await initializeUpload({
    accessToken: account.accessToken,
    context,
    creatorInfo,
    mode,
    videoSize,
    chunkSize,
    totalChunkCount,
  });
  const uploadStatus = await uploadVideoFile({
    uploadUrl: init.data?.upload_url || "",
    filePath,
    videoSize,
    chunkSize,
    totalChunkCount,
  });

  return {
    platformPostId: init.data?.publish_id || "",
    response: {
      creatorInfo,
      init,
      uploadStatus,
      mode,
    },
  };
}
