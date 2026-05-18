'use client';

import { useMemo, useState } from 'react';
import Image from 'next/image';
import { useVideoStore } from '@/store/video.store';
import type { Platform, Video } from '@/types/video';

type SelectedTab = 'selected' | 'posting';

interface PreparePostingResponse {
    success?: boolean;
    preparedVideos?: Video[];
    failures?: Array<{
        id: string;
        title: string;
        error: string;
    }>;
    error?: string;
}

const PLATFORM_BADGES: Record<Platform, string> = {
    tiktok: 'bg-pink-50 text-pink-700 ring-pink-100',
    douyin: 'bg-purple-50 text-purple-700 ring-purple-100',
    facebook: 'bg-blue-50 text-blue-700 ring-blue-100',
    instagram: 'bg-orange-50 text-orange-700 ring-orange-100',
    youtube: 'bg-red-50 text-red-700 ring-red-100',
};

const PLATFORM_LABELS: Record<Platform, string> = {
    tiktok: 'TikTok',
    douyin: 'Douyin',
    facebook: 'Facebook',
    instagram: 'Instagram',
    youtube: 'YouTube',
};

function EmptyState({ tab }: { tab: SelectedTab }) {
    const message =
        tab === 'selected'
            ? 'No videos in the temporary selection.'
            : 'No videos saved for posting yet.';

    return (
        <div className="flex min-h-80 items-center justify-center rounded-lg border border-dashed border-gray-200 bg-white">
            <div className="px-6 text-center">
                <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-full bg-gray-50 text-sm font-semibold text-gray-400">
                    {tab === 'selected' ? 'Select' : 'Post'}
                </div>
                <h2 className="text-sm font-semibold text-gray-900">{message}</h2>
                <p className="mt-1 text-sm text-gray-500">
                    {tab === 'selected'
                        ? 'Use + Select on Discover videos to add them here.'
                        : 'Tick videos in Selected, then save them to this list.'}
                </p>
            </div>
        </div>
    );
}

function VideoThumb({ video }: { video: Video }) {
    return (
        <a
            href={video.url}
            target="_blank"
            rel="noreferrer"
            className="relative block aspect-[9/16] w-20 shrink-0 overflow-hidden rounded-md bg-gray-100"
        >
            {video.thumbnail ? (
                <Image
                    src={video.thumbnail}
                    alt={video.title}
                    fill
                    unoptimized
                    sizes="80px"
                    className="object-cover"
                />
            ) : (
                <div className="flex size-full items-center justify-center px-2 text-center text-[10px] font-medium text-gray-400">
                    No thumbnail
                </div>
            )}
        </a>
    );
}

function VideoRow({
    video,
    checked,
    alreadySaved,
    mode,
    onToggle,
    onRemove,
}: {
    video: Video;
    checked?: boolean;
    alreadySaved?: boolean;
    mode: SelectedTab;
    onToggle?: (id: string) => void;
    onRemove: (id: string) => void;
}) {
    return (
        <div className="flex gap-3 rounded-lg border border-gray-100 bg-white p-3 shadow-sm">
            {mode === 'selected' && (
                <div className="flex pt-1">
                    <input
                        type="checkbox"
                        checked={Boolean(checked)}
                        disabled={alreadySaved}
                        onChange={() => onToggle?.(video.id)}
                        className="size-4 cursor-pointer accent-blue-600 disabled:cursor-not-allowed disabled:opacity-40"
                        aria-label={`Mark ${video.title} for posting`}
                    />
                </div>
            )}

            <VideoThumb video={video} />

            <div className="min-w-0 flex-1">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ${PLATFORM_BADGES[video.platform]}`}>
                        {PLATFORM_LABELS[video.platform]}
                    </span>
                    {alreadySaved && mode === 'selected' && (
                        <span className="rounded-full bg-green-50 px-2 py-0.5 text-xs font-semibold text-green-700 ring-1 ring-green-100">
                            Saved
                        </span>
                    )}
                </div>

                <h3 className="mb-1 line-clamp-2 text-sm font-semibold leading-snug text-gray-950">
                    {video.title}
                </h3>
                {video.description && (
                    <p className="line-clamp-1 text-xs text-gray-500">{video.description}</p>
                )}
                {mode === 'posting' && video.preparedLocalUrl && (
                    <a
                        href={video.preparedLocalUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-2 inline-flex rounded-md bg-gray-100 px-2 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-200"
                    >
                        Open local file
                    </a>
                )}
            </div>

            <div className="flex shrink-0 items-start">
                <button
                    onClick={() => onRemove(video.id)}
                    className="rounded-md bg-gray-100 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-red-50 hover:text-red-700"
                >
                    Remove
                </button>
            </div>
        </div>
    );
}

export default function SelectedPage() {
    const selectedVideos = useVideoStore((state) => state.selectedVideos);
    const postingVideos = useVideoStore((state) => state.postingVideos);
    const removeSelected = useVideoStore((state) => state.removeSelected);
    const removePosting = useVideoStore((state) => state.removePosting);
    const clearSelected = useVideoStore((state) => state.clearSelected);
    const clearPosting = useVideoStore((state) => state.clearPosting);
    const addPostingVideos = useVideoStore((state) => state.addPostingVideos);
    const isVideoPosting = useVideoStore((state) => state.isVideoPosting);

    const [activeTab, setActiveTab] = useState<SelectedTab>('selected');
    const [checkedIds, setCheckedIds] = useState<string[]>([]);
    const [message, setMessage] = useState<string | null>(null);
    const [isPreparing, setIsPreparing] = useState(false);

    const unsavedSelectedVideos = useMemo(
        () => selectedVideos.filter((video) => !isVideoPosting(video.id)),
        [isVideoPosting, selectedVideos],
    );
    const activeVideos = activeTab === 'selected' ? selectedVideos : postingVideos;
    const checkedSet = new Set(checkedIds);
    const canSave = checkedIds.length > 0;

    const toggleChecked = (id: string) => {
        if (isVideoPosting(id)) {
            return;
        }

        setCheckedIds((prev) =>
            prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
        );
        setMessage(null);
    };

    const toggleAll = () => {
        setMessage(null);

        if (checkedIds.length === unsavedSelectedVideos.length) {
            setCheckedIds([]);
            return;
        }

        setCheckedIds(unsavedSelectedVideos.map((video) => video.id));
    };

    const saveForPosting = async () => {
        if (!canSave) {
            setMessage('Tick at least one video before saving.');
            return;
        }

        const videosToPrepare = selectedVideos.filter((video) => checkedSet.has(video.id));
        setIsPreparing(true);
        setMessage(`Preparing ${videosToPrepare.length} video(s) locally...`);

        try {
            const response = await fetch('/api/posting/prepare', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    videos: videosToPrepare,
                }),
            });
            const result = (await response.json()) as PreparePostingResponse;

            if (!response.ok || result.error || !result.preparedVideos?.length) {
                const failureText = result.failures?.length
                    ? `: ${result.failures
                        .slice(0, 3)
                        .map((failure) => `${failure.title}: ${failure.error}`)
                        .join(' | ')}`
                    : '';
                throw new Error(`${result.error || 'Failed to prepare selected videos'}${failureText}`);
            }

            addPostingVideos(result.preparedVideos);
            setCheckedIds([]);
            setActiveTab('posting');

            const failureText = result.failures?.length
                ? ` ${result.failures.length} video(s) failed.`
                : '';
            setMessage(`Prepared and saved ${result.preparedVideos.length} video(s).${failureText}`);
        } catch (error) {
            setMessage(`Error: ${error instanceof Error ? error.message : 'Failed to prepare videos'}`);
        } finally {
            setIsPreparing(false);
        }
    };

    const removeFromSelected = (id: string) => {
        removeSelected(id);
        setCheckedIds((prev) => prev.filter((item) => item !== id));
    };

    const clearCurrentTab = () => {
        if (activeTab === 'selected') {
            clearSelected();
            setCheckedIds([]);
            setMessage('Temporary selection cleared.');
            return;
        }

        clearPosting();
        setMessage('Ready to Post list cleared.');
    };

    return (
        <div className="flex h-full flex-col overflow-hidden bg-white">
            <div className="flex-none border-b border-gray-100 px-6 py-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-950">Selected Videos</h1>
                        <p className="mt-1 text-sm text-gray-500">
                            Review temporary selections, then save approved videos for posting.
                        </p>
                    </div>

                    <button
                        onClick={clearCurrentTab}
                        disabled={activeVideos.length === 0}
                        className="rounded-md bg-gray-100 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-red-50 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        Clear {activeTab === 'selected' ? 'Selected' : 'Ready'}
                    </button>
                </div>

                <div className="mt-4 flex items-center gap-2">
                    <button
                        onClick={() => setActiveTab('selected')}
                        className={`rounded-md px-3 py-2 text-sm font-semibold ${activeTab === 'selected'
                            ? 'bg-blue-600 text-white'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                            }`}
                    >
                        Selected ({selectedVideos.length})
                    </button>
                    <button
                        onClick={() => setActiveTab('posting')}
                        className={`rounded-md px-3 py-2 text-sm font-semibold ${activeTab === 'posting'
                            ? 'bg-blue-600 text-white'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                            }`}
                    >
                        Ready to Post ({postingVideos.length})
                    </button>
                </div>

                {activeTab === 'selected' && selectedVideos.length > 0 && (
                    <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-gray-50 px-3 py-2">
                        <div className="text-xs font-medium text-gray-600">
                            {checkedIds.length} marked for saving, {unsavedSelectedVideos.length} not saved yet.
                        </div>
                        <button
                            onClick={toggleAll}
                            disabled={unsavedSelectedVideos.length === 0}
                            className="rounded-md bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 ring-1 ring-gray-200 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            {checkedIds.length === unsavedSelectedVideos.length ? 'Uncheck all' : 'Check unsaved'}
                        </button>
                    </div>
                )}

                {message && (
                    <div className="mt-3 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-medium text-blue-700">
                        {message}
                    </div>
                )}
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-5 pb-28">
                {activeVideos.length === 0 ? (
                    <EmptyState tab={activeTab} />
                ) : (
                    <div className="grid gap-3">
                        {activeVideos.map((video) => (
                            <VideoRow
                                key={video.id}
                                video={video}
                                mode={activeTab}
                                checked={checkedSet.has(video.id)}
                                alreadySaved={isVideoPosting(video.id)}
                                onToggle={toggleChecked}
                                onRemove={activeTab === 'selected' ? removeFromSelected : removePosting}
                            />
                        ))}
                    </div>
                )}
            </div>

            {activeTab === 'selected' && (
                <div className="pointer-events-none fixed bottom-6 right-6 z-10">
                    <div className="pointer-events-auto flex items-center gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3 shadow-lg">
                        <div className="text-right">
                            <div className="text-xs font-semibold text-gray-900">{checkedIds.length} video(s)</div>
                            <div className="text-[11px] text-gray-500">marked for posting</div>
                        </div>
                        <button
                            onClick={() => void saveForPosting()}
                            disabled={!canSave || isPreparing}
                            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
                        >
                            {isPreparing ? 'Preparing' : 'Save'}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
