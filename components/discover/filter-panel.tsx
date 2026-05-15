'use client';

import { useState } from 'react';
import { PLATFORM_FILTER_CONFIGS } from '@/config/filter-config';
import { useFilterStore } from '@/store/filter.store';
import { useVideoStore } from '@/store/video.store';
import type { PlatformFilterValues } from '@/types/filter';
import type { DecomposeFilterRequest, JobSubmissionResult } from '@/types/job';
import type { Platform, Video } from '@/types/video';

interface ClearJobsResponse {
    removedCount?: number;
    error?: string;
}

interface CleanupResponse {
    deletedRuns?: number;
    deletedVideos?: number;
    error?: string;
    message?: string;
}

interface QueueInspectJob {
    id: string;
    state: string;
}

interface QueueInspectResponse {
    jobs?: QueueInspectJob[];
    error?: string;
}

interface VideosResponse {
    videos?: Video[];
    error?: string;
}

const PLATFORM_ACTIVE_COLORS: Record<Platform, string> = {
    tiktok: 'bg-pink-50 border-pink-300 text-pink-700',
    douyin: 'bg-purple-50 border-purple-300 text-purple-700',
    facebook: 'bg-blue-50 border-blue-300 text-blue-700',
    instagram: 'bg-orange-50 border-orange-300 text-orange-700',
    youtube: 'bg-red-50 border-red-300 text-red-700',
};

function FilterSection({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="border-b border-gray-100 last:border-0">
            <div className="flex items-center justify-between px-1 py-2 text-xs font-semibold text-gray-600">
                <span>{label}</span>
                <span className="text-gray-400">v</span>
            </div>
            <div className="px-1 pb-3">{children}</div>
        </div>
    );
}

export default function FilterPanel() {
    const {
        activePlatform,
        filters,
        setActivePlatform,
        setFilterValue,
        resetFilters,
    } = useFilterStore();
    const setVideos = useVideoStore((state) => state.setVideos);
    const setLoading = useVideoStore((state) => state.setLoading);
    const setCurrentBatchId = useVideoStore((state) => state.setCurrentBatchId);

    const [draftFilters, setDraftFilters] = useState<Record<string, Record<string, string | number>>>({});
    const [batchIds, setBatchIds] = useState<Record<string, string>>({});
    const [expandedPlatforms, setExpandedPlatforms] = useState<Set<Platform>>(new Set(['tiktok']));
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submitMessage, setSubmitMessage] = useState<{
        type: 'success' | 'error';
        text: string;
    } | null>(null);
    const [workerMessage, setWorkerMessage] = useState<string | null>(null);

    const hideJobMessagesSoon = () => {
        window.setTimeout(() => {
            setSubmitMessage(null);
            setWorkerMessage(null);
        }, 3000);
    };

    const togglePlatformExpand = (platform: Platform) => {
        setExpandedPlatforms((prev) => {
            const next = new Set(prev);
            if (next.has(platform)) {
                next.delete(platform);
            } else {
                next.add(platform);
            }
            return next;
        });
    };

    const handlePlatformClick = (platform: Platform) => {
        setActivePlatform(platform);
        if (!expandedPlatforms.has(platform)) {
            setExpandedPlatforms((prev) => new Set([...prev, platform]));
        }
    };

    const handleInputChange = (platform: Platform, fieldKey: string, value: string | number) => {
        setDraftFilters((prev) => ({
            ...prev,
            [platform]: {
                ...prev[platform],
                [fieldKey]: value,
            },
        }));
    };

    const handleSliderChange = (
        platform: Platform,
        key: keyof PlatformFilterValues,
        value: number,
    ) => {
        handleInputChange(platform, key, value);
        setFilterValue(platform, key, value);
    };

    const clearTextInputsAfterSuccess = (
        platform: Platform,
        processedFilters: Record<string, string[] | number>,
    ) => {
        setDraftFilters((prev) => {
            const nextPlatformDraft: Record<string, string | number> = {};

            Object.entries(prev[platform] || {}).forEach(([key, value]) => {
                if (typeof value === 'number') {
                    nextPlatformDraft[key] = value;
                }
            });

            return {
                ...prev,
                [platform]: nextPlatformDraft,
            };
        });

        Object.entries(processedFilters).forEach(([key, value]) => {
            if (typeof value !== 'number') {
                setFilterValue(platform, key as keyof PlatformFilterValues, []);
            }
        });
    };

    const reloadVideosForBatch = async (platform: Platform, batchId: string) => {
        setLoading(true);

        const params = new URLSearchParams({
            batchId,
            platform,
            limit: '100',
        });
        const videosResponse = await fetch(`/api/videos?${params.toString()}`);
        const videosData = (await videosResponse.json()) as VideosResponse;

        if (!videosResponse.ok || videosData.error) {
            throw new Error(videosData.error || 'Failed to reload videos');
        }

        setVideos(videosData.videos || []);
    };

    const waitForBatchCompletion = async (platform: Platform, batchId: string) => {
        setWorkerMessage('Queued worker job...');

        for (let attempt = 0; attempt < 60; attempt += 1) {
            await new Promise((resolve) => setTimeout(resolve, 2000));

            const inspectResponse = await fetch(`/api/filter/inspect?batchId=${encodeURIComponent(batchId)}`);
            const inspectData = (await inspectResponse.json()) as QueueInspectResponse;

            if (!inspectResponse.ok || inspectData.error) {
                throw new Error(inspectData.error || 'Failed to inspect worker job');
            }

            const states = inspectData.jobs?.map((job) => job.state) || [];

            if (states.some((state) => state === 'failed')) {
                throw new Error('Worker job failed');
            }

            if (states.some((state) => state === 'active')) {
                setWorkerMessage('Worker is finding videos...');
                continue;
            }

            if (states.some((state) => state === 'waiting' || state === 'delayed')) {
                setWorkerMessage('Waiting for worker...');
                continue;
            }

            if (states.length > 0 && states.every((state) => state === 'completed')) {
                setWorkerMessage('Worker completed. Updating videos...');
                setCurrentBatchId(platform, batchId);
                await reloadVideosForBatch(platform, batchId);
                setWorkerMessage('Completed. Video list updated.');
                hideJobMessagesSoon();
                return;
            }
        }

        throw new Error('Timed out waiting for worker job');
    };

    const submitFiltersToRedis = async (
        platform: Platform,
        processedFilters: Record<string, string[] | number>,
    ) => {
        setIsSubmitting(true);
        setSubmitMessage(null);
        setWorkerMessage(null);

        try {
            const request: DecomposeFilterRequest = {
                platform,
                filters: processedFilters as DecomposeFilterRequest['filters'],
            };

            const response = await fetch('/api/filter/decompose', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(request),
            });
            const result = (await response.json()) as JobSubmissionResult & { error?: string };

            if (!response.ok || result.error) {
                throw new Error(result.error || 'Failed to submit filters');
            }

            setSubmitMessage({
                type: 'success',
                text: `Submitted ${result.totalJobs} job(s).`,
            });
            setBatchIds((prev) => ({
                ...prev,
                [platform]: result.batchId,
            }));

            await waitForBatchCompletion(platform, result.batchId);
            clearTextInputsAfterSuccess(platform, processedFilters);
        } catch (error) {
            const errorText = error instanceof Error ? error.message : 'Unknown error';
            setSubmitMessage({
                type: 'error',
                text: `Error: ${errorText}`,
            });
            setWorkerMessage(null);
        } finally {
            setLoading(false);
            setIsSubmitting(false);
        }
    };

    const handleFind = async (platform: Platform) => {
        setActivePlatform(platform);

        const platformFilters = draftFilters[platform] || {};
        const platformConfig = PLATFORM_FILTER_CONFIGS.find((config) => config.platform === platform);
        const processedFilters: Record<string, string[] | number> = {};

        Object.entries(platformFilters).forEach(([key, value]) => {
            if (typeof value === 'string') {
                const arrayValue = value
                    .split(',')
                    .map((item) => item.trim())
                    .filter(Boolean);

                if (arrayValue.length > 0) {
                    processedFilters[key] = arrayValue;
                    setFilterValue(platform, key as keyof PlatformFilterValues, arrayValue);
                }
            } else {
                processedFilters[key] = value;
                setFilterValue(platform, key as keyof PlatformFilterValues, value);
            }
        });

        platformConfig?.sections.forEach((section) => {
            section.fields.forEach((field) => {
                if (field.type === 'slider' && !(field.key in processedFilters)) {
                    const defaultValue = field.defaultValue ?? field.min ?? 1;
                    processedFilters[field.key] = defaultValue;
                    setFilterValue(platform, field.key as keyof PlatformFilterValues, defaultValue);
                }
            });
        });

        await submitFiltersToRedis(platform, processedFilters);
    };

    const handleClear = async (platform: Platform) => {
        const batchId = batchIds[platform];

        try {
            if (batchId) {
                const clearResponse = await fetch('/api/filter/clear', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ batchId, platform }),
                });

                if (!clearResponse.ok) {
                    const errorData = (await clearResponse.json()) as ClearJobsResponse;
                    throw new Error(errorData.error || 'Failed to clear queue jobs');
                }
            }

            setDraftFilters((prev) => {
                const updated = { ...prev };
                delete updated[platform];
                return updated;
            });
            setBatchIds((prev) => {
                const updated = { ...prev };
                delete updated[platform];
                return updated;
            });
            resetFilters(platform);
            setCurrentBatchId(platform, null);

            if (activePlatform === platform) {
                setVideos([]);
            }

            setSubmitMessage({
                type: 'success',
                text: 'Cleared filters.',
            });
            setWorkerMessage(null);
            hideJobMessagesSoon();
        } catch (error) {
            setSubmitMessage({
                type: 'error',
                text: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
            });
        }
    };

    const cleanupHistory = async (
        platform: Platform,
        mode: 'clear-history' | 'retention',
        retentionDays?: 7 | 30,
    ) => {
        try {
            const response = await fetch('/api/filter/cleanup', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    mode,
                    platform,
                    retentionDays,
                }),
            });
            const result = (await response.json()) as CleanupResponse;

            if (!response.ok || result.error) {
                throw new Error(result.error || 'Failed to clean history');
            }

            if (mode === 'clear-history') {
                setCurrentBatchId(platform, null);
                if (activePlatform === platform) {
                    setVideos([]);
                }
            }

            setSubmitMessage({
                type: 'success',
                text: result.message || `Deleted ${result.deletedVideos ?? 0} videos.`,
            });
            setWorkerMessage(null);
            hideJobMessagesSoon();
        } catch (error) {
            setSubmitMessage({
                type: 'error',
                text: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
            });
            setWorkerMessage(null);
        }
    };

    return (
        <div className="flex h-full flex-col border-r border-gray-200 bg-white">
            <div className="border-b border-gray-100 px-4 py-4">
                <h2 className="text-sm font-bold uppercase tracking-wide text-gray-900">Platform</h2>
            </div>

            {submitMessage && (
                <div
                    className={`mx-2 mt-2 rounded-lg border px-3 py-2 text-xs font-medium ${submitMessage.type === 'success'
                        ? 'border-green-300 bg-green-50 text-green-700'
                        : 'border-red-300 bg-red-50 text-red-700'
                        }`}
                >
                    {submitMessage.text}
                </div>
            )}
            {workerMessage && (
                <div className="mx-2 mt-2 rounded-lg border border-blue-300 bg-blue-50 px-3 py-2 text-xs font-medium text-blue-700">
                    {workerMessage}
                </div>
            )}

            <div className="flex-1 overflow-y-auto py-2">
                {PLATFORM_FILTER_CONFIGS.map((config) => {
                    const isActive = activePlatform === config.platform;
                    const isExpanded = expandedPlatforms.has(config.platform);
                    const platformFilters = filters[config.platform] ?? {};
                    const activeClass = isActive ? PLATFORM_ACTIVE_COLORS[config.platform] : '';

                    return (
                        <div key={config.platform} className="mb-1">
                            <div
                                className={`mx-2 flex cursor-pointer items-center justify-between rounded-lg border px-3 py-2 transition-all ${isActive
                                    ? `${activeClass} border`
                                    : 'border-transparent hover:bg-gray-50'
                                    }`}
                            >
                                <button
                                    className="flex flex-1 cursor-pointer items-center gap-2 text-left"
                                    onClick={() => handlePlatformClick(config.platform)}
                                >
                                    <span className="text-base">{config.emoji}</span>
                                    <span className="text-sm font-semibold text-gray-700">{config.label}</span>
                                </button>
                                <button
                                    onClick={(event) => {
                                        event.stopPropagation();
                                        togglePlatformExpand(config.platform);
                                    }}
                                    className="ml-1 cursor-pointer text-xs text-gray-400 hover:text-gray-600"
                                >
                                    &gt;
                                </button>
                            </div>

                            {isExpanded && (
                                <div className="mx-2 mb-2 mt-1 rounded-lg bg-gray-50 px-3 py-2">
                                    {config.sections.map((section) => (
                                        <FilterSection key={section.label} label={section.label}>
                                            {section.fields.map((field) => {
                                                const rawVal = platformFilters[field.key as keyof PlatformFilterValues];

                                                if (field.type === 'slider') {
                                                    const draftVal = draftFilters[config.platform]?.[field.key];
                                                    const tempVal = draftVal ?? rawVal ?? field.defaultValue ?? field.min ?? 0;
                                                    const val = typeof tempVal === 'number' ? tempVal : field.min ?? 0;

                                                    return (
                                                        <label key={field.key} className="mb-3 block">
                                                            <span className="mb-1 block text-xs font-medium text-gray-600">
                                                                {field.label}
                                                            </span>
                                                            <div className="mb-1 flex justify-between text-xs text-gray-400">
                                                                <span>{field.min ?? 0}</span>
                                                                <span className="font-medium text-gray-600">{val}</span>
                                                                <span>{field.max ?? 100}</span>
                                                            </div>
                                                            <input
                                                                type="range"
                                                                min={field.min ?? 0}
                                                                max={field.max ?? 100}
                                                                step={field.step ?? 1}
                                                                value={val}
                                                                onChange={(event) =>
                                                                    handleSliderChange(
                                                                        config.platform,
                                                                        field.key as keyof PlatformFilterValues,
                                                                        Number(event.target.value),
                                                                    )
                                                                }
                                                                className="w-full cursor-pointer accent-blue-500"
                                                            />
                                                        </label>
                                                    );
                                                }

                                                const draftVal = draftFilters[config.platform]?.[field.key];
                                                const val = typeof draftVal === 'string' ? draftVal : '';

                                                return (
                                                    <label key={field.key} className="mb-2 block">
                                                        <span className="mb-1 block text-xs font-medium text-gray-600">
                                                            {field.label}
                                                        </span>
                                                        <input
                                                            type="text"
                                                            placeholder={field.placeholder ?? ''}
                                                            value={val}
                                                            onChange={(event) =>
                                                                handleInputChange(config.platform, field.key, event.target.value)
                                                            }
                                                            className="w-full rounded-md border border-gray-200 bg-white px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-400"
                                                        />
                                                    </label>
                                                );
                                            })}
                                        </FilterSection>
                                    ))}

                                    <div className="mt-3 flex justify-end gap-2">
                                        <button
                                            onClick={() => void handleClear(config.platform)}
                                            className="cursor-pointer rounded-lg bg-gray-200 px-4 py-2 text-xs font-semibold text-gray-700 transition-colors hover:bg-gray-300"
                                        >
                                            Clear
                                        </button>
                                        <button
                                            onClick={() => void handleFind(config.platform)}
                                            disabled={isSubmitting}
                                            className="cursor-pointer rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-blue-700 disabled:bg-blue-400"
                                        >
                                            {isSubmitting ? 'Submitting...' : 'Find'}
                                        </button>
                                    </div>
                                    <div className="mt-3 border-t border-gray-200 pt-3">
                                        <div className="mb-2 text-xs font-semibold text-gray-500">
                                            History
                                        </div>
                                        <div className="grid grid-cols-3 gap-2">
                                            <button
                                                onClick={() => void cleanupHistory(config.platform, 'retention', 7)}
                                                className="rounded-md bg-white px-2 py-1.5 text-xs font-medium text-gray-600 ring-1 ring-gray-200 hover:bg-gray-100"
                                            >
                                                Keep 7d
                                            </button>
                                            <button
                                                onClick={() => void cleanupHistory(config.platform, 'retention', 30)}
                                                className="rounded-md bg-white px-2 py-1.5 text-xs font-medium text-gray-600 ring-1 ring-gray-200 hover:bg-gray-100"
                                            >
                                                Keep 30d
                                            </button>
                                            <button
                                                onClick={() => void cleanupHistory(config.platform, 'clear-history')}
                                                className="rounded-md bg-red-50 px-2 py-1.5 text-xs font-semibold text-red-700 ring-1 ring-red-200 hover:bg-red-100"
                                            >
                                                Clear history
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
