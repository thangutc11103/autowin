import { create } from "zustand";
import type { FilterState, PlatformFilterValues } from "@/types/filter";
import type { Platform } from "@/types/video";

export const useFilterStore = create<FilterState>((set) => ({
  activePlatform: "tiktok",
  filters: {},
  setActivePlatform: (platform: Platform) => set({ activePlatform: platform }),
  setFilterValue: (
    platform: Platform,
    key: keyof PlatformFilterValues,
    value: string | number | string[],
  ) =>
    set((state) => ({
      filters: {
        ...state.filters,
        [platform]: {
          ...state.filters[platform],
          [key]: value,
        },
      },
    })),
  resetFilters: (platform: Platform) =>
    set((state) => ({
      filters: {
        ...state.filters,
        [platform]: {},
      },
    })),
}));
