import { create } from "zustand";
import type { Video, VideoFilters, Platform } from "@/types/video";

interface VideoState {
  videos: Video[];
  selectedVideos: Video[];
  filters: VideoFilters;
  isLoading: boolean;
  setVideos: (videos: Video[]) => void;
  addSelected: (video: Video) => void;
  removeSelected: (id: string) => void;
  clearSelected: () => void;
  setFilters: (filters: Partial<VideoFilters>) => void;
  setLoading: (loading: boolean) => void;
  isVideoSelected: (id: string) => boolean;
}

export const useVideoStore = create<VideoState>((set, get) => ({
  videos: [],
  selectedVideos: [],
  filters: {
    keyword: "",
    platform: "all",
    minViews: 0,
    maxViews: 0,
    timeRange: "all",
  },
  isLoading: false,
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
  isVideoSelected: (id) => get().selectedVideos.some((v) => v.id === id),
}));

// re-export Platform so consumers don't need to import from types separately
export type { Platform };
