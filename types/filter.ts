import type { Platform } from "./video";

export interface PlatformFilterValues {
  danh_muc?: string[];
  hashtag?: string[];
  ten_kenh_tai_khoan?: string[];
  limit?: number;
}

export interface FilterState {
  activePlatform: Platform;
  filters: Partial<Record<Platform, PlatformFilterValues>>;
  setActivePlatform: (platform: Platform) => void;
  setFilterValue: (
    platform: Platform,
    key: keyof PlatformFilterValues,
    value: string | number | string[],
  ) => void;
  resetFilters: (platform: Platform) => void;
}
