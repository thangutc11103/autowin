'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useLanguageStore } from '@/store/language.store';
import type { Platform } from '@/types/video';

type OAuthPlatform = Exclude<Platform, 'douyin'>;

interface OAuthAccountDebug {
    key: string;
    platform: OAuthPlatform;
    handle?: string;
    label?: string;
    displayName?: string;
    expiresAt?: string;
    scope?: string;
    connectedAt: string;
    hasAccessToken: boolean;
    hasRefreshToken: boolean;
    accessTokenPreview: string | null;
    refreshTokenPreview: string | null;
}

interface OAuthDebugEvent {
    id: string;
    type: string;
    provider?: string;
    platform?: string;
    message: string;
    createdAt: string;
    details?: Record<string, unknown>;
}

interface ManagedPage {
    id: string;
    accountKey: string;
    platform: 'facebook' | 'instagram';
    pageId: string;
    pageName: string;
    instagramBusinessAccountId?: string;
    instagramUsername?: string;
    isDefault: boolean;
    syncedAt: string;
    hasPageAccessToken: boolean;
}

interface AccountsResponse {
    accounts?: OAuthAccountDebug[];
    debugEvents?: OAuthDebugEvent[];
    error?: string;
}

interface PagesResponse {
    pages?: ManagedPage[];
    error?: string;
}

const PLATFORM_LABELS: Record<OAuthPlatform, string> = {
    tiktok: 'TikTok',
    facebook: 'Facebook',
    instagram: 'Instagram',
    youtube: 'YouTube',
};

const PLATFORM_STYLES: Record<OAuthPlatform, string> = {
    tiktok: 'bg-rose-50 text-rose-700 ring-rose-100',
    facebook: 'bg-sky-50 text-sky-700 ring-sky-100',
    instagram: 'bg-amber-50 text-amber-700 ring-amber-100',
    youtube: 'bg-red-50 text-red-700 ring-red-100',
};

const CONNECT_LINKS: Array<{
    platform: OAuthPlatform;
    href: string;
}> = [
    { platform: 'tiktok', href: '/api/auth/tiktok' },
    { platform: 'facebook', href: '/api/auth/meta' },
    { platform: 'instagram', href: '/api/auth/meta' },
    { platform: 'youtube', href: '/api/auth/youtube' },
];

function formatDate(value?: string) {
    if (!value) return 'Unknown';

    return new Date(value).toLocaleString();
}

function splitScopes(scope?: string) {
    return scope ? scope.split(/[,\s]+/).filter(Boolean) : [];
}

function displayAccountName(account: OAuthAccountDebug) {
    return (
        account.label?.trim() ||
        account.displayName?.trim() ||
        account.handle?.trim() ||
        `${PLATFORM_LABELS[account.platform]} account`
    );
}

function groupAccounts(accounts: OAuthAccountDebug[]) {
    return accounts.reduce<Record<OAuthPlatform, OAuthAccountDebug[]>>(
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
    );
}

export default function AccountsPage() {
    const language = useLanguageStore((state) => state.language);
    const [accounts, setAccounts] = useState<OAuthAccountDebug[]>([]);
    const [debugEvents, setDebugEvents] = useState<OAuthDebugEvent[]>([]);
    const [activeKey, setActiveKey] = useState<string | null>(null);
    const [draftLabels, setDraftLabels] = useState<Record<string, string>>({});
    const [managedPages, setManagedPages] = useState<ManagedPage[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSavingKey, setIsSavingKey] = useState<string | null>(null);
    const [isSyncingPages, setIsSyncingPages] = useState(false);
    const [message, setMessage] = useState<string | null>(null);

    const groupedAccounts = useMemo(() => groupAccounts(accounts), [accounts]);
    const activeAccount =
        accounts.find((account) => account.key === activeKey) || accounts[0] || null;
    const activePages = activeAccount
        ? managedPages.filter((page) => page.accountKey === activeAccount.key)
        : [];
    const connectedPlatforms = CONNECT_LINKS.filter(
        (item) => groupedAccounts[item.platform].length > 0,
    ).length;

    async function loadAccounts() {
        setIsLoading(true);
        setMessage(null);

        try {
            const response = await fetch('/api/auth/accounts', { cache: 'no-store' });
            const data = (await response.json()) as AccountsResponse;

            if (!response.ok) {
                throw new Error(data.error || 'Failed to load OAuth accounts');
            }

            const nextAccounts = data.accounts || [];
            setAccounts(nextAccounts);
            setDebugEvents(data.debugEvents || []);
            setDraftLabels(
                Object.fromEntries(
                    nextAccounts.map((account) => [
                        account.key,
                        account.label || account.displayName || account.handle || '',
                    ]),
                ),
            );
            setActiveKey((current) =>
                current && nextAccounts.some((account) => account.key === current)
                    ? current
                    : nextAccounts[0]?.key || null,
            );
            await loadPages();
        } catch (error) {
            setMessage(error instanceof Error ? error.message : 'Failed to load OAuth accounts');
        } finally {
            setIsLoading(false);
        }
    }

    async function loadPages(accountKey?: string) {
        const query = accountKey ? `?accountKey=${encodeURIComponent(accountKey)}` : '';
        const response = await fetch(`/api/auth/accounts/pages${query}`, { cache: 'no-store' });
        const data = (await response.json()) as PagesResponse;

        if (!response.ok) {
            throw new Error(data.error || 'Failed to load pages');
        }

        setManagedPages((current) => {
            if (!accountKey) return data.pages || [];
            const otherPages = current.filter((page) => page.accountKey !== accountKey);
            return [...otherPages, ...(data.pages || [])];
        });
    }

    useEffect(() => {
        let cancelled = false;

        async function loadInitialAccounts() {
            try {
                const response = await fetch('/api/auth/accounts', { cache: 'no-store' });
                const data = (await response.json()) as AccountsResponse;

                if (!response.ok) {
                    throw new Error(data.error || 'Failed to load OAuth accounts');
                }

                if (cancelled) return;

                const nextAccounts = data.accounts || [];
                setAccounts(nextAccounts);
                setDebugEvents(data.debugEvents || []);
                setDraftLabels(
                    Object.fromEntries(
                        nextAccounts.map((account) => [
                            account.key,
                            account.label || account.displayName || account.handle || '',
                        ]),
                    ),
                );
                setActiveKey(nextAccounts[0]?.key || null);
                void loadPages().catch((error) => {
                    setMessage(error instanceof Error ? error.message : 'Failed to load pages');
                });
            } catch (error) {
                if (!cancelled) {
                    setMessage(error instanceof Error ? error.message : 'Failed to load OAuth accounts');
                }
            } finally {
                if (!cancelled) {
                    setIsLoading(false);
                }
            }
        }

        void loadInitialAccounts();

        return () => {
            cancelled = true;
        };
    }, []);

    async function saveLabel(account: OAuthAccountDebug) {
        setIsSavingKey(account.key);
        setMessage(null);

        try {
            const response = await fetch('/api/auth/accounts', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    key: account.key,
                    label: draftLabels[account.key] || null,
                }),
            });
            const data = (await response.json()) as { error?: string };

            if (!response.ok) {
                throw new Error(data.error || 'Failed to save account name');
            }

            await loadAccounts();
            setMessage('Account name saved.');
        } catch (error) {
            setMessage(error instanceof Error ? error.message : 'Failed to save account name');
        } finally {
            setIsSavingKey(null);
        }
    }

    async function disconnectAccount(account: OAuthAccountDebug) {
        setIsSavingKey(account.key);
        setMessage(null);

        try {
            const response = await fetch(
                `/api/auth/accounts?key=${encodeURIComponent(account.key)}`,
                { method: 'DELETE' },
            );
            const data = (await response.json()) as { error?: string };

            if (!response.ok) {
                throw new Error(data.error || 'Failed to disconnect account');
            }

            await loadAccounts();
            setMessage('Account disconnected.');
        } catch (error) {
            setMessage(error instanceof Error ? error.message : 'Failed to disconnect account');
        } finally {
            setIsSavingKey(null);
        }
    }

    async function syncPages(account: OAuthAccountDebug) {
        setIsSyncingPages(true);
        setMessage(null);

        try {
            const response = await fetch('/api/auth/accounts/pages', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ accountKey: account.key }),
            });
            const data = (await response.json()) as PagesResponse;

            if (!response.ok) {
                throw new Error(data.error || 'Failed to sync pages');
            }

            await loadPages(account.key);
            setMessage(`Synced ${data.pages?.length || 0} page target(s).`);
        } catch (error) {
            setMessage(error instanceof Error ? error.message : 'Failed to sync pages');
        } finally {
            setIsSyncingPages(false);
        }
    }

    async function setDefaultPage(page: ManagedPage) {
        setMessage(null);

        try {
            const response = await fetch('/api/auth/accounts/pages', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    accountKey: page.accountKey,
                    pageRecordId: page.id,
                }),
            });
            const data = (await response.json()) as PagesResponse;

            if (!response.ok) {
                throw new Error(data.error || 'Failed to set default page');
            }

            await loadPages(page.accountKey);
            setMessage('Default page updated.');
        } catch (error) {
            setMessage(error instanceof Error ? error.message : 'Failed to set default page');
        }
    }

    return (
        <div className="flex h-full flex-col overflow-hidden bg-white">
            <div className="flex-none border-b border-gray-100 px-6 py-4">
                <div className="flex flex-wrap items-center justify-between gap-4">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-950">
                            {language === 'vi' ? 'Tai khoan dang bai' : 'Publishing Accounts'}
                        </h1>
                        <p className="mt-1 text-sm text-gray-500">
                            {language === 'vi'
                                ? 'Ket noi nhieu tai khoan tren moi nen tang va dat ten de phan biet.'
                                : 'Connect multiple accounts per platform and name them for clarity.'}
                        </p>
                    </div>

                    <div className="flex flex-wrap gap-2">
                        {CONNECT_LINKS.map((item) => (
                            <Link
                                key={item.platform}
                                href={item.href}
                                prefetch={false}
                                className="rounded-md bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700"
                            >
                                Add {PLATFORM_LABELS[item.platform]}
                            </Link>
                        ))}
                    </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                    <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-100">
                        {accounts.length} account(s)
                    </span>
                    <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700 ring-1 ring-blue-100">
                        {connectedPlatforms} platform(s)
                    </span>
                    <button
                        type="button"
                        onClick={() => void loadAccounts()}
                        className="rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-700 ring-1 ring-gray-200 hover:bg-gray-200"
                    >
                        Refresh
                    </button>
                    {message ? (
                        <span className="rounded-full bg-yellow-50 px-3 py-1 text-xs font-semibold text-yellow-800 ring-1 ring-yellow-100">
                            {message}
                        </span>
                    ) : null}
                </div>
            </div>

            <div className="grid flex-1 gap-5 overflow-y-auto px-6 py-5 xl:grid-cols-[minmax(0,1fr)_360px]">
                <section className="min-w-0">
                    {isLoading ? (
                        <div className="flex min-h-96 items-center justify-center rounded-lg border border-dashed border-gray-200">
                            <p className="text-sm font-semibold text-gray-500">Loading accounts...</p>
                        </div>
                    ) : accounts.length === 0 ? (
                        <div className="flex min-h-96 items-center justify-center rounded-lg border border-dashed border-gray-200">
                            <div className="max-w-sm px-6 text-center">
                                <h2 className="text-sm font-semibold text-gray-900">No connected accounts</h2>
                                <p className="mt-1 text-sm text-gray-500">
                                    Add accounts above. You can connect more than one account for the same platform.
                                </p>
                            </div>
                        </div>
                    ) : (
                        <div className="grid gap-5">
                            {CONNECT_LINKS.map((item) => {
                                const platformAccounts = groupedAccounts[item.platform];

                                return (
                                    <section key={item.platform} className="min-w-0">
                                        <div className="mb-2 flex items-center justify-between gap-3">
                                            <div className="flex items-center gap-2">
                                                <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ${PLATFORM_STYLES[item.platform]}`}>
                                                    {PLATFORM_LABELS[item.platform]}
                                                </span>
                                                <span className="text-xs font-semibold text-gray-400">
                                                    {platformAccounts.length} account(s)
                                                </span>
                                            </div>
                                            <Link
                                                href={item.href}
                                                prefetch={false}
                                                className="rounded-md bg-gray-100 px-2 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-200"
                                            >
                                                Add account
                                            </Link>
                                        </div>

                                        {platformAccounts.length === 0 ? (
                                            <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 px-4 py-5 text-sm text-gray-500">
                                                No {PLATFORM_LABELS[item.platform]} account connected.
                                            </div>
                                        ) : (
                                            <div className="grid gap-3">
                                                {platformAccounts.map((account) => {
                                                    const active = activeAccount?.key === account.key;
                                                    const scopes = splitScopes(account.scope);

                                                    return (
                                                        <button
                                                            key={account.key}
                                                            type="button"
                                                            onClick={() => setActiveKey(account.key)}
                                                            className={`grid gap-3 rounded-lg border bg-white p-4 text-left shadow-sm transition-colors md:grid-cols-[minmax(0,1fr)_170px_120px] ${active
                                                                ? 'border-blue-500 ring-2 ring-blue-100'
                                                                : 'border-gray-100 hover:border-gray-200 hover:bg-gray-50'
                                                                }`}
                                                        >
                                                            <div className="min-w-0">
                                                                <div className="mb-2 flex flex-wrap items-center gap-2">
                                                                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ${PLATFORM_STYLES[account.platform]}`}>
                                                                        {PLATFORM_LABELS[account.platform]}
                                                                    </span>
                                                                    <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-100">
                                                                        Connected
                                                                    </span>
                                                                </div>
                                                                <h2 className="truncate text-sm font-bold text-gray-950">
                                                                    {displayAccountName(account)}
                                                                </h2>
                                                                <p className="mt-1 truncate text-xs text-gray-500">
                                                                    {account.handle || account.displayName || account.key}
                                                                </p>
                                                            </div>
                                                            <div>
                                                                <p className="text-xs font-semibold uppercase text-gray-400">Scopes</p>
                                                                <p className="mt-1 line-clamp-2 text-xs font-semibold text-gray-700">
                                                                    {scopes.length > 0 ? scopes.join(', ') : 'unknown'}
                                                                </p>
                                                            </div>
                                                            <div className="text-right">
                                                                <p className="text-xs font-semibold uppercase text-gray-400">Connected</p>
                                                                <p className="mt-1 text-xs font-semibold text-gray-700">
                                                                    {formatDate(account.connectedAt)}
                                                                </p>
                                                            </div>
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </section>
                                );
                            })}
                        </div>
                    )}
                </section>

                <aside className="min-w-0 space-y-5">
                    {activeAccount ? (
                        <section className="rounded-lg border border-gray-100 bg-white p-4 shadow-sm">
                            <div className="mb-3 flex items-center justify-between gap-3">
                                <h2 className="text-sm font-bold text-gray-950">Account details</h2>
                                <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ${PLATFORM_STYLES[activeAccount.platform]}`}>
                                    {PLATFORM_LABELS[activeAccount.platform]}
                                </span>
                            </div>

                            <label className="text-xs font-semibold uppercase text-gray-400">Display name</label>
                            <input
                                value={draftLabels[activeAccount.key] || ''}
                                onChange={(event) =>
                                    setDraftLabels((current) => ({
                                        ...current,
                                        [activeAccount.key]: event.target.value,
                                    }))
                                }
                                placeholder="Example: TikTok main, YouTube backup"
                                className="mt-1 w-full rounded-md border border-gray-200 px-3 py-2 text-sm font-semibold text-gray-900 outline-none focus:border-blue-500"
                            />
                            <p className="mt-2 text-xs text-gray-500">
                                This name is only for your dashboard, so you can tell accounts apart.
                            </p>

                            <div className="mt-4 grid gap-3 text-sm">
                                <div>
                                    <p className="text-xs font-semibold uppercase text-gray-400">Provider identity</p>
                                    <p className="mt-1 break-all font-semibold text-gray-900">
                                        {activeAccount.handle || activeAccount.displayName || activeAccount.key}
                                    </p>
                                </div>
                                <div>
                                    <p className="text-xs font-semibold uppercase text-gray-400">Connected at</p>
                                    <p className="mt-1 font-semibold text-gray-900">
                                        {formatDate(activeAccount.connectedAt)}
                                    </p>
                                </div>
                                <div>
                                    <p className="text-xs font-semibold uppercase text-gray-400">Token</p>
                                    <p className="mt-1 text-xs font-semibold text-gray-700">
                                        access {activeAccount.accessTokenPreview || 'none'} · refresh{' '}
                                        {activeAccount.hasRefreshToken ? activeAccount.refreshTokenPreview || 'yes' : 'none'}
                                    </p>
                                </div>
                                <div>
                                    <p className="text-xs font-semibold uppercase text-gray-400">Scopes</p>
                                    <div className="mt-2 flex flex-wrap gap-2">
                                        {splitScopes(activeAccount.scope).map((scope) => (
                                            <span key={scope} className="rounded-full bg-gray-100 px-2 py-1 text-xs font-semibold text-gray-700">
                                                {scope}
                                            </span>
                                        ))}
                                        {splitScopes(activeAccount.scope).length === 0 ? (
                                            <span className="text-xs text-gray-500">Unknown</span>
                                        ) : null}
                                    </div>
                                </div>
                            </div>

                            {(activeAccount.platform === 'facebook' || activeAccount.platform === 'instagram') && (
                                <div className="mt-5 rounded-lg border border-gray-100 bg-gray-50 p-3">
                                    <div className="flex items-center justify-between gap-3">
                                        <div>
                                            <h3 className="text-sm font-bold text-gray-950">Page targets</h3>
                                            <p className="mt-1 text-xs text-gray-500">
                                                Sync Pages and choose the default publishing target.
                                            </p>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => void syncPages(activeAccount)}
                                            disabled={isSyncingPages}
                                            className="rounded-md bg-white px-3 py-2 text-xs font-semibold text-gray-700 ring-1 ring-gray-200 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
                                        >
                                            {isSyncingPages ? 'Syncing' : 'Sync pages'}
                                        </button>
                                    </div>

                                    <div className="mt-3 grid gap-2">
                                        {activePages.length === 0 ? (
                                            <p className="rounded-lg border border-dashed border-gray-200 bg-white px-3 py-2 text-xs text-gray-500">
                                                No Pages synced yet.
                                            </p>
                                        ) : (
                                            activePages.map((page) => (
                                                <div key={page.id} className="rounded-lg border border-gray-100 bg-white p-3">
                                                    <div className="flex items-start justify-between gap-3">
                                                        <div className="min-w-0">
                                                            <div className="mb-1 flex flex-wrap items-center gap-2">
                                                                <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${PLATFORM_STYLES[page.platform]}`}>
                                                                    {PLATFORM_LABELS[page.platform]}
                                                                </span>
                                                                {page.isDefault ? (
                                                                    <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 ring-1 ring-emerald-100">
                                                                        Default
                                                                    </span>
                                                                ) : null}
                                                            </div>
                                                            <p className="truncate text-sm font-semibold text-gray-950">{page.pageName}</p>
                                                            <p className="mt-1 truncate text-xs text-gray-500">
                                                                Page ID: {page.pageId}
                                                            </p>
                                                            {page.instagramBusinessAccountId ? (
                                                                <p className="mt-1 truncate text-xs text-gray-500">
                                                                    IG: {page.instagramUsername || page.instagramBusinessAccountId}
                                                                </p>
                                                            ) : null}
                                                        </div>
                                                        <button
                                                            type="button"
                                                            onClick={() => void setDefaultPage(page)}
                                                            disabled={page.isDefault}
                                                            className="shrink-0 rounded-md bg-gray-100 px-2 py-1 text-xs font-semibold text-gray-700 hover:bg-blue-50 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                                                        >
                                                            Set default
                                                        </button>
                                                    </div>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                </div>
                            )}

                            <div className="mt-4 flex gap-2">
                                <button
                                    type="button"
                                    onClick={() => void saveLabel(activeAccount)}
                                    disabled={isSavingKey === activeAccount.key}
                                    className="flex-1 rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
                                >
                                    {isSavingKey === activeAccount.key ? 'Saving' : 'Save name'}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => void disconnectAccount(activeAccount)}
                                    disabled={isSavingKey === activeAccount.key}
                                    className="rounded-md border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-red-50 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                    Disconnect
                                </button>
                            </div>
                        </section>
                    ) : (
                        <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 p-4 text-center">
                            <p className="text-sm text-gray-600">Connect an account to see details.</p>
                        </div>
                    )}

                    <section className="rounded-lg border border-gray-100 bg-white p-4 shadow-sm">
                        <div className="mb-3 flex items-center justify-between gap-3">
                            <h2 className="text-sm font-bold text-gray-950">OAuth debug</h2>
                            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-700">
                                {debugEvents.length} event(s)
                            </span>
                        </div>
                        <div className="grid max-h-96 gap-2 overflow-y-auto">
                            {debugEvents.length === 0 ? (
                                <p className="rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-500">
                                    No OAuth events yet.
                                </p>
                            ) : (
                                debugEvents.slice(0, 10).map((event) => (
                                    <div key={event.id} className="rounded-lg border border-gray-100 bg-white px-3 py-2 text-xs">
                                        <div className="flex items-center justify-between gap-2">
                                            <span className="font-semibold text-gray-900">{event.type}</span>
                                            <span className="text-gray-400">{formatDate(event.createdAt)}</span>
                                        </div>
                                        <p className="mt-1 text-gray-600">{event.message}</p>
                                    </div>
                                ))
                            )}
                        </div>
                    </section>
                </aside>
            </div>
        </div>
    );
}
