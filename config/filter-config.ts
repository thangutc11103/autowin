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
            key: "search",
            label: "Search keyword",
            placeholder: "ha noi, food review",
            type: "text",
          },
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
    sections: [
      {
        label: "Bộ lọc",
        fields: [
          {
            key: "ten_kenh_tai_khoan",
            label: "Tài khoản/Kênh",
            placeholder: "metavietnam, vtv24",
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
    platform: "instagram",
    label: "Instagram",
    emoji: "IG",
    sections: [
      {
        label: "Bo loc",
        fields: [
          {
            key: "ten_kenh_tai_khoan",
            label: "Tai khoan/Kenh",
            placeholder: "@saito, @dt_11103, lenti_2026",
            type: "text",
          },
          {
            key: "limit",
            label: "So video toi da",
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
