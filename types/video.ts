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
  views: number;
  platform: Platform;
  url: string;
  uploadedAt: string;
  duration?: string;
  description?: string;
}

export interface VideoFilters {
  keyword: string;
  platform: "all" | Platform;
  minViews: number;
  maxViews: number;
  timeRange: "24h" | "week" | "month" | "all";
}
