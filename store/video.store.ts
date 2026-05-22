import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Video, VideoFilters, Platform } from "@/types/video";

interface VideoState {
  videos: Video[];
  filters: VideoFilters;
  isLoading: boolean;
  currentBatchByPlatform: Partial<Record<Platform, string>>;
  setVideos: (videos: Video[]) => void;
  setFilters: (filters: Partial<VideoFilters>) => void;
  setLoading: (loading: boolean) => void;
  setCurrentBatchId: (platform: Platform, batchId: string | null) => void;
}

export const useVideoStore = create<VideoState>()(
  persist(
    (set) => ({
      videos: [],
      filters: {
        keyword: "",
        platform: "all",
      },
      isLoading: false,
      currentBatchByPlatform: {},
      setVideos: (videos) => set({ videos }),
      setFilters: (filters) =>
        set((state) => ({
          filters: { ...state.filters, ...filters },
        })),
      setLoading: (isLoading) => set({ isLoading }),
      setCurrentBatchId: (platform, batchId) =>
        set((state) => {
          const currentBatchByPlatform = {
            ...state.currentBatchByPlatform,
          };

          if (batchId) {
            currentBatchByPlatform[platform] = batchId;
          } else {
            delete currentBatchByPlatform[platform];
          }

          return { currentBatchByPlatform };
        }),
    }),
    {
      name: "find-app-video-ui",
      partialize: (state) => ({
        currentBatchByPlatform: state.currentBatchByPlatform,
      }),
    },
  ),
);

// re-export Platform so consumers don't need to import from types separately
export type { Platform };
