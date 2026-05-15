import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Video, VideoFilters, Platform } from "@/types/video";

interface VideoState {
  videos: Video[];
  selectedVideos: Video[];
  filters: VideoFilters;
  isLoading: boolean;
  currentBatchByPlatform: Partial<Record<Platform, string>>;
  setVideos: (videos: Video[]) => void;
  addSelected: (video: Video) => void;
  removeSelected: (id: string) => void;
  clearSelected: () => void;
  setFilters: (filters: Partial<VideoFilters>) => void;
  setLoading: (loading: boolean) => void;
  setCurrentBatchId: (platform: Platform, batchId: string | null) => void;
  isVideoSelected: (id: string) => boolean;
}

export const useVideoStore = create<VideoState>()(
  persist(
    (set, get) => ({
      videos: [],
      selectedVideos: [],
      filters: {
        keyword: "",
        platform: "all",
      },
      isLoading: false,
      currentBatchByPlatform: {},
      setVideos: (videos) => set({ videos }),
      addSelected: (video) =>
        set((state) => ({
          selectedVideos: state.selectedVideos.find((v) => v.id === video.id)
            ? state.selectedVideos
            : [...state.selectedVideos, video],
        })),
      removeSelected: (id) =>
        set((state) => ({
          selectedVideos: state.selectedVideos.filter((v) => v.id !== id),
        })),
      clearSelected: () => set({ selectedVideos: [] }),
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
      isVideoSelected: (id) => get().selectedVideos.some((v) => v.id === id),
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
