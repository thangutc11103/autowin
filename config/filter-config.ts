import type { Platform } from "@/types/video";

export interface FilterField {
  key: string;
  type: "slider" | ["text"];
  min?: number;
  max?: number;
  step?: number;
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
    emoji: "🎵",
    sections: [
      {
        label: "Danh mục",
        fields: [
          {
            key: "danh_muc",
            type: ["text"],
            placeholder: "Danh mục...",
          },
        ],
      },
      {
        label: "Tên kênh/tài khoản",
        fields: [
          {
            key: "ten_kenh_tai_khoan",
            type: ["text"],
            placeholder: "Tên kênh/tài khoản...",
          },
        ],
      },
      {
        label: "# Hashtag",
        fields: [
          {
            key: "hashtag",
            type: ["text"],
            placeholder: "#trending",
          },
        ],
      },
      {
        label: "Số video",
        fields: [
          {
            key: "limit",
            type: "slider",
            min: 1,
            max: 100,
            step: 1,
          },
        ],
      },
    ],
  },
  {
    platform: "douyin",
    label: "Douyin",
    emoji: "🎶",
    sections: [
      {
        label: "Danh mục",
        fields: [
          {
            key: "danh_muc",
            type: ["text"],
            placeholder: "Danh mục...",
          },
        ],
      },
      {
        label: "Tên kênh/tài khoản",
        fields: [
          {
            key: "ten_kenh_tai_khoan",
            type: ["text"],
            placeholder: "Tên kênh/tài khoản...",
          },
        ],
      },
      {
        label: "# Hashtag",
        fields: [
          {
            key: "hashtag",
            type: ["text"],
            placeholder: "#douyin",
          },
        ],
      },
      {
        label: "Số video",
        fields: [
          {
            key: "limit",
            type: "slider",
            min: 1,
            max: 100,
            step: 1,
          },
        ],
      },
    ],
  },
  {
    platform: "facebook",
    label: "Facebook",
    emoji: "👥",
    sections: [
      {
        label: "# Hashtag",
        fields: [
          {
            key: "hashtag",
            type: ["text"],
            placeholder: "#facebook",
          },
        ],
      },
      {
        label: "Tên kênh/tài khoản",
        fields: [
          {
            key: "ten_kenh_tai_khoan",
            type: ["text"],
            placeholder: "Tên kênh...",
          },
        ],
      },
      {
        label: "Số video",
        fields: [
          {
            key: "limit",
            type: "slider",
            min: 1,
            max: 100,
            step: 1,
          },
        ],
      },
    ],
  },
  {
    platform: "instagram",
    label: "Instagram",
    emoji: "📸",
    sections: [
      {
        label: "# Hashtag",
        fields: [
          {
            key: "hashtag",
            type: ["text"],
            placeholder: "#instagram",
          },
        ],
      },
      {
        label: "Tên kênh/tài khoản",
        fields: [
          {
            key: "ten_kenh_tai_khoan",
            type: ["text"],
            placeholder: "Tên kênh...",
          },
        ],
      },
      {
        label: "Số video",
        fields: [
          {
            key: "limit",
            type: "slider",
            min: 1,
            max: 100,
            step: 1,
          },
        ],
      },
    ],
  },
  {
    platform: "youtube",
    label: "YouTube",
    emoji: "▶️",
    sections: [
      {
        label: "# Hashtag",
        fields: [
          {
            key: "hashtag",
            type: ["text"],
            placeholder: "#youtube",
          },
        ],
      },
      {
        label: "Tên kênh/tài khoản",
        fields: [
          {
            key: "ten_kenh_tai_khoan",
            type: ["text"],
            placeholder: "Tên kênh...",
          },
        ],
      },
      {
        label: "Số video",
        fields: [
          {
            key: "limit",
            type: "slider",
            min: 1,
            max: 100,
            step: 1,
          },
        ],
      },
    ],
  },
];
