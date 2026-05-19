'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import { useLanguageStore, type AppLanguage } from '@/store/language.store';
import { useVideoStore } from '@/store/video.store';
import type { Platform, Video } from '@/types/video';

type PostMode = 'draft' | 'scheduled';
type PublishWindow = 'now' | 'schedule';
type ComplianceKey = 'rights' | 'review' | 'api';
type ChannelStatus = 'connected' | 'setup' | 'review';
type PostStatus = 'draft' | 'ready' | 'needsReview' | 'queued' | 'scheduled' | 'publishing' | 'published' | 'failed';

type OAuthPlatform = Exclude<Platform, 'douyin'>;

interface PublishingAccount {
    key: string;
    platform: OAuthPlatform;
    label?: string;
    handle?: string;
    displayName?: string;
    scope?: string;
    connectedAt: string;
    hasRefreshToken: boolean;
}

interface AccountsResponse {
    accounts?: PublishingAccount[];
    error?: string;
}

interface ScheduledPost {
    id: string;
    videoTitle: string;
    caption: string;
    targets: Array<{
        id?: string;
        accountKey: string;
        platform: Exclude<Platform, 'douyin'>;
        accountLabel?: string | null;
        status: PostStatus;
        lastError?: string | null;
        platformPostId?: string | null;
        publishedAt?: string | null;
    }>;
    scheduledAt?: string | null;
    queuedAt: string;
    status: PostStatus;
}

interface QueuePostResponse {
    success?: boolean;
    post?: ScheduledPost;
    error?: string;
}

interface ScheduledPostsResponse {
    posts?: ScheduledPost[];
    error?: string;
}

const COPY = {
    vi: {
        pageTitle: 'Tự động đăng bài',
        pageDescription: 'Soạn bài từ video đã duyệt, lên lịch phát hành và giữ bước đăng API sau cổng kiểm duyệt.',
        mode: {
            draft: 'Soạn bài',
            scheduled: 'Đã lên lịch',
        },
        readyMedia: 'Video sẵn sàng',
        itemCount: (count: number) => `${count} mục`,
        emptyTitle: 'Chưa có video đã chuẩn bị',
        emptyDescription: 'Hãy lưu video từ mục Đã chọn vào danh sách Sẵn sàng đăng trước khi soạn bài tự động.',
        localFileReady: 'File local đã sẵn sàng',
        sourceOnly: 'Chỉ có link nguồn',
        caption: 'Caption',
        defaultCaption: 'Video mới được chọn từ hàng đợi trend. Hãy kiểm tra hook, xác minh quyền sử dụng rồi đăng qua API chính thức của nền tảng.',
        characters: 'ký tự',
        words: 'từ',
        publishingWindow: 'Thời điểm đăng',
        schedule: 'Lên lịch',
        manualPublish: 'Đăng thủ công',
        date: 'Ngày',
        time: 'Giờ',
        preview: 'Xem trước',
        noMedia: 'Chưa có media',
        chooseVideo: 'Chọn một video',
        channels: 'Kênh đăng',
        reviewGates: 'Cổng kiểm duyệt',
        channelStatus: {
            connected: 'đã kết nối',
            setup: 'cần cài đặt',
            review: 'đang duyệt',
        },
        checks: {
            rightsTitle: 'Đã xác minh quyền sử dụng',
            rightsBody: 'Nội dung, âm thanh, caption và thumbnail đều hợp lệ.',
            reviewTitle: 'Bắt buộc có người duyệt',
            reviewBody: 'Giữ bài ở bản nháp cho tới khi reviewer duyệt.',
            apiTitle: 'Chỉ dùng API chính thức',
            apiBody: 'Không đăng bằng cookie hoặc tự động hóa trình duyệt.',
        },
        publishTime: 'Thời gian đăng',
        footerReady: 'Bản nháp đã sẵn sàng đưa vào hàng đợi đăng qua API nền tảng.',
        footerBlocked: 'Chọn video, kênh đăng, caption và hoàn tất các cổng kiểm duyệt.',
        saveDraft: 'Lưu nháp',
        queuePost: 'Đưa vào hàng đợi',
        postStatus: {
            draft: 'Bản nháp',
            ready: 'Sẵn sàng',
            needsReview: 'Cần duyệt',
            queued: 'Trong hàng đợi',
            scheduled: 'Đã lên lịch',
            publishing: 'Đang đăng',
            published: 'Đã đăng',
            failed: 'Lỗi',
        },
    },
    en: {
        pageTitle: 'Post Automation',
        pageDescription: 'Compose approved video posts, schedule releases, and keep API publishing gated by review.',
        mode: {
            draft: 'Draft',
            scheduled: 'Scheduled',
        },
        readyMedia: 'Ready Media',
        itemCount: (count: number) => `${count} item(s)`,
        emptyTitle: 'No prepared videos',
        emptyDescription: 'Save videos from Selected into Ready to Post before composing an automated post.',
        localFileReady: 'Local file ready',
        sourceOnly: 'Source link only',
        caption: 'Caption',
        defaultCaption: 'New short picked from the trending queue. Review the hook, verify rights, then publish through official platform APIs.',
        characters: 'characters',
        words: 'words',
        publishingWindow: 'Publishing Window',
        schedule: 'Schedule',
        manualPublish: 'Manual publish',
        date: 'Date',
        time: 'Time',
        preview: 'Preview',
        noMedia: 'No media',
        chooseVideo: 'Choose a video',
        channels: 'Channels',
        reviewGates: 'Review Gates',
        channelStatus: {
            connected: 'connected',
            setup: 'setup',
            review: 'review',
        },
        checks: {
            rightsTitle: 'Usage rights verified',
            rightsBody: 'Content, audio, caption, and thumbnail are cleared.',
            reviewTitle: 'Human approval required',
            reviewBody: 'Keep posts in draft until a reviewer approves.',
            apiTitle: 'Official APIs only',
            apiBody: 'Do not publish through cookies or browser automation.',
        },
        publishTime: 'Publish time',
        footerReady: 'Draft is ready to be queued for platform API publishing.',
        footerBlocked: 'Choose media, channels, caption, and complete review gates.',
        saveDraft: 'Save draft',
        queuePost: 'Queue post',
        postStatus: {
            draft: 'Draft',
            ready: 'Ready',
            needsReview: 'Needs review',
            queued: 'Queued',
            scheduled: 'Scheduled',
            publishing: 'Publishing',
            published: 'Published',
            failed: 'Failed',
        },
    },
} satisfies Record<AppLanguage, Record<string, unknown>>;

const PLATFORM_BADGES: Record<Platform, string> = {
    tiktok: 'bg-rose-50 text-rose-700 ring-rose-100',
    douyin: 'bg-zinc-100 text-zinc-700 ring-zinc-200',
    facebook: 'bg-sky-50 text-sky-700 ring-sky-100',
    instagram: 'bg-amber-50 text-amber-700 ring-amber-100',
    youtube: 'bg-red-50 text-red-700 ring-red-100',
};

const STATUS_STYLES: Record<ChannelStatus, string> = {
    connected: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
    setup: 'bg-gray-100 text-gray-700 ring-gray-200',
    review: 'bg-yellow-50 text-yellow-800 ring-yellow-100',
};

const POST_STATUS_STYLES: Record<PostStatus, string> = {
    draft: 'bg-gray-100 text-gray-700 ring-gray-200',
    ready: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
    needsReview: 'bg-yellow-50 text-yellow-800 ring-yellow-100',
    queued: 'bg-blue-50 text-blue-700 ring-blue-100',
    scheduled: 'bg-purple-50 text-purple-700 ring-purple-100',
    publishing: 'bg-amber-50 text-amber-700 ring-amber-100',
    published: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
    failed: 'bg-red-50 text-red-700 ring-red-100',
};

function getPostStatusStyle(status: string) {
    return POST_STATUS_STYLES[status as PostStatus] || POST_STATUS_STYLES.queued;
}

function getPostStatusText(text: (typeof COPY)[AppLanguage], status: string) {
    return text.postStatus[status as PostStatus] || status;
}

function getPlatformLabel(platform: Platform) {
    return PLATFORM_LABELS[platform] || platform;
}

const PLATFORM_LABELS: Record<Platform, string> = {
    tiktok: 'TikTok',
    douyin: 'Douyin',
    facebook: 'Facebook',
    instagram: 'Instagram',
    youtube: 'YouTube',
};

function getAccountLabel(account: PublishingAccount) {
    return (
        account.label?.trim() ||
        account.displayName?.trim() ||
        account.handle?.trim() ||
        `${PLATFORM_LABELS[account.platform]} account`
    );
}

function splitScopes(scope?: string) {
    return scope ? scope.split(/[,\s]+/).filter(Boolean) : [];
}

function VideoPickList({
    videos,
    selectedId,
    language,
    onSelect,
}: {
    videos: Video[];
    selectedId: string | null;
    language: AppLanguage;
    onSelect: (id: string) => void;
}) {
    const text = COPY[language];

    if (videos.length === 0) {
        return (
            <div className="flex min-h-56 items-center justify-center rounded-lg border border-dashed border-gray-200 bg-gray-50 px-6 text-center">
                <div>
                    <p className="text-sm font-semibold text-gray-900">{text.emptyTitle}</p>
                    <p className="mt-1 max-w-sm text-sm text-gray-500">{text.emptyDescription}</p>
                </div>
            </div>
        );
    }

    return (
        <div className="grid gap-2">
            {videos.slice(0, 5).map((video) => {
                const active = selectedId === video.id;

                return (
                    <button
                        key={video.id}
                        type="button"
                        onClick={() => onSelect(video.id)}
                        className={`flex min-h-24 items-center gap-3 rounded-lg border bg-white p-2 text-left transition-colors ${active
                            ? 'border-blue-500 ring-2 ring-blue-100'
                            : 'border-gray-100 hover:border-gray-200 hover:bg-gray-50'
                            }`}
                    >
                        <div className="relative aspect-[9/16] h-20 shrink-0 overflow-hidden rounded-md bg-gray-100">
                            {video.thumbnail ? (
                                <Image
                                    src={video.thumbnail}
                                    alt={video.title}
                                    fill
                                    unoptimized
                                    sizes="56px"
                                    className="object-cover"
                                />
                            ) : (
                                <div className="flex size-full items-center justify-center text-[10px] font-medium text-gray-400">
                                    Media
                                </div>
                            )}
                        </div>
                        <div className="min-w-0 flex-1">
                            <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ${PLATFORM_BADGES[video.platform]}`}>
                                {getPlatformLabel(video.platform)}
                            </span>
                            <p className="mt-2 line-clamp-2 text-sm font-semibold leading-snug text-gray-950">
                                {video.title}
                            </p>
                            <p className="mt-1 text-xs text-gray-500">
                                {video.preparedLocalUrl ? text.localFileReady : text.sourceOnly}
                            </p>
                        </div>
                    </button>
                );
            })}
        </div>
    );
}

export default function AutomationPage() {
    const language = useLanguageStore((state) => state.language);
    const postingVideos = useVideoStore((state) => state.postingVideos);
    const firstVideoId = postingVideos[0]?.id || null;
    const [selectedVideoId, setSelectedVideoId] = useState<string | null>(firstVideoId);
    const [publishingAccounts, setPublishingAccounts] = useState<PublishingAccount[]>([]);
    const [selectedAccountKeys, setSelectedAccountKeys] = useState<string[]>([]);
    const [accountsError, setAccountsError] = useState<string | null>(null);
    const [isLoadingAccounts, setIsLoadingAccounts] = useState(true);
    const [mode, setMode] = useState<PostMode>('draft');
    const [publishWindow, setPublishWindow] = useState<PublishWindow>('schedule');
    const [scheduleDate, setScheduleDate] = useState('');
    const [scheduleTime, setScheduleTime] = useState('');
    const [caption, setCaption] = useState(COPY[language].defaultCaption);
    const [scheduledPosts, setScheduledPosts] = useState<ScheduledPost[]>([]);
    const [queueMessage, setQueueMessage] = useState<string | null>(null);
    const [isQueueing, setIsQueueing] = useState(false);
    const [checks, setChecks] = useState<Record<ComplianceKey, boolean>>({
        rights: false,
        review: true,
        api: true,
    });
    const text = COPY[language];

    const selectedVideo = useMemo(
        () => postingVideos.find((video) => video.id === selectedVideoId) || postingVideos[0] || null,
        [postingVideos, selectedVideoId],
    );
    const accountsByPlatform = useMemo(
        () =>
            publishingAccounts.reduce<Record<OAuthPlatform, PublishingAccount[]>>(
                (groups, account) => {
                    groups[account.platform].push(account);
                    return groups;
                },
                {
                    tiktok: [],
                    facebook: [],
                    instagram: [],
                    youtube: [],
                },
            ),
        [publishingAccounts],
    );
    const selectedAccounts = useMemo(
        () => publishingAccounts.filter((account) => selectedAccountKeys.includes(account.key)),
        [publishingAccounts, selectedAccountKeys],
    );
    const scheduledAt =
        publishWindow === 'schedule' && scheduleDate && scheduleTime
            ? new Date(`${scheduleDate}T${scheduleTime}`).toISOString()
            : null;

    const allChecksPassed = Object.values(checks).every(Boolean);
    const canCreate = Boolean(
        selectedVideo &&
        selectedAccountKeys.length > 0 &&
        caption.trim() &&
        allChecksPassed &&
        (publishWindow === 'now' || scheduledAt),
    );

    useEffect(() => {
        let cancelled = false;

        async function loadAccounts() {
            try {
                const response = await fetch('/api/auth/accounts', { cache: 'no-store' });
                const data = (await response.json()) as AccountsResponse;

                if (!response.ok) {
                    throw new Error(data.error || 'Failed to load accounts');
                }

                if (!cancelled) {
                    const accounts = data.accounts || [];
                    setPublishingAccounts(accounts);
                    setSelectedAccountKeys((current) =>
                        current.filter((key) => accounts.some((account) => account.key === key)),
                    );
                }
            } catch (error) {
                if (!cancelled) {
                    setAccountsError(error instanceof Error ? error.message : 'Failed to load accounts');
                }
            } finally {
                if (!cancelled) {
                    setIsLoadingAccounts(false);
                }
            }
        }

        void loadAccounts();

        return () => {
            cancelled = true;
        };
    }, []);

    const loadScheduledPosts = useCallback(async (silent = false) => {
        try {
            const response = await fetch('/api/posting/queue', { cache: 'no-store' });
            const data = (await response.json()) as ScheduledPostsResponse;

            if (!response.ok) {
                throw new Error(data.error || 'Failed to load scheduled posts');
            }

            setScheduledPosts(data.posts || []);
        } catch (error) {
            if (!silent) {
                setQueueMessage(error instanceof Error ? error.message : 'Failed to load scheduled posts');
            }
        }
    }, []);

    useEffect(() => {
        const initialRefreshId = window.setTimeout(() => {
            void loadScheduledPosts(false);
        }, 0);
        const intervalId = window.setInterval(() => {
            void loadScheduledPosts(true);
        }, 5000);
        const handleFocus = () => {
            void loadScheduledPosts(true);
        };
        window.addEventListener('focus', handleFocus);

        return () => {
            window.clearTimeout(initialRefreshId);
            window.clearInterval(intervalId);
            window.removeEventListener('focus', handleFocus);
        };
    }, [loadScheduledPosts]);

    const toggleAccount = (accountKey: string) => {
        setSelectedAccountKeys((current) =>
            current.includes(accountKey)
                ? current.filter((item) => item !== accountKey)
                : [...current, accountKey],
        );
    };

    const toggleCheck = (key: ComplianceKey) => {
        setChecks((current) => ({
            ...current,
            [key]: !current[key],
        }));
    };

    const queuePost = async () => {
        if (!selectedVideo || !canCreate) {
            setQueueMessage(text.footerBlocked);
            return;
        }

        setIsQueueing(true);
        setQueueMessage(null);

        try {
            const response = await fetch('/api/posting/queue', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    video: selectedVideo,
                    caption,
                    publishWindow,
                    scheduledAt,
                    accountTargets: selectedAccounts.map((account) => ({
                        accountKey: account.key,
                        platform: account.platform,
                        accountLabel: getAccountLabel(account),
                    })),
                }),
            });
            const result = (await response.json()) as QueuePostResponse;

            if (!response.ok || result.error) {
                throw new Error(result.error || 'Failed to queue post');
            }

            await loadScheduledPosts(true);
            setMode('scheduled');
            setQueueMessage('Post queued successfully.');
        } catch (error) {
            setQueueMessage(error instanceof Error ? error.message : 'Failed to queue post');
        } finally {
            setIsQueueing(false);
        }
    };

    return (
        <div className="flex h-full flex-col overflow-hidden bg-white">
            <div className="flex-none border-b border-gray-100 px-6 py-4">
                <div className="flex flex-wrap items-center justify-between gap-4">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-950">{text.pageTitle}</h1>
                        <p className="mt-1 text-sm text-gray-500">{text.pageDescription}</p>
                    </div>
                    <div className="flex items-center gap-2 rounded-lg bg-gray-100 p-1">
                        {(['draft', 'scheduled'] as PostMode[]).map((item) => (
                            <button
                                key={item}
                                type="button"
                                onClick={() => setMode(item)}
                                className={`rounded-md px-3 py-1.5 text-sm font-semibold ${mode === item
                                    ? 'bg-white text-gray-950 shadow-sm'
                                    : 'text-gray-600 hover:text-gray-950'
                                    }`}
                            >
                                {text.mode[item]}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-5">
                {mode === 'draft' ? (
                    <div className="grid gap-5 xl:grid-cols-[360px_minmax(0,1fr)_320px]">
                        <section className="min-w-0">
                            <div className="mb-3 flex items-center justify-between">
                                <h2 className="text-sm font-bold text-gray-950">{text.readyMedia}</h2>
                                <span className="rounded-full bg-gray-100 px-2 py-1 text-xs font-semibold text-gray-600">
                                    {text.itemCount(postingVideos.length)}
                                </span>
                            </div>
                            <VideoPickList
                                videos={postingVideos}
                                selectedId={selectedVideo?.id || null}
                                language={language}
                                onSelect={setSelectedVideoId}
                            />
                        </section>

                        <section className="min-w-0 rounded-lg border border-gray-100 bg-white p-4 shadow-sm">
                            <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_220px]">
                                <div className="min-w-0">
                                    <label htmlFor="caption" className="text-sm font-bold text-gray-950">
                                        {text.caption}
                                    </label>
                                    <textarea
                                        id="caption"
                                        value={caption}
                                        onChange={(event) => setCaption(event.target.value)}
                                        className="mt-2 min-h-48 w-full resize-none rounded-lg border border-gray-200 bg-white px-3 py-3 text-sm leading-6 text-gray-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                                        maxLength={2200}
                                    />
                                    <div className="mt-2 flex items-center justify-between gap-3 text-xs text-gray-500">
                                        <span>{caption.length}/2200 {text.characters}</span>
                                        <span>{caption.trim().split(/\s+/).filter(Boolean).length} {text.words}</span>
                                    </div>

                                    <div className="mt-5">
                                        <h3 className="text-sm font-bold text-gray-950">{text.publishingWindow}</h3>
                                        <div className="mt-2 grid grid-cols-2 gap-2">
                                            {(['schedule', 'now'] as PublishWindow[]).map((item) => (
                                                <button
                                                    key={item}
                                                    type="button"
                                                    onClick={() => setPublishWindow(item)}
                                                    className={`rounded-lg border px-3 py-2 text-sm font-semibold ${publishWindow === item
                                                        ? 'border-blue-500 bg-blue-50 text-blue-700'
                                                        : 'border-gray-200 text-gray-700 hover:bg-gray-50'
                                                        }`}
                                                >
                                                    {item === 'schedule' ? text.schedule : text.manualPublish}
                                                </button>
                                            ))}
                                        </div>
                                        <div className="mt-3 grid gap-3 sm:grid-cols-2">
                                            <label className="block">
                                                <span className="text-xs font-semibold text-gray-600">{text.date}</span>
                                                <input
                                                    type="date"
                                                    value={scheduleDate}
                                                    onChange={(event) => setScheduleDate(event.target.value)}
                                                    className="mt-1 w-full rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-900 outline-none focus:border-blue-500"
                                                    disabled={publishWindow !== 'schedule'}
                                                />
                                            </label>
                                            <label className="block">
                                                <span className="text-xs font-semibold text-gray-600">{text.time}</span>
                                                <input
                                                    type="time"
                                                    value={scheduleTime}
                                                    onChange={(event) => setScheduleTime(event.target.value)}
                                                    className="mt-1 w-full rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-900 outline-none focus:border-blue-500"
                                                    disabled={publishWindow !== 'schedule'}
                                                />
                                            </label>
                                        </div>
                                    </div>
                                </div>

                                <div>
                                    <h3 className="text-sm font-bold text-gray-950">{text.preview}</h3>
                                    <div className="mt-2 overflow-hidden rounded-lg border border-gray-100 bg-gray-950">
                                        <div className="relative aspect-[9/16] w-full bg-gray-900">
                                            {selectedVideo?.thumbnail ? (
                                                <Image
                                                    src={selectedVideo.thumbnail}
                                                    alt={selectedVideo.title}
                                                    fill
                                                    unoptimized
                                                    sizes="220px"
                                                    className="object-cover"
                                                />
                                            ) : (
                                                <div className="flex size-full items-center justify-center text-sm font-semibold text-gray-500">
                                                    {text.noMedia}
                                                </div>
                                            )}
                                        </div>
                                        <div className="bg-white p-3">
                                            <p className="line-clamp-2 text-sm font-semibold text-gray-950">
                                                {selectedVideo?.title || text.chooseVideo}
                                            </p>
                                            <p className="mt-2 line-clamp-3 text-xs leading-5 text-gray-600">
                                                {caption}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </section>

                        <aside className="min-w-0 space-y-5">
                            <section>
                                <h2 className="text-sm font-bold text-gray-950">{text.channels}</h2>
                                {isLoadingAccounts ? (
                                    <div className="mt-3 rounded-lg border border-dashed border-gray-200 bg-gray-50 p-4 text-center">
                                        <p className="text-xs text-gray-600">Loading connected accounts...</p>
                                    </div>
                                ) : accountsError ? (
                                    <div className="mt-3 rounded-lg border border-red-100 bg-red-50 p-4 text-center">
                                        <p className="text-xs font-semibold text-red-700">{accountsError}</p>
                                    </div>
                                ) : publishingAccounts.length === 0 ? (
                                    <div className="mt-3 rounded-lg border border-dashed border-gray-200 bg-gray-50 p-4 text-center">
                                        <p className="text-xs text-gray-600">
                                            {language === 'vi' 
                                                ? 'Kết nối tài khoản từ trang Tài khoản đăng bài để bắt đầu.'
                                                : 'Connect accounts from the Accounts page to start.'}
                                        </p>
                                    </div>
                                ) : (
                                    <div className="mt-2 grid gap-3">
                                        {(['tiktok', 'facebook', 'instagram', 'youtube'] as OAuthPlatform[]).map((platform) => {
                                            const accounts = accountsByPlatform[platform];

                                            if (accounts.length === 0) {
                                                return null;
                                            }

                                            return (
                                                <div key={platform} className="rounded-lg border border-gray-100 bg-white p-2">
                                                    <div className="mb-2 flex items-center justify-between px-1">
                                                        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ${PLATFORM_BADGES[platform]}`}>
                                                            {PLATFORM_LABELS[platform]}
                                                        </span>
                                                        <span className="text-[11px] font-semibold text-gray-400">
                                                            {accounts.length} account(s)
                                                        </span>
                                                    </div>
                                                    <div className="grid gap-2">
                                                        {accounts.map((account) => {
                                                            const checked = selectedAccountKeys.includes(account.key);
                                                            const scopes = splitScopes(account.scope);

                                                            return (
                                                                <label
                                                                    key={account.key}
                                                                    className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 ${checked
                                                                        ? 'border-blue-500 bg-blue-50'
                                                                        : 'border-gray-100 bg-white hover:bg-gray-50'
                                                                        }`}
                                                                >
                                                                    <input
                                                                        type="checkbox"
                                                                        checked={checked}
                                                                        onChange={() => toggleAccount(account.key)}
                                                                        className="mt-1 size-4 accent-blue-600"
                                                                    />
                                                                    <span className="min-w-0 flex-1">
                                                                        <span className="flex items-center justify-between gap-2">
                                                                            <span className="truncate text-sm font-semibold text-gray-950">
                                                                                {getAccountLabel(account)}
                                                                            </span>
                                                                            <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${STATUS_STYLES.connected}`}>
                                                                                {text.channelStatus.connected}
                                                                            </span>
                                                                        </span>
                                                                        <span className="mt-1 block truncate text-xs text-gray-500">
                                                                            {account.handle || account.displayName || account.key}
                                                                        </span>
                                                                        <span className="mt-1 block line-clamp-1 text-xs font-medium text-gray-600">
                                                                            {scopes.length > 0 ? scopes.join(', ') : 'scope unknown'}
                                                                        </span>
                                                                    </span>
                                                                </label>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                                {selectedAccounts.length > 0 && (
                                    <div className="mt-3 rounded-lg bg-gray-50 px-3 py-2">
                                        <p className="text-xs font-semibold text-gray-700">
                                            {selectedAccounts.length} selected account(s)
                                        </p>
                                        <p className="mt-1 line-clamp-2 text-xs text-gray-500">
                                            {selectedAccounts.map(getAccountLabel).join(', ')}
                                        </p>
                                    </div>
                                )}
                            </section>

                            <section>
                                <h2 className="text-sm font-bold text-gray-950">{text.reviewGates}</h2>
                                <div className="mt-2 grid gap-2">
                                    <label className="flex items-start gap-3 rounded-lg border border-gray-100 bg-white p-3">
                                        <input
                                            type="checkbox"
                                            checked={checks.rights}
                                            onChange={() => toggleCheck('rights')}
                                            className="mt-1 size-4 accent-blue-600"
                                        />
                                        <span>
                                            <span className="block text-sm font-semibold text-gray-950">{text.checks.rightsTitle}</span>
                                            <span className="block text-xs text-gray-500">{text.checks.rightsBody}</span>
                                        </span>
                                    </label>
                                    <label className="flex items-start gap-3 rounded-lg border border-gray-100 bg-white p-3">
                                        <input
                                            type="checkbox"
                                            checked={checks.review}
                                            onChange={() => toggleCheck('review')}
                                            className="mt-1 size-4 accent-blue-600"
                                        />
                                        <span>
                                            <span className="block text-sm font-semibold text-gray-950">{text.checks.reviewTitle}</span>
                                            <span className="block text-xs text-gray-500">{text.checks.reviewBody}</span>
                                        </span>
                                    </label>
                                    <label className="flex items-start gap-3 rounded-lg border border-gray-100 bg-white p-3">
                                        <input
                                            type="checkbox"
                                            checked={checks.api}
                                            onChange={() => toggleCheck('api')}
                                            className="mt-1 size-4 accent-blue-600"
                                        />
                                        <span>
                                            <span className="block text-sm font-semibold text-gray-950">{text.checks.apiTitle}</span>
                                            <span className="block text-xs text-gray-500">{text.checks.apiBody}</span>
                                        </span>
                                    </label>
                                </div>
                            </section>
                        </aside>
                    </div>
                ) : (
                    <div className="grid gap-3">
                        {scheduledPosts.length === 0 ? (
                            <div className="flex min-h-72 items-center justify-center rounded-lg border border-dashed border-gray-200 bg-gray-50 px-6 text-center">
                                <div>
                                    <p className="text-sm font-semibold text-gray-900">No queued posts yet</p>
                                    <p className="mt-1 text-sm text-gray-500">
                                        Create a draft and queue it for selected accounts.
                                    </p>
                                </div>
                            </div>
                        ) : (
                            scheduledPosts.map((post) => (
                                <div key={post.id} className="grid gap-4 rounded-lg border border-gray-100 bg-white p-4 shadow-sm md:grid-cols-[minmax(0,1fr)_180px_140px]">
                                    <div className="min-w-0">
                                        <h2 className="truncate text-sm font-bold text-gray-950">{post.videoTitle}</h2>
                                        <p className="mt-1 line-clamp-2 text-sm text-gray-500">{post.caption}</p>
                                        <div className="mt-2 grid gap-2">
                                            {post.targets.map((target) => (
                                                <div
                                                    key={target.id || target.accountKey}
                                                    className="flex min-w-0 flex-wrap items-center gap-2"
                                                >
                                                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ${PLATFORM_BADGES[target.platform]}`}>
                                                        {target.accountLabel || getPlatformLabel(target.platform)}
                                                    </span>
                                                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ${getPostStatusStyle(target.status)}`}>
                                                        {getPostStatusText(text, target.status)}
                                                    </span>
                                                    {target.lastError ? (
                                                        <span className="min-w-0 truncate rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-700 ring-1 ring-red-100">
                                                            {target.lastError}
                                                        </span>
                                                    ) : null}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                    <div>
                                        <p className="text-xs font-semibold uppercase text-gray-400">{text.publishTime}</p>
                                        <p className="mt-1 text-sm font-semibold text-gray-900">
                                            {post.scheduledAt
                                                ? new Date(post.scheduledAt).toLocaleString()
                                                : new Date(post.queuedAt).toLocaleString()}
                                        </p>
                                    </div>
                                    <div className="flex items-start justify-between gap-2 md:justify-end">
                                        <span className={`rounded-full px-2 py-1 text-xs font-semibold ring-1 ${getPostStatusStyle(post.status)}`}>
                                            {getPostStatusText(text, post.status)}
                                        </span>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                )}
            </div>

            {mode === 'draft' && (
                <div className="flex-none border-t border-gray-100 bg-white px-6 py-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="text-sm text-gray-500">
                            {queueMessage || (canCreate ? text.footerReady : text.footerBlocked)}
                        </div>
                        <div className="flex gap-2">
                            <button
                                type="button"
                                className="rounded-md border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
                            >
                                {text.saveDraft}
                            </button>
                            <button
                                type="button"
                                onClick={() => void queuePost()}
                                disabled={!canCreate}
                                className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
                            >
                                {isQueueing ? 'Queueing' : text.queuePost}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
