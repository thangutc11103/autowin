import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Video, VideoFilters, Platform } from "@/types/video";

interface VideoState {
  videos: Video[];
  selectedVideos: Video[];
  postingVideos: Video[];
  filters: VideoFilters;
  isLoading: boolean;
  currentBatchByPlatform: Partial<Record<Platform, string>>;
  setVideos: (videos: Video[]) => void;
  addSelected: (video: Video) => void;
  removeSelected: (id: string) => void;
  clearSelected: () => void;
  saveSelectedToPosting: (ids: string[]) => void;
  addPostingVideos: (videos: Video[]) => void;
  removePosting: (id: string) => void;
  clearPosting: () => void;
  setFilters: (filters: Partial<VideoFilters>) => void;
  setLoading: (loading: boolean) => void;
  setCurrentBatchId: (platform: Platform, batchId: string | null) => void;
  isVideoSelected: (id: string) => boolean;
  isVideoPosting: (id: string) => boolean;
}

export const useVideoStore = create<VideoState>()(
  persist(
    (set, get) => ({
      videos: [],
      selectedVideos: [],
      postingVideos: [],
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
      saveSelectedToPosting: (ids) =>
        set((state) => {
          const selectedIds = new Set(ids);
          const existingIds = new Set(state.postingVideos.map((v) => v.id));
          const videosToAdd = state.selectedVideos.filter(
            (video) => selectedIds.has(video.id) && !existingIds.has(video.id),
          );

          return {
            postingVideos: [...state.postingVideos, ...videosToAdd],
          };
        }),
      addPostingVideos: (videos) =>
        set((state) => {
          const incomingById = new Map(videos.map((video) => [video.id, video]));
          const updatedExisting = state.postingVideos.map((video) =>
            incomingById.get(video.id) || video,
          );
          const existingIds = new Set(state.postingVideos.map((v) => v.id));
          const newVideos = videos.filter((video) => !existingIds.has(video.id));

          return {
            postingVideos: [...updatedExisting, ...newVideos],
          };
        }),
      removePosting: (id) =>
        set((state) => ({
          postingVideos: state.postingVideos.filter((v) => v.id !== id),
        })),
      clearPosting: () => set({ postingVideos: [] }),
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
      isVideoPosting: (id) => get().postingVideos.some((v) => v.id === id),
    }),
    {
      name: "find-app-video-ui",
      partialize: (state) => ({
        currentBatchByPlatform: state.currentBatchByPlatform,
        selectedVideos: state.selectedVideos,
        postingVideos: state.postingVideos,
      }),
    },
  ),
);

// re-export Platform so consumers don't need to import from types separately
export type { Platform };
