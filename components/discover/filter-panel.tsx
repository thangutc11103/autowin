'use client';

import { useState } from 'react';
import { PLATFORM_FILTER_CONFIGS } from '@/config/filter-config';
import { useFilterStore } from '@/store/filter.store';
import { useLanguageStore, type AppLanguage } from '@/store/language.store';
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

interface ValidateInstagramCookiesResponse {
    success?: boolean;
    error?: string;
}

const PLATFORM_ACTIVE_COLORS: Record<Platform, string> = {
    tiktok: 'bg-pink-500/10 border-pink-400/45 text-pink-100',
    douyin: 'bg-violet-500/10 border-violet-400/45 text-violet-100',
    facebook: 'bg-blue-500/10 border-blue-400/45 text-blue-100',
    instagram: 'bg-amber-500/10 border-amber-400/45 text-amber-100',
    youtube: 'bg-red-500/10 border-red-400/45 text-red-100',
};

const PANEL_CLASS = 'mx-3 mb-3 mt-2 rounded-2xl border border-cyan-300/10 bg-slate-950/58 px-3 py-3 shadow-[0_20px_45px_rgba(0,0,0,0.22)]';
const LABEL_CLASS = 'mb-1 block text-xs font-semibold text-slate-200';
const TEXT_INPUT_CLASS =
    'w-full rounded-lg border border-slate-700/70 bg-slate-950/70 px-2.5 py-2 text-xs text-slate-100 outline-none transition focus:border-cyan-300/50 focus:ring-2 focus:ring-blue-500/25 disabled:text-slate-400';
const SECONDARY_BUTTON_CLASS =
    'cursor-pointer rounded-xl border border-slate-700/70 bg-slate-900/80 px-4 py-2 text-xs font-bold text-slate-100 transition-colors hover:border-cyan-300/30 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50';
const PRIMARY_BUTTON_CLASS =
    'cursor-pointer rounded-xl bg-gradient-to-r from-blue-600 to-violet-600 px-4 py-2 text-xs font-bold text-white shadow-[0_0_20px_rgba(59,130,246,0.28)] transition-colors hover:from-blue-500 hover:to-violet-500 disabled:cursor-not-allowed disabled:opacity-50';
const HISTORY_BUTTON_CLASS =
    'rounded-lg bg-slate-950/70 px-2 py-1.5 text-xs font-semibold text-slate-200 ring-1 ring-cyan-300/12 hover:bg-slate-900';

const FILTER_COPY = {
    vi: {
        platformTitle: 'Nền tảng',
        filterSection: 'Bộ lọc',
        fields: {
            search: 'Từ khóa tìm kiếm',
            video_url: 'URL video',
            danh_muc: 'Danh mục',
            hashtag: 'Hashtag',
            ten_kenh_tai_khoan: 'Tài khoản/Kênh',
            limit: 'Số video tối đa',
        },
        clear: 'Xóa',
        find: 'Tìm',
        submitting: 'Đang gửi...',
        history: 'Lịch sử',
        keep7d: 'Giữ 7 ngày',
        keep30d: 'Giữ 30 ngày',
        clearHistory: 'Xóa lịch sử',
        messages: {
            pasteCookies: 'Dán Instagram cookies trước.',
            checkingCookies: 'Đang kiểm tra cookies...',
            cookiesVerified: 'Cookies đã xác minh. Có thể dùng hashtag.',
            cookiesFailed: 'Kiểm tra cookie thất bại',
            queued: 'Đã đưa job vào hàng đợi...',
            finding: 'Worker đang tìm video...',
            waiting: 'Đang chờ worker...',
            completed: 'Worker hoàn tất. Đang cập nhật video...',
            updated: 'Hoàn tất. Danh sách video đã cập nhật.',
            submitted: (count: number) => `Đã gửi ${count} job.`,
            cleared: 'Đã xóa bộ lọc.',
            deleted: (count: number) => `Đã xóa ${count} video.`,
            verifyInstagram: 'Xác minh Instagram cookies trước khi tìm hashtag.',
        },
    },
    en: {
        platformTitle: 'Platform',
        filterSection: 'Filters',
        fields: {
            search: 'Search keyword',
            video_url: 'Video URL',
            danh_muc: 'Category',
            hashtag: 'Hashtag',
            ten_kenh_tai_khoan: 'Account/Channel',
            limit: 'Max videos',
        },
        clear: 'Clear',
        find: 'Find',
        submitting: 'Submitting...',
        history: 'History',
        keep7d: 'Keep 7d',
        keep30d: 'Keep 30d',
        clearHistory: 'Clear history',
        messages: {
            pasteCookies: 'Paste Instagram cookies first.',
            checkingCookies: 'Checking cookies...',
            cookiesVerified: 'Cookies verified. Hashtag input unlocked.',
            cookiesFailed: 'Cookie check failed',
            queued: 'Queued worker job...',
            finding: 'Worker is finding videos...',
            waiting: 'Waiting for worker...',
            completed: 'Worker completed. Updating videos...',
            updated: 'Completed. Video list updated.',
            submitted: (count: number) => `Submitted ${count} job(s).`,
            cleared: 'Cleared filters.',
            deleted: (count: number) => `Deleted ${count} videos.`,
            verifyInstagram: 'Verify Instagram cookies before using hashtag search.',
        },
    },
} satisfies Record<AppLanguage, {
    platformTitle: string;
    filterSection: string;
    fields: Record<string, string>;
    clear: string;
    find: string;
    submitting: string;
    history: string;
    keep7d: string;
    keep30d: string;
    clearHistory: string;
    messages: Record<string, string | ((count: number) => string)>;
}>;

const VI_FILTER_COPY: typeof FILTER_COPY.en = {
    platformTitle: 'Nền tảng',
    filterSection: 'Bộ lọc',
    fields: {
        search: 'Từ khóa tìm kiếm',
        video_url: 'URL video',
        danh_muc: 'Danh mục',
        hashtag: 'Hashtag',
        ten_kenh_tai_khoan: 'Tài khoản/Kênh',
        limit: 'Số video tối đa',
    },
    clear: 'Xóa',
    find: 'Tìm',
    submitting: 'Đang gửi...',
    history: 'Lịch sử',
    keep7d: 'Giữ 7 ngày',
    keep30d: 'Giữ 30 ngày',
    clearHistory: 'Xóa lịch sử',
    messages: {
        pasteCookies: 'Dán Instagram cookies trước.',
        checkingCookies: 'Đang kiểm tra cookies...',
        cookiesVerified: 'Cookies đã xác minh. Có thể dùng hashtag.',
        cookiesFailed: 'Kiểm tra cookie thất bại',
        queued: 'Đã đưa job vào hàng đợi...',
        finding: 'Worker đang tìm video...',
        waiting: 'Đang chờ worker...',
        completed: 'Worker hoàn tất. Đang cập nhật video...',
        updated: 'Hoàn tất. Danh sách video đã cập nhật.',
        submitted: (count: number) => `Đã gửi ${count} job.`,
        cleared: 'Đã xóa bộ lọc.',
        deleted: (count: number) => `Đã xóa ${count} video.`,
        verifyInstagram: 'Xác minh Instagram cookies trước khi tìm hashtag.',
    },
};

function getFilterCopy(language: AppLanguage) {
    return language === 'vi' ? VI_FILTER_COPY : FILTER_COPY.en;
}

function getFieldLabel(language: AppLanguage, key: string, fallback: string) {
    const fields = getFilterCopy(language).fields as Record<string, string>;
    return fields[key] || fallback;
}

function getMessage(
    language: AppLanguage,
    key: keyof typeof FILTER_COPY.en.messages,
    count?: number,
) {
    const value = getFilterCopy(language).messages[key];
    return typeof value === 'function' ? value(count || 0) : value;
}

function FilterSection({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="border-b border-cyan-300/10 last:border-0">
            <div className="flex items-center justify-between px-1 py-2 text-xs font-bold text-slate-200">
                <span>{label}</span>
                <span className="text-cyan-300/70">v</span>
            </div>
            <div className="px-1 pb-3">{children}</div>
        </div>
    );
}

export default function FilterPanel({ showHeader = true }: { showHeader?: boolean }) {
    const language = useLanguageStore((state) => state.language);
    const text = getFilterCopy(language);
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
    const [instagramCookies, setInstagramCookies] = useState('');
    const [instagramCookieStatus, setInstagramCookieStatus] = useState<{
        type: 'idle' | 'checking' | 'valid' | 'error';
        text: string;
    }>({
        type: 'idle',
        text: '',
    });

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

    const isInstagramHashtagUnlocked = instagramCookieStatus.type === 'valid';

    const validateInstagramCookies = async () => {
        const tagDraft = draftFilters.instagram?.hashtag;
        const tag =
            typeof tagDraft === 'string'
                ? tagDraft.split(',')[0]?.trim().replace(/^#/, '')
                : '';

        if (!instagramCookies.trim()) {
            setInstagramCookieStatus({
                type: 'error',
                text: getMessage(language, 'pasteCookies'),
            });
            return;
        }

        setInstagramCookieStatus({
            type: 'checking',
            text: getMessage(language, 'checkingCookies'),
        });

        try {
            const response = await fetch('/api/scrapers/instagram/validate-cookies', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    cookies: instagramCookies,
                    tag: tag || 'trending',
                }),
            });
            const result = (await response.json()) as ValidateInstagramCookiesResponse;

            if (!response.ok || !result.success) {
                throw new Error(result.error || 'Cookies are not usable');
            }

            setInstagramCookieStatus({
                type: 'valid',
                text: getMessage(language, 'cookiesVerified'),
            });
        } catch (error) {
            setInstagramCookieStatus({
                type: 'error',
                text: error instanceof Error ? error.message : getMessage(language, 'cookiesFailed'),
            });
        }
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
        setWorkerMessage(getMessage(language, 'queued'));

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
                setWorkerMessage(getMessage(language, 'finding'));
                continue;
            }

            if (states.some((state) => state === 'waiting' || state === 'delayed')) {
                setWorkerMessage(getMessage(language, 'waiting'));
                continue;
            }

            if (states.length > 0 && states.every((state) => state === 'completed')) {
                setWorkerMessage(getMessage(language, 'completed'));
                setCurrentBatchId(platform, batchId);
                await reloadVideosForBatch(platform, batchId);
                setWorkerMessage(getMessage(language, 'updated'));
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
                authCookies:
                    platform === 'instagram' && Array.isArray(processedFilters.hashtag)
                        ? instagramCookies
                        : undefined,
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
                text: getMessage(language, 'submitted', result.totalJobs),
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

        if (
            platform === 'instagram' &&
            Array.isArray(processedFilters.hashtag) &&
            processedFilters.hashtag.length > 0 &&
            !isInstagramHashtagUnlocked
        ) {
            setSubmitMessage({
                type: 'error',
                text: getMessage(language, 'verifyInstagram'),
            });
            return;
        }

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

            if (platform === 'instagram') {
                setInstagramCookies('');
                setInstagramCookieStatus({
                    type: 'idle',
                    text: '',
                });
            }

            if (activePlatform === platform) {
                setVideos([]);
            }

            setSubmitMessage({
                type: 'success',
                text: getMessage(language, 'cleared'),
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
                text: result.message || getMessage(language, 'deleted', result.deletedVideos ?? 0),
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
        <div className="flex h-full flex-col border-r border-cyan-300/10 bg-slate-950/55 backdrop-blur-xl">
            {showHeader && (
                <div className="border-b border-cyan-300/10 px-5 py-5">
                    <h2 className="text-sm font-bold uppercase tracking-wide text-slate-300">{text.platformTitle}</h2>
                </div>
            )}

            {submitMessage && (
                <div
                    className={`mx-3 mt-3 rounded-xl border px-3 py-2 text-xs font-semibold ${submitMessage.type === 'success'
                        ? 'border-emerald-400/30 bg-emerald-500/10 text-emerald-200'
                        : 'border-rose-400/30 bg-rose-500/10 text-rose-200'
                        }`}
                >
                    {submitMessage.text}
                </div>
            )}
            {workerMessage && (
                <div className="mx-3 mt-3 rounded-xl border border-blue-400/30 bg-blue-500/10 px-3 py-2 text-xs font-semibold text-blue-200">
                    {workerMessage}
                </div>
            )}

            <div className="flex-1 overflow-y-auto py-3">
                {PLATFORM_FILTER_CONFIGS.map((config) => {
                    const isActive = activePlatform === config.platform;
                    const isExpanded = expandedPlatforms.has(config.platform);
                    const platformFilters = filters[config.platform] ?? {};
                    const activeClass = isActive ? PLATFORM_ACTIVE_COLORS[config.platform] : '';

                    return (
                        <div key={config.platform} className="mb-2">
                            <div
                                className={`mx-3 flex cursor-pointer items-center justify-between rounded-xl border px-3 py-3 transition-all ${isActive
                                    ? `${activeClass} shadow-[0_0_24px_rgba(139,92,246,0.22)]`
                                    : 'border-transparent hover:border-cyan-300/15 hover:bg-slate-900/65'
                                    }`}
                            >
                                <button
                                    className="flex flex-1 cursor-pointer items-center gap-2 text-left"
                                    onClick={() => handlePlatformClick(config.platform)}
                                >
                                    <span className="text-base">{config.emoji}</span>
                                    <span className="text-sm font-bold text-slate-100">{config.label}</span>
                                </button>
                                <button
                                    onClick={(event) => {
                                        event.stopPropagation();
                                        togglePlatformExpand(config.platform);
                                    }}
                                    className="ml-1 cursor-pointer text-xs text-slate-400 hover:text-cyan-200"
                                >
                                    &gt;
                                </button>
                            </div>

                            {isExpanded && (
                                <div className={PANEL_CLASS}>
                                    {config.sections.map((section) => (
                                        <FilterSection key={section.label} label={text.filterSection}>
                                            {section.fields.map((field) => {
                                                const rawVal = platformFilters[field.key as keyof PlatformFilterValues];

                                                if (field.type === 'slider') {
                                                    const draftVal = draftFilters[config.platform]?.[field.key];
                                                    const tempVal = draftVal ?? rawVal ?? field.defaultValue ?? field.min ?? 0;
                                                    const val = typeof tempVal === 'number' ? tempVal : field.min ?? 0;

                                                    return (
                                                        <label key={field.key} className="mb-3 block">
                                                            <span className={LABEL_CLASS}>
                                                                {getFieldLabel(language, field.key, field.label)}
                                                            </span>
                                                            <div className="mb-1 flex justify-between text-xs text-slate-300">
                                                                <span>{field.min ?? 0}</span>
                                                                <span className="font-bold text-slate-100">{val}</span>
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
                                                const isLockedInstagramHashtag =
                                                    config.platform === 'instagram' &&
                                                    field.key === 'hashtag' &&
                                                    !isInstagramHashtagUnlocked;
                                                const cookieStatusClass =
                                                    instagramCookieStatus.type === 'valid'
                                                        ? 'text-green-700'
                                                        : instagramCookieStatus.type === 'error'
                                                            ? 'text-red-700'
                                                            : 'text-gray-600';

                                                return (
                                                    <div key={field.key} className="mb-2 block">
                                                        <span className={LABEL_CLASS}>
                                                            {getFieldLabel(language, field.key, field.label)}
                                                        </span>
                                                        <div className={`relative ${isLockedInstagramHashtag ? 'min-h-20' : ''}`}>
                                                            <input
                                                                type="text"
                                                                placeholder={field.placeholder ?? ''}
                                                                value={val}
                                                                disabled={isLockedInstagramHashtag}
                                                                onChange={(event) =>
                                                                    handleInputChange(config.platform, field.key, event.target.value)
                                                                }
                                                                className={`${TEXT_INPUT_CLASS} ${isLockedInstagramHashtag ? 'pointer-events-none blur-[1px]' : ''
                                                                    }`}
                                                            />

                                                            {isLockedInstagramHashtag && (
                                                                <div className="absolute inset-0 rounded-lg border border-orange-300/30 bg-slate-950/90 p-2 shadow-sm backdrop-blur">
                                                                    <div className="flex gap-2">
                                                                        <input
                                                                            type="password"
                                                                            placeholder="Instagram cookies"
                                                                            value={instagramCookies}
                                                                            onChange={(event) => {
                                                                                setInstagramCookies(event.target.value);
                                                                                setInstagramCookieStatus({
                                                                                    type: 'idle',
                                                                                    text: '',
                                                                                });
                                                                            }}
                                                                            className="min-w-0 flex-1 rounded-lg border border-orange-300/25 bg-slate-950/80 px-2 py-1 text-xs text-slate-100 focus:outline-none focus:ring-2 focus:ring-orange-300/25"
                                                                        />
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => void validateInstagramCookies()}
                                                                            disabled={instagramCookieStatus.type === 'checking'}
                                                                            className="shrink-0 rounded-lg bg-orange-600 px-2 py-1 text-xs font-semibold text-white hover:bg-orange-500 disabled:opacity-50"
                                                                        >
                                                                            {instagramCookieStatus.type === 'checking' ? 'Checking' : 'Check'}
                                                                        </button>
                                                                    </div>
                                                                    {instagramCookieStatus.text && (
                                                                        <div className={`mt-1 text-[10px] leading-tight ${cookieStatusClass}`}>
                                                                            {instagramCookieStatus.text}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </FilterSection>
                                    ))}

                                    <div className="mt-3 flex justify-end gap-2">
                                        <button
                                            onClick={() => void handleClear(config.platform)}
                                            className={SECONDARY_BUTTON_CLASS}
                                        >
                                            {text.clear}
                                        </button>
                                        <button
                                            onClick={() => void handleFind(config.platform)}
                                            disabled={isSubmitting}
                                            className={PRIMARY_BUTTON_CLASS}
                                        >
                                            {isSubmitting ? text.submitting : text.find}
                                        </button>
                                    </div>
                                    <div className="mt-3 border-t border-cyan-300/10 pt-3">
                                        <div className="mb-2 text-xs font-bold text-slate-300">
                                            {text.history}
                                        </div>
                                        <div className="grid grid-cols-3 gap-2">
                                            <button
                                                onClick={() => void cleanupHistory(config.platform, 'retention', 7)}
                                                className={HISTORY_BUTTON_CLASS}
                                            >
                                                {text.keep7d}
                                            </button>
                                            <button
                                                onClick={() => void cleanupHistory(config.platform, 'retention', 30)}
                                                className={HISTORY_BUTTON_CLASS}
                                            >
                                                {text.keep30d}
                                            </button>
                                            <button
                                                onClick={() => void cleanupHistory(config.platform, 'clear-history')}
                                                className="rounded-lg bg-rose-500/10 px-2 py-1.5 text-xs font-bold text-rose-200 ring-1 ring-rose-400/30 hover:bg-rose-500/15"
                                            >
                                                {text.clearHistory}
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
