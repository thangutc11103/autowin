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
}

export interface VideoFilters {
  keyword: string;
  platform: "all" | Platform;
}
