import type { Platform } from "@/types/video";

export interface FilterField {
  key: string;
  label: string;
  type: "slider" | "text";
  min?: number;
  max?: number;
  step?: number;
  defaultValue?: number;
  placeholder?: string;
}

export interface PlatformFilterConfig {
  platform: Platform;
  label: string;
  emoji: string;
  sections: {
    label: string;
    fields: FilterField[];
  }[];
}

export const PLATFORM_FILTER_CONFIGS: PlatformFilterConfig[] = [
  {
    platform: "tiktok",
    label: "TikTok",
    emoji: "♪",
    sections: [
      {
        label: "Bộ lọc",
        fields: [
          {
            key: "danh_muc",
            label: "Danh mục",
            placeholder: "sport, trending",
            type: "text",
          },
          {
            key: "hashtag",
            label: "Hashtag",
            placeholder: "#trending, #fyp",
            type: "text",
          },
          {
            key: "ten_kenh_tai_khoan",
            label: "Tài khoản/Kênh",
            placeholder: "@saito, @dt_11103",
            type: "text",
          },
          {
            key: "limit",
            label: "Số video tối đa",
            type: "slider",
            min: 1,
            max: 50,
            step: 1,
            defaultValue: 1,
          },
        ],
      },
    ],
  },
  {
    platform: "facebook",
    label: "Facebook",
    emoji: "f",
    sections: [],
  },
  {
    platform: "instagram",
    label: "Instagram",
    emoji: "IG",
    sections: [],
  },
  {
    platform: "youtube",
    label: "YouTube",
    emoji: "YT",
    sections: [],
  },
  {
    platform: "douyin",
    label: "Douyin",
    emoji: "D",
    sections: [],
  },
];
