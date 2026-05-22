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

const accountField = {
  key: "ten_kenh_tai_khoan",
  label: "Tài khoản/Kênh",
  placeholder: "@saito, @dt_11103",
  type: "text" as const,
};

const limitField = {
  key: "limit",
  label: "Số video tối đa",
  type: "slider" as const,
  min: 1,
  max: 50,
  step: 1,
  defaultValue: 1,
};

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
            label: "Từ khóa tìm kiếm",
            placeholder: "hà nội, food review",
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
          accountField,
          limitField,
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
            ...accountField,
            placeholder: "metavietnam, vtv24",
          },
          limitField,
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
        label: "Bộ lọc",
        fields: [
          {
            key: "hashtag",
            label: "Hashtag",
            placeholder: "#trending, #fyp",
            type: "text",
          },
          {
            ...accountField,
            placeholder: "@saito, @dt_11103, lenti_2026",
          },
          limitField,
        ],
      },
    ],
  },
  {
    platform: "youtube",
    label: "YouTube",
    emoji: "YT",
    sections: [
      {
        label: "Bộ lọc",
        fields: [
          {
            key: "hashtag",
            label: "Hashtag",
            placeholder: "#trending, #fyp, funny",
            type: "text",
          },
          {
            ...accountField,
            placeholder: "@saito, @dt_11103, @SigmaDuck777",
          },
          limitField,
        ],
      },
    ],
  },
  {
    platform: "douyin",
    label: "Douyin",
    emoji: "D",
    sections: [],
  },
];
