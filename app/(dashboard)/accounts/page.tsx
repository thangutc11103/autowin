'use client';

import { useState } from 'react';
import { useLanguageStore, type AppLanguage } from '@/store/language.store';
import type { Platform } from '@/types/video';

type AccountStatus = 'connected' | 'setup' | 'review' | 'expired';

interface PlatformAccount {
    id: Platform;
    name: string;
    status: AccountStatus;
    handle: string;
    owner: string;
    destination: string;
    scopes: string[];
    lastSync: Record<AppLanguage, string>;
    note: Record<AppLanguage, string>;
}

const COPY = {
    vi: {
        title: 'Tài khoản đăng bài',
        description: 'Quản lý kết nối nền tảng, quyền API và nơi bài viết sẽ được đăng.',
        connectNew: 'Kết nối tài khoản',
        connected: 'Đã kết nối',
        needsSetup: 'Cần cài đặt',
        underReview: 'Đang duyệt',
        expired: 'Hết hạn',
        destination: 'Nơi đăng',
        owner: 'Chủ sở hữu',
        scopes: 'Quyền API',
        lastSync: 'Đồng bộ',
        connect: 'Kết nối',
        reconnect: 'Kết nối lại',
        manage: 'Quản lý',
        disconnect: 'Ngắt',
        authPlan: 'Luồng đăng nhập đề xuất',
        authSteps: [
            'Dùng OAuth/API chính thức của từng nền tảng.',
            'Lưu token mã hóa ở server, không lưu trong localStorage.',
            'Tách quyền đọc dữ liệu và quyền đăng bài.',
            'Bắt buộc người dùng chọn Page/Channel/Business Account trước khi đăng.',
        ],
        safetyTitle: 'Chặn rủi ro trước khi publish',
        safetyItems: [
            'Không dùng cookie để đăng bài.',
            'Không tự động đăng nếu token hết hạn hoặc app chưa được duyệt.',
            'Ghi log người duyệt, thời gian đăng và nền tảng nhận bài.',
        ],
        connectedCount: (count: number) => `${count} kết nối sẵn sàng`,
        setupCount: (count: number) => `${count} cần xử lý`,
    },
    en: {
        title: 'Publishing Accounts',
        description: 'Manage platform connections, API permissions, and publishing destinations.',
        connectNew: 'Connect account',
        connected: 'Connected',
        needsSetup: 'Needs setup',
        underReview: 'Under review',
        expired: 'Expired',
        destination: 'Destination',
        owner: 'Owner',
        scopes: 'API scopes',
        lastSync: 'Last sync',
        connect: 'Connect',
        reconnect: 'Reconnect',
        manage: 'Manage',
        disconnect: 'Disconnect',
        authPlan: 'Recommended login flow',
        authSteps: [
            'Use each platform’s official OAuth/API flow.',
            'Store encrypted tokens on the server, not in localStorage.',
            'Separate read-only permissions from publishing permissions.',
            'Require users to choose Page/Channel/Business Account before publishing.',
        ],
        safetyTitle: 'Risk gates before publish',
        safetyItems: [
            'Do not publish with cookies.',
            'Do not auto-publish if a token is expired or the app is not approved.',
            'Log reviewer, publish time, and receiving platform.',
        ],
        connectedCount: (count: number) => `${count} ready connection(s)`,
        setupCount: (count: number) => `${count} need attention`,
    },
} satisfies Record<AppLanguage, Record<string, unknown>>;

const ACCOUNTS: PlatformAccount[] = [
    {
        id: 'facebook',
        name: 'Facebook Pages',
        status: 'connected',
        handle: '@findvideo.vn',
        owner: 'Marketing Team',
        destination: 'Find Video Trending Page',
        scopes: ['pages_manage_posts', 'pages_read_engagement'],
        lastSync: { vi: '5 phút trước', en: '5 minutes ago' },
        note: { vi: 'Sẵn sàng đăng Reels qua Page.', en: 'Ready to publish Reels through Page.' },
    },
    {
        id: 'instagram',
        name: 'Instagram Business',
        status: 'setup',
        handle: '@findvideo.trending',
        owner: 'Creator Ops',
        destination: 'Business Account',
        scopes: ['instagram_content_publish', 'instagram_basic'],
        lastSync: { vi: 'Chưa kết nối', en: 'Not connected' },
        note: { vi: 'Cần liên kết Business Account với Facebook Page.', en: 'Link the Business Account to a Facebook Page.' },
    },
    {
        id: 'youtube',
        name: 'YouTube Shorts',
        status: 'review',
        handle: '@FindVideo',
        owner: 'Video Team',
        destination: 'Main channel',
        scopes: ['youtube.upload', 'youtube.readonly'],
        lastSync: { vi: '1 giờ trước', en: '1 hour ago' },
        note: { vi: 'Chờ audit quyền upload trước khi đăng tự động.', en: 'Upload permission audit should be cleared before automation.' },
    },
    {
        id: 'tiktok',
        name: 'TikTok Content Posting',
        status: 'expired',
        handle: '@findvideo',
        owner: 'Growth Team',
        destination: 'Creator account',
        scopes: ['video.publish', 'user.info.basic'],
        lastSync: { vi: 'Token hết hạn', en: 'Token expired' },
        note: { vi: 'Cần refresh OAuth trước khi đưa bài vào queue.', en: 'Refresh OAuth before queueing posts.' },
    },
];

const PLATFORM_BADGES: Record<Platform, string> = {
    tiktok: 'bg-rose-50 text-rose-700 ring-rose-100',
    douyin: 'bg-zinc-100 text-zinc-700 ring-zinc-200',
    facebook: 'bg-sky-50 text-sky-700 ring-sky-100',
    instagram: 'bg-amber-50 text-amber-700 ring-amber-100',
    youtube: 'bg-red-50 text-red-700 ring-red-100',
};

const STATUS_STYLES: Record<AccountStatus, string> = {
    connected: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
    setup: 'bg-gray-100 text-gray-700 ring-gray-200',
    review: 'bg-yellow-50 text-yellow-800 ring-yellow-100',
    expired: 'bg-red-50 text-red-700 ring-red-100',
};

function statusLabel(status: AccountStatus, language: AppLanguage) {
    const text = COPY[language];

    switch (status) {
        case 'connected':
            return text.connected;
        case 'setup':
            return text.needsSetup;
        case 'review':
            return text.underReview;
        case 'expired':
            return text.expired;
    }
}

function primaryAction(status: AccountStatus, language: AppLanguage) {
    const text = COPY[language];

    if (status === 'connected' || status === 'review') {
        return text.manage;
    }

    if (status === 'expired') {
        return text.reconnect;
    }

    return text.connect;
}

export default function AccountsPage() {
    const language = useLanguageStore((state) => state.language);
    const [activeAccountId, setActiveAccountId] = useState<Platform>('facebook');
    const text = COPY[language];
    const activeAccount = ACCOUNTS.find((account) => account.id === activeAccountId) || ACCOUNTS[0];
    const connectedCount = ACCOUNTS.filter((account) => account.status === 'connected').length;
    const attentionCount = ACCOUNTS.length - connectedCount;

    return (
        <div className="flex h-full flex-col overflow-hidden bg-white">
            <div className="flex-none border-b border-gray-100 px-6 py-4">
                <div className="flex flex-wrap items-center justify-between gap-4">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-950">{text.title}</h1>
                        <p className="mt-1 text-sm text-gray-500">{text.description}</p>
                    </div>
                    <button
                        type="button"
                        className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
                    >
                        {text.connectNew}
                    </button>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                    <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-100">
                        {text.connectedCount(connectedCount)}
                    </span>
                    <span className="rounded-full bg-yellow-50 px-3 py-1 text-xs font-semibold text-yellow-800 ring-1 ring-yellow-100">
                        {text.setupCount(attentionCount)}
                    </span>
                </div>
            </div>

            <div className="grid flex-1 gap-5 overflow-y-auto px-6 py-5 xl:grid-cols-[minmax(0,1fr)_340px]">
                <section className="min-w-0">
                    <div className="grid gap-3">
                        {ACCOUNTS.map((account) => {
                            const active = account.id === activeAccountId;

                            return (
                                <button
                                    key={account.id}
                                    type="button"
                                    onClick={() => setActiveAccountId(account.id)}
                                    className={`grid gap-4 rounded-lg border bg-white p-4 text-left shadow-sm transition-colors md:grid-cols-[minmax(0,1fr)_180px_130px] ${active
                                        ? 'border-blue-500 ring-2 ring-blue-100'
                                        : 'border-gray-100 hover:border-gray-200 hover:bg-gray-50'
                                        }`}
                                >
                                    <div className="min-w-0">
                                        <div className="mb-2 flex flex-wrap items-center gap-2">
                                            <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ${PLATFORM_BADGES[account.id]}`}>
                                                {account.name}
                                            </span>
                                            <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ${STATUS_STYLES[account.status]}`}>
                                                {statusLabel(account.status, language)}
                                            </span>
                                        </div>
                                        <h2 className="truncate text-sm font-bold text-gray-950">{account.handle}</h2>
                                        <p className="mt-1 line-clamp-2 text-sm text-gray-500">{account.note[language]}</p>
                                    </div>
                                    <div>
                                        <p className="text-xs font-semibold uppercase text-gray-400">{text.destination}</p>
                                        <p className="mt-1 text-sm font-semibold text-gray-900">{account.destination}</p>
                                    </div>
                                    <div className="flex items-start justify-end">
                                        <span className="rounded-md bg-gray-100 px-3 py-2 text-xs font-semibold text-gray-700">
                                            {primaryAction(account.status, language)}
                                        </span>
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                </section>

                <aside className="min-w-0 space-y-5">
                    <section className="rounded-lg border border-gray-100 bg-white p-4 shadow-sm">
                        <div className="mb-3 flex items-center justify-between gap-3">
                            <h2 className="text-sm font-bold text-gray-950">{activeAccount.name}</h2>
                            <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ${STATUS_STYLES[activeAccount.status]}`}>
                                {statusLabel(activeAccount.status, language)}
                            </span>
                        </div>
                        <div className="grid gap-3 text-sm">
                            <div>
                                <p className="text-xs font-semibold uppercase text-gray-400">{text.owner}</p>
                                <p className="mt-1 font-semibold text-gray-900">{activeAccount.owner}</p>
                            </div>
                            <div>
                                <p className="text-xs font-semibold uppercase text-gray-400">{text.lastSync}</p>
                                <p className="mt-1 font-semibold text-gray-900">{activeAccount.lastSync[language]}</p>
                            </div>
                            <div>
                                <p className="text-xs font-semibold uppercase text-gray-400">{text.scopes}</p>
                                <div className="mt-2 flex flex-wrap gap-2">
                                    {activeAccount.scopes.map((scope) => (
                                        <span key={scope} className="rounded-full bg-gray-100 px-2 py-1 text-xs font-semibold text-gray-700">
                                            {scope}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        </div>
                        <div className="mt-4 flex gap-2">
                            <button
                                type="button"
                                className="flex-1 rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700"
                            >
                                {primaryAction(activeAccount.status, language)}
                            </button>
                            <button
                                type="button"
                                className="rounded-md border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-red-50 hover:text-red-700"
                            >
                                {text.disconnect}
                            </button>
                        </div>
                    </section>

                    <section className="rounded-lg border border-gray-100 bg-white p-4 shadow-sm">
                        <h2 className="text-sm font-bold text-gray-950">{text.authPlan}</h2>
                        <div className="mt-3 grid gap-2">
                            {text.authSteps.map((step) => (
                                <div key={step} className="rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-700">
                                    {step}
                                </div>
                            ))}
                        </div>
                    </section>

                    <section className="rounded-lg border border-gray-100 bg-white p-4 shadow-sm">
                        <h2 className="text-sm font-bold text-gray-950">{text.safetyTitle}</h2>
                        <div className="mt-3 grid gap-2">
                            {text.safetyItems.map((item) => (
                                <label key={item} className="flex items-start gap-3 rounded-lg border border-gray-100 bg-white p-3">
                                    <input type="checkbox" checked readOnly className="mt-1 size-4 accent-blue-600" />
                                    <span className="text-sm text-gray-700">{item}</span>
                                </label>
                            ))}
                        </div>
                    </section>
                </aside>
            </div>
        </div>
    );
}
