'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
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
    tiktok: 'bg-pink-50 text-pink-700 ring-pink-100',
    douyin: 'bg-purple-50 text-purple-700 ring-purple-100',
    facebook: 'bg-blue-50 text-blue-700 ring-blue-100',
    instagram: 'bg-orange-50 text-orange-700 ring-orange-100',
    youtube: 'bg-red-50 text-red-700 ring-red-100',
};

interface VideosResponse {
    videos?: Video[];
    error?: string;
}

interface ResolveVideoResponse {
    success?: boolean;
    video?: Video;
    error?: string;
}

function getPlatformDisplayName(platform: Platform): string {
    return PLATFORM_LABELS[platform];
}

function SkeletonCard() {
    return (
        <div className="overflow-hidden rounded-lg border border-gray-100 bg-white shadow-sm">
            <div className="aspect-[9/16] w-full animate-pulse bg-gray-100" />
            <div className="space-y-3 p-3">
                <div className="h-4 w-full rounded bg-gray-100" />
                <div className="h-4 w-3/4 rounded bg-gray-100" />
                <div className="flex items-center justify-between">
                    <div className="h-3 w-12 rounded bg-gray-100" />
                    <div className="h-7 w-20 rounded-full bg-gray-100" />
                </div>
            </div>
        </div>
    );
}

function EmptyState() {
    return (
        <div className="flex h-full min-h-96 items-center justify-center rounded-lg border border-dashed border-gray-200 bg-white">
            <div className="max-w-sm px-6 text-center">
                <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-full bg-gray-50 text-xl">
                    video
                </div>
                <h2 className="text-sm font-semibold text-gray-900">No videos found</h2>
                <p className="mt-1 text-sm text-gray-500">
                    Run a filter job to load videos for this platform.
                </p>
            </div>
        </div>
    );
}

function VideoCard({ video }: { video: Video }) {
    const addSelected = useVideoStore((state) => state.addSelected);
    const removeSelected = useVideoStore((state) => state.removeSelected);
    const selected = useVideoStore((state) => state.isVideoSelected(video.id));
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
        if (selected) {
            removeSelected(video.id);
        } else {
            addSelected(video);
        }
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
            className={`overflow-hidden rounded-lg border bg-white shadow-sm transition-all ${selected
                ? 'border-blue-500 ring-2 ring-blue-200'
                : 'border-gray-100 hover:shadow-md'
                }`}
        >
            <a
                href={video.url}
                target="_blank"
                rel="noreferrer"
                className="group relative block aspect-[9/16] w-full overflow-hidden bg-gray-100"
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
                        className={`flex size-full items-center justify-center bg-gradient-to-b from-gray-100 to-gray-200 text-xs font-medium text-gray-400 ${isPreviewing ? 'opacity-0' : 'opacity-100'
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

            <div className="p-3">
                <h3 className="mb-2 min-h-10 overflow-hidden text-sm font-medium leading-snug text-gray-900 [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2]">
                    {video.title}
                </h3>
                <div className="flex justify-end">
                    <button
                        onClick={toggleSelect}
                        className={`min-w-20 rounded-full px-3 py-1 text-xs font-semibold transition-colors ${selected
                            ? 'bg-blue-600 text-white hover:bg-blue-700'
                            : 'bg-gray-100 text-gray-700 hover:bg-blue-50 hover:text-blue-600'
                            }`}
                    >
                        {selected ? 'Selected' : '+ Select'}
                    </button>
                </div>
            </div>
        </div>
    );
}

function VideoGrid({ videos, isLoading }: { videos: Video[]; isLoading: boolean }) {
    if (isLoading) {
        return (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
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
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
            {videos.map((video) => (
                <VideoCard key={`${video.id}-${video.mediaVideoUrl || ''}`} video={video} />
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
    const currentBatchId = currentBatchByPlatform[activePlatform];

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

    useEffect(() => {
        const abortController = new AbortController();
        const timeoutId = window.setTimeout(() => {
            void loadVideos(abortController.signal);
        }, 0);

        return () => {
            window.clearTimeout(timeoutId);
            abortController.abort();
        };
    }, [loadVideos]);

    return (
        <div className="flex h-full overflow-hidden bg-white">
            <div className="hidden w-72 flex-none overflow-hidden border-r border-gray-100 md:block">
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
                    className={`absolute inset-0 bg-gray-950/35 transition-opacity ${isFilterOpen ? 'opacity-100' : 'opacity-0'}`}
                />
                <aside
                    className={`absolute inset-y-0 left-0 w-[86vw] max-w-[300px] overflow-hidden border-r border-gray-200 bg-white shadow-2xl transition-transform duration-200 ease-out ${isFilterOpen ? 'translate-x-0' : '-translate-x-full'}`}
                >
                    <div className="flex h-full flex-col">
                        <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
                            <h2 className="text-sm font-bold uppercase tracking-wide text-gray-900">
                                {language === 'vi' ? 'Nền tảng' : 'Platform'}
                            </h2>
                            <button
                                type="button"
                                onClick={() => setIsFilterOpen(false)}
                                aria-label={language === 'vi' ? 'Đóng bộ lọc nền tảng' : 'Close platform filters'}
                                className="flex size-9 items-center justify-center rounded-lg text-2xl text-gray-500 hover:bg-gray-100 hover:text-gray-900"
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
                <div className="flex-none border-b border-gray-100 bg-white px-4 py-4 sm:px-6">
                    <div className="flex items-center justify-between gap-3">
                        <div>
                            <h1 className="min-w-24 whitespace-nowrap text-2xl font-bold text-gray-950">
                                {getPlatformDisplayName(activePlatform)}
                            </h1>
                        </div>
                        <button
                            type="button"
                            onClick={() => setIsFilterOpen(true)}
                            className="inline-flex items-center rounded-md border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-700 shadow-sm hover:bg-gray-50 md:hidden"
                        >
                            {language === 'vi' ? 'Nền tảng' : 'Platform'}
                        </button>
                    </div>
                    {error && (
                        <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                            {error}
                        </div>
                    )}
                </div>

                <div className="flex-1 overflow-y-auto px-4 py-5 sm:px-6">
                    <VideoGrid videos={videos} isLoading={isLoading} />
                </div>
            </div>
        </div>
    );
}
