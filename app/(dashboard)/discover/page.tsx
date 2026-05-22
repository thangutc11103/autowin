'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import FilterPanel from '@/components/discover/filter-panel';
import { useFilterStore } from '@/store/filter.store';
import { useLanguageStore } from '@/store/language.store';
import { useVideoStore } from '@/store/video.store';
import type { Platform, Video } from '@/types/video';

const PLATFORM_LABELS: Record<Platform, string> = {
    tiktok: 'TikTok',
    douyin: 'Douyin',
    facebook: 'Facebook',
    instagram: 'Instagram',
    youtube: 'YouTube',
};

const PLATFORM_BADGES: Record<Platform, string> = {
    tiktok: 'bg-slate-950/70 text-pink-100 ring-pink-400/25',
    douyin: 'bg-slate-950/70 text-violet-100 ring-violet-400/25',
    facebook: 'bg-slate-950/70 text-blue-100 ring-blue-400/25',
    instagram: 'bg-slate-950/70 text-amber-100 ring-amber-400/25',
    youtube: 'bg-slate-950/70 text-red-100 ring-red-400/25',
};

const VIDEO_GRID_CLASS = 'grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-5 2xl:grid-cols-6';
const VIDEO_CARD_BASE =
    'group/card overflow-hidden rounded-2xl border bg-slate-950/58 shadow-[0_20px_45px_rgba(0,0,0,0.28)] backdrop-blur transition-all duration-200';
const VIDEO_CARD_SELECTED =
    'border-blue-400 ring-2 ring-blue-400/35 shadow-[0_0_36px_rgba(59,130,246,0.28)]';
const VIDEO_CARD_IDLE = 'border-cyan-300/10 hover:-translate-y-0.5 hover:border-cyan-300/28';
const SELECT_BUTTON_BASE = 'min-w-24 rounded-xl border px-3 py-2 text-xs font-bold transition-all';
const SELECT_BUTTON_SELECTED =
    'border-blue-300/30 bg-gradient-to-r from-blue-600 to-violet-600 text-white shadow-[0_0_22px_rgba(59,130,246,0.35)] hover:from-blue-500 hover:to-violet-500';
const SELECT_BUTTON_IDLE =
    'border-violet-400/35 bg-slate-950/45 text-slate-100 hover:border-cyan-300/45 hover:bg-blue-500/10 hover:text-cyan-100';

interface VideosResponse {
    videos?: Video[];
    error?: string;
}

interface ResolveVideoResponse {
    success?: boolean;
    video?: Video;
    error?: string;
}

interface UserVideoItem {
    id: string;
    sourceVideoId: string | null;
    video: Video;
}

interface VideoItemsResponse {
    items?: UserVideoItem[];
    error?: string;
}

function getPlatformDisplayName(platform: Platform): string {
    return PLATFORM_LABELS[platform];
}

function SkeletonCard() {
    return (
        <div className="overflow-hidden rounded-2xl border border-cyan-300/10 bg-slate-950/55 shadow-[0_20px_45px_rgba(0,0,0,0.28)]">
            <div className="aspect-[9/16] w-full animate-pulse bg-slate-900/80" />
            <div className="space-y-3 p-3">
                <div className="h-4 w-full rounded bg-slate-800/80" />
                <div className="h-4 w-3/4 rounded bg-slate-800/70" />
                <div className="flex items-center justify-between">
                    <div className="h-3 w-12 rounded bg-slate-800/70" />
                    <div className="h-7 w-20 rounded-full bg-slate-800/70" />
                </div>
            </div>
        </div>
    );
}

function EmptyState() {
    return (
        <div className="flex h-full min-h-96 items-center justify-center rounded-2xl border border-dashed border-cyan-300/15 bg-slate-950/45">
            <div className="max-w-sm px-6 text-center">
                <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-full bg-blue-500/10 text-xl text-cyan-200 ring-1 ring-cyan-300/20">
                    video
                </div>
                <h2 className="text-sm font-semibold text-slate-100">No videos found</h2>
                <p className="mt-1 text-sm text-slate-400">
                    Run a filter job to load videos for this platform.
                </p>
            </div>
        </div>
    );
}

function VideoCard({
    video,
    selected,
    onToggleSelect,
}: {
    video: Video;
    selected: boolean;
    onToggleSelect: (video: Video) => void;
}) {
    const platformClass = PLATFORM_BADGES[video.platform];
    const previewRef = useRef<HTMLVideoElement | null>(null);
    const [isPreviewing, setIsPreviewing] = useState(false);
    const [mediaVideoUrl, setMediaVideoUrl] = useState(video.mediaVideoUrl || null);
    const [isResolvingPreview, setIsResolvingPreview] = useState(false);
    const [resolveFailed, setResolveFailed] = useState(false);
    const canPreview = Boolean(mediaVideoUrl);

    useEffect(() => {
        if (!isPreviewing || !mediaVideoUrl || !previewRef.current) {
            return;
        }

        previewRef.current.currentTime = 0;
        void previewRef.current.play().catch(() => {
            setIsPreviewing(false);
        });
    }, [isPreviewing, mediaVideoUrl]);

    const toggleSelect = () => {
        onToggleSelect(video);
    };

    const playPreview = () => {
        if (!mediaVideoUrl) {
            return;
        }

        setIsPreviewing(true);
    };

    const resolvePreviewUrl = async () => {
        if (mediaVideoUrl || isResolvingPreview || resolveFailed) {
            return mediaVideoUrl;
        }

        setIsResolvingPreview(true);

        try {
            const response = await fetch('/api/videos/resolve', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ id: video.id }),
            });
            const result = (await response.json()) as ResolveVideoResponse;

            if (!response.ok || result.error || !result.video?.mediaVideoUrl) {
                throw new Error(result.error || 'Failed to resolve preview');
            }

            setMediaVideoUrl(result.video.mediaVideoUrl);
            return result.video.mediaVideoUrl;
        } catch {
            setResolveFailed(true);
            return null;
        } finally {
            setIsResolvingPreview(false);
        }
    };

    const startPreview = () => {
        if (mediaVideoUrl) {
            playPreview();
            return;
        }

        void resolvePreviewUrl().then((resolvedUrl) => {
            if (resolvedUrl) {
                setIsPreviewing(true);
            }
        });
    };

    const stopPreview = () => {
        const preview = previewRef.current;
        setIsPreviewing(false);

        if (!preview) {
            return;
        }

        preview.pause();
        preview.currentTime = 0;
    };

    return (
        <div
            className={`${VIDEO_CARD_BASE} ${selected ? VIDEO_CARD_SELECTED : VIDEO_CARD_IDLE}`}
        >
            <a
                href={video.url}
                target="_blank"
                rel="noreferrer"
                className="group relative block aspect-[9/16] w-full overflow-hidden bg-slate-900"
                onMouseEnter={startPreview}
                onMouseLeave={stopPreview}
                onFocus={startPreview}
                onBlur={stopPreview}
            >
                {video.thumbnail ? (
                    <Image
                        src={video.thumbnail}
                        alt={video.title}
                        fill
                        unoptimized
                        sizes="(max-width: 640px) 50vw, (max-width: 1024px) 25vw, 180px"
                        className={`object-cover transition-all duration-200 group-hover:scale-[1.02] ${isPreviewing ? 'opacity-0' : 'opacity-100'
                            }`}
                    />
                ) : (
                    <div
                        className={`flex size-full items-center justify-center bg-gradient-to-b from-slate-900 to-slate-950 text-xs font-medium text-slate-500 ${isPreviewing ? 'opacity-0' : 'opacity-100'
                            }`}
                    >
                        No thumbnail
                    </div>
                )}

                {mediaVideoUrl && (
                    <video
                        ref={previewRef}
                        src={mediaVideoUrl}
                        muted
                        loop
                        playsInline
                        preload="metadata"
                        className={`absolute inset-0 size-full object-cover transition-opacity duration-150 ${isPreviewing ? 'opacity-100' : 'opacity-0'
                            }`}
                    />
                )}

                {video.duration && (
                    <span className="absolute bottom-2 right-2 rounded bg-black/75 px-1.5 py-0.5 text-xs text-white">
                        {video.duration}
                    </span>
                )}

                {(canPreview || isResolvingPreview) && (
                    <span className="absolute bottom-2 left-2 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus:opacity-100">
                        {isResolvingPreview ? 'Loading' : 'Preview'}
                    </span>
                )}

                <span
                    className={`absolute left-2 top-2 rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ${platformClass}`}
                >
                    {getPlatformDisplayName(video.platform)}
                </span>
            </a>

            <div className="border-t border-cyan-300/10 bg-slate-950/72 p-3">
                <h3 className="mb-3 min-h-11 overflow-hidden text-sm font-semibold leading-6 text-slate-100 [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2]">
                    {video.title}
                </h3>
                <div className="flex justify-end">
                    <button
                        onClick={toggleSelect}
                        className={`${SELECT_BUTTON_BASE} ${selected ? SELECT_BUTTON_SELECTED : SELECT_BUTTON_IDLE}`}
                    >
                        {selected ? 'Selected' : '+ Select'}
                    </button>
                </div>
            </div>
        </div>
    );
}

function VideoGrid({
    videos,
    isLoading,
    selectedSourceIds,
    onToggleSelect,
}: {
    videos: Video[];
    isLoading: boolean;
    selectedSourceIds: Set<string>;
    onToggleSelect: (video: Video) => void;
}) {
    if (isLoading) {
        return (
            <div className={VIDEO_GRID_CLASS}>
                {Array.from({ length: 12 }).map((_, index) => (
                    <SkeletonCard key={index} />
                ))}
            </div>
        );
    }

    if (videos.length === 0) {
        return <EmptyState />;
    }

    return (
        <div className={VIDEO_GRID_CLASS}>
            {videos.map((video) => (
                <VideoCard
                    key={`${video.id}-${video.mediaVideoUrl || ''}`}
                    video={video}
                    selected={selectedSourceIds.has(video.id)}
                    onToggleSelect={onToggleSelect}
                />
            ))}
        </div>
    );
}

export default function DiscoverPage() {
    const language = useLanguageStore((state) => state.language);
    const activePlatform = useFilterStore((state) => state.activePlatform);
    const {
        videos,
        isLoading,
        setVideos,
        setLoading,
        currentBatchByPlatform,
    } = useVideoStore();
    const [error, setError] = useState<string | null>(null);
    const [isFilterOpen, setIsFilterOpen] = useState(false);
    const [selectedItems, setSelectedItems] = useState<UserVideoItem[]>([]);
    const currentBatchId = currentBatchByPlatform[activePlatform];
    const selectedItemBySourceId = useMemo(() => {
        const map = new Map<string, UserVideoItem>();
        selectedItems.forEach((item) => {
            const sourceId = item.sourceVideoId || item.video.id;
            map.set(sourceId, item);
        });
        return map;
    }, [selectedItems]);
    const selectedSourceIds = useMemo(
        () => new Set(selectedItemBySourceId.keys()),
        [selectedItemBySourceId],
    );

    useEffect(() => {
        document.body.style.overflow = isFilterOpen ? 'hidden' : '';
        return () => {
            document.body.style.overflow = '';
        };
    }, [isFilterOpen]);

    const loadVideos = useCallback(async (signal?: AbortSignal) => {
        setLoading(true);
        setError(null);

        try {
            const params = new URLSearchParams({
                platform: activePlatform,
                limit: '100',
            });

            if (currentBatchId) {
                params.set('batchId', currentBatchId);
            }

            const response = await fetch(`/api/videos?${params.toString()}`, {
                signal,
            });
            const data = (await response.json()) as VideosResponse;

            if (!response.ok || data.error) {
                throw new Error(data.error || 'Failed to load videos');
            }

            setVideos(data.videos || []);
        } catch (loadError) {
            if (signal?.aborted) {
                return;
            }

            const message = loadError instanceof Error ? loadError.message : 'Failed to load videos';
            setError(message);
            setVideos([]);
        } finally {
            if (!signal?.aborted) {
                setLoading(false);
            }
        }
    }, [activePlatform, currentBatchId, setLoading, setVideos]);

    const loadSelectedItems = useCallback(async (signal?: AbortSignal) => {
        const response = await fetch('/api/video-items?status=selected', {
            cache: 'no-store',
            signal,
        });
        const data = (await response.json()) as VideoItemsResponse;

        if (!response.ok || data.error) {
            throw new Error(data.error || 'Failed to load selected videos');
        }

        setSelectedItems(data.items || []);
    }, []);

    useEffect(() => {
        const abortController = new AbortController();
        const timeoutId = window.setTimeout(() => {
            void loadVideos(abortController.signal);
            void loadSelectedItems(abortController.signal).catch((loadError) => {
                if (!abortController.signal.aborted) {
                    setError(loadError instanceof Error ? loadError.message : 'Failed to load selected videos');
                }
            });
        }, 0);

        return () => {
            window.clearTimeout(timeoutId);
            abortController.abort();
        };
    }, [loadSelectedItems, loadVideos]);

    const toggleSelected = useCallback(async (video: Video) => {
        const existing = selectedItemBySourceId.get(video.id);
        setError(null);

        try {
            if (existing) {
                const response = await fetch(`/api/video-items/${existing.id}`, {
                    method: 'DELETE',
                });

                if (!response.ok) {
                    const result = (await response.json().catch(() => ({}))) as { error?: string };
                    throw new Error(result.error || 'Failed to remove selected video');
                }

                setSelectedItems((items) => items.filter((item) => item.id !== existing.id));
                return;
            }

            const response = await fetch('/api/video-items/select', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ videoId: video.id }),
            });
            const result = (await response.json()) as { item?: UserVideoItem; error?: string };

            if (!response.ok || result.error || !result.item) {
                throw new Error(result.error || 'Failed to select video');
            }

            setSelectedItems((items) => [result.item!, ...items.filter((item) => item.id !== result.item!.id)]);
        } catch (toggleError) {
            setError(toggleError instanceof Error ? toggleError.message : 'Failed to update selected video');
        }
    }, [selectedItemBySourceId]);

    return (
        <div className="flex h-full overflow-hidden">
            <div className="hidden w-72 flex-none overflow-hidden border-r border-cyan-300/10 bg-slate-950/42 md:block">
                <FilterPanel />
            </div>

            <div
                className={`fixed inset-0 z-50 md:hidden ${isFilterOpen ? 'pointer-events-auto' : 'pointer-events-none'}`}
                aria-hidden={!isFilterOpen}
            >
                <button
                    type="button"
                    aria-label={language === 'vi' ? 'Đóng bộ lọc nền tảng' : 'Close platform filters'}
                    onClick={() => setIsFilterOpen(false)}
                    className={`absolute inset-0 bg-slate-950/70 transition-opacity ${isFilterOpen ? 'opacity-100' : 'opacity-0'}`}
                />
                <aside
                    className={`absolute inset-y-0 left-0 w-[86vw] max-w-[300px] overflow-hidden border-r border-cyan-300/10 bg-slate-950 shadow-2xl transition-transform duration-200 ease-out ${isFilterOpen ? 'translate-x-0' : '-translate-x-full'}`}
                >
                    <div className="flex h-full flex-col">
                        <div className="flex items-center justify-between border-b border-cyan-300/10 px-4 py-3">
                            <h2 className="text-sm font-bold uppercase tracking-wide text-slate-100">
                                {language === 'vi' ? 'Nền tảng' : 'Platform'}
                            </h2>
                            <button
                                type="button"
                                onClick={() => setIsFilterOpen(false)}
                                aria-label={language === 'vi' ? 'Đóng bộ lọc nền tảng' : 'Close platform filters'}
                                className="flex size-9 items-center justify-center rounded-lg text-2xl text-slate-400 hover:bg-slate-900 hover:text-slate-100"
                            >
                                ×
                            </button>
                        </div>
                        <div className="min-h-0 flex-1">
                            <FilterPanel showHeader={false} />
                        </div>
                    </div>
                </aside>
            </div>

            <div className="flex flex-1 flex-col overflow-hidden">
                <div className="flex-none border-b border-cyan-300/10 bg-slate-950/25 px-4 py-5 backdrop-blur sm:px-6">
                    <div className="flex items-center justify-between gap-3">
                        <div>
                            <h1 className="min-w-24 whitespace-nowrap text-3xl font-black tracking-tight text-slate-50">
                                {getPlatformDisplayName(activePlatform)}
                            </h1>
                        </div>
                        <button
                            type="button"
                            onClick={() => setIsFilterOpen(true)}
                            className="inline-flex items-center rounded-xl border border-cyan-300/15 bg-slate-950/70 px-3 py-2 text-sm font-semibold text-slate-100 shadow-sm hover:bg-slate-900 md:hidden"
                        >
                            {language === 'vi' ? 'Nền tảng' : 'Platform'}
                        </button>
                    </div>
                    {error && (
                        <div className="mt-3 rounded-xl border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
                            {error}
                        </div>
                    )}
                </div>

                <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-6">
                    <VideoGrid
                        videos={videos}
                        isLoading={isLoading}
                        selectedSourceIds={selectedSourceIds}
                        onToggleSelect={toggleSelected}
                    />
                </div>
            </div>
        </div>
    );
}
