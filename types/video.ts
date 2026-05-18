export type Platform =
  | "tiktok"
  | "douyin"
  | "youtube"
  | "facebook"
  | "instagram";

export interface Video {
  id: string;
  title: string;
  thumbnail: string;
  platform: Platform;
  url: string;
  duration?: string;
  description?: string;
  rawPayload?: Record<string, unknown>;
  mediaVideoUrl?: string | null;
  mediaAudioUrl?: string | null;
  preparedLocalPath?: string;
  preparedLocalUrl?: string;
  preparedAt?: string;
  preparedSource?: "tiktok-api" | "direct-media" | "ffmpeg-mux";
}

export interface VideoFilters {
  keyword: string;
  platform: "all" | Platform;
}
