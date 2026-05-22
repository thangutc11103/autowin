'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import { useLanguageStore, type AppLanguage } from '@/store/language.store';
import { useVideoStore } from '@/store/video.store';
import type { Platform, Video } from '@/types/video';

type SelectedTab = 'selected' | 'upload' | 'posting';

interface UploadDraft {
    id: string;
    file: File;
    url: string;
    title: string;
    platform: Platform;
}

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

const TEXT = {
    vi: {
        title: 'Video đã chọn',
        description: 'Xem lại video tạm chọn, sau đó lưu video đã duyệt để chuẩn bị đăng bài.',
        selected: 'Đã chọn',
        upload: 'Tải lên',
        posting: 'Sẵn sàng đăng',
        clearSelected: 'Xóa mục đã chọn',
        clearUpload: 'Xóa bản tải lên',
        clearPosting: 'Xóa danh sách sẵn sàng',
        empty: {
            selected: 'Chưa có video trong danh sách tạm chọn.',
            upload: 'Chưa chọn tệp video nào.',
            posting: 'Chưa có video sẵn sàng để đăng.',
        },
        emptyHint: {
            selected: 'Bấm + Chọn ở trang Khám phá để thêm video vào đây.',
            upload: 'Chọn tệp video từ máy tính để thêm thẳng vào danh sách sẵn sàng đăng.',
            posting: 'Tick video trong tab Đã chọn, rồi lưu vào danh sách này.',
        },
        selectBadge: 'Chọn',
        uploadBadge: 'Tải lên',
        postBadge: 'Đăng',
        uploadTitle: 'Tải video thẳng vào danh sách Sẵn sàng đăng',
        uploadDescription: 'Chọn một hoặc nhiều tệp video từ máy tính này.',
        titleField: 'Tiêu đề',
        platformField: 'Nền tảng',
        remove: 'Xóa',
        uploading: 'Đang tải lên',
        addToReady: (count: number) => `Thêm ${count} video vào Sẵn sàng đăng`,
        noThumbnail: 'Không có ảnh',
        saved: 'Đã lưu',
        marked: (marked: number, unsaved: number) => `${marked} video được đánh dấu để lưu, ${unsaved} video chưa lưu.`,
        uncheckAll: 'Bỏ chọn tất cả',
        checkUnsaved: 'Chọn video chưa lưu',
        markedFooter: 'đã đánh dấu để đăng',
        save: 'Lưu',
        preparing: 'Đang chuẩn bị',
        localOnly: 'Chỉ local',
        r2Ready: 'R2 sẵn sàng',
        preparingBadge: 'Đang chuẩn bị',
        openR2: 'Mở file R2',
        openLocal: 'Mở file local',
        openFile: 'Mở file',
    },
    en: {
        title: 'Selected Videos',
        description: 'Review temporary selections, then save approved videos for posting.',
        selected: 'Selected',
        upload: 'Upload',
        posting: 'Ready to Post',
        clearSelected: 'Clear Selected',
        clearUpload: 'Clear Upload',
        clearPosting: 'Clear Ready',
        empty: {
            selected: 'No videos in the temporary selection.',
            upload: 'No upload files selected.',
            posting: 'No videos saved for posting yet.',
        },
        emptyHint: {
            selected: 'Use + Select on Discover videos to add them here.',
            upload: 'Choose video files to add them straight into Ready to Post.',
            posting: 'Tick videos in Selected, then save them to this list.',
        },
        selectBadge: 'Select',
        uploadBadge: 'Upload',
        postBadge: 'Post',
        uploadTitle: 'Upload video straight to Ready to Post',
        uploadDescription: 'Select one or more video files from this computer.',
        titleField: 'Title',
        platformField: 'Platform',
        remove: 'Remove',
        uploading: 'Uploading',
        addToReady: (count: number) => `Add ${count} to Ready to Post`,
        noThumbnail: 'No thumbnail',
        saved: 'Saved',
        marked: (marked: number, unsaved: number) => `${marked} marked for saving, ${unsaved} not saved yet.`,
        uncheckAll: 'Uncheck all',
        checkUnsaved: 'Check unsaved',
        markedFooter: 'marked for posting',
        save: 'Save',
        preparing: 'Preparing',
        localOnly: 'Local only',
        r2Ready: 'R2 ready',
        preparingBadge: 'Preparing',
        openR2: 'Open R2 file',
        openLocal: 'Open local file',
        openFile: 'Open file',
    },
};

function EmptyState({ tab, language }: { tab: SelectedTab; language: AppLanguage }) {
    const text = TEXT[language];
    const message = text.empty[tab];

    return (
        <div className="flex min-h-80 items-center justify-center rounded-lg border border-dashed border-gray-200 bg-white">
            <div className="px-6 text-center">
                <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-full bg-gray-50 text-sm font-semibold text-gray-400">
                    {tab === 'selected' ? text.selectBadge : tab === 'upload' ? text.uploadBadge : text.postBadge}
                </div>
                <h2 className="text-sm font-semibold text-gray-900">{message}</h2>
                <p className="mt-1 text-sm text-gray-500">
                    {text.emptyHint[tab]}
                </p>
            </div>
        </div>
    );
}

interface UploadPostingResponse {
    success?: boolean;
    uploadedVideos?: Video[];
    error?: string;
}

function formatBytes(bytes: number) {
    if (bytes < 1024 * 1024) {
        return `${Math.max(1, Math.round(bytes / 1024))} KB`;
    }

    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function UploadPanel({
    drafts,
    onPickFiles,
    onUpdateDraft,
    onRemoveDraft,
    onAddToReady,
    isUploading,
    language,
}: {
    drafts: UploadDraft[];
    onPickFiles: (files: FileList | null) => void;
    onUpdateDraft: (id: string, patch: Partial<Pick<UploadDraft, 'title' | 'platform'>>) => void;
    onRemoveDraft: (id: string) => void;
    onAddToReady: () => void;
    isUploading: boolean;
    language: AppLanguage;
}) {
    const text = TEXT[language];

    return (
        <div className="grid gap-4">
            <label className="flex min-h-48 cursor-pointer items-center justify-center rounded-lg border border-dashed border-gray-200 bg-white p-6 text-center hover:border-blue-300 hover:bg-blue-50/40">
                <input
                    type="file"
                    accept="video/*"
                    multiple
                    onChange={(event) => onPickFiles(event.target.files)}
                    className="sr-only"
                />
                <div>
                    <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-full bg-blue-50 text-sm font-bold text-blue-600">
                        MP4
                    </div>
                    <p className="text-sm font-semibold text-gray-950">{text.uploadTitle}</p>
                    <p className="mt-1 text-sm text-gray-500">{text.uploadDescription}</p>
                </div>
            </label>

            {drafts.length > 0 && (
                <>
                    <div className="grid gap-3">
                        {drafts.map((draft) => (
                            <div key={draft.id} className="grid gap-3 rounded-lg border border-gray-100 bg-white p-3 shadow-sm sm:grid-cols-[120px_minmax(0,1fr)] lg:grid-cols-[120px_minmax(0,1fr)_140px_auto]">
                                <video
                                    src={draft.url}
                                    className="aspect-video w-full rounded-md bg-gray-100 object-cover"
                                    controls
                                    muted
                                />
                                <div className="min-w-0">
                                    <label className="text-xs font-semibold uppercase text-gray-400">{text.titleField}</label>
                                    <input
                                        value={draft.title}
                                        onChange={(event) => onUpdateDraft(draft.id, { title: event.target.value })}
                                        className="mt-1 w-full rounded-md border border-gray-200 px-3 py-2 text-sm font-semibold text-gray-900 outline-none focus:border-blue-500"
                                    />
                                    <p className="mt-2 truncate text-xs text-gray-500">
                                        {draft.file.name} • {formatBytes(draft.file.size)}
                                    </p>
                                </div>
                                <div>
                                    <label className="text-xs font-semibold uppercase text-gray-400">{text.platformField}</label>
                                    <select
                                        value={draft.platform}
                                        onChange={(event) =>
                                            onUpdateDraft(draft.id, { platform: event.target.value as Platform })
                                        }
                                        className="mt-1 w-full rounded-md border border-gray-200 px-3 py-2 text-sm font-semibold text-gray-900 outline-none focus:border-blue-500"
                                    >
                                        <option value="tiktok">TikTok</option>
                                        <option value="youtube">YouTube</option>
                                        <option value="facebook">Facebook</option>
                                        <option value="instagram">Instagram</option>
                                    </select>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => onRemoveDraft(draft.id)}
                                    className="h-9 rounded-md bg-gray-100 px-3 text-xs font-semibold text-gray-700 hover:bg-red-50 hover:text-red-700"
                                >
                                    {text.remove}
                                </button>
                            </div>
                        ))}
                    </div>

                    <div className="flex justify-end">
                        <button
                            type="button"
                            onClick={onAddToReady}
                            disabled={isUploading}
                            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
                        >
                            {isUploading ? text.uploading : text.addToReady(drafts.length)}
                        </button>
                    </div>
                </>
            )}
        </div>
    );
}

function VideoThumb({ video, language }: { video: Video; language: AppLanguage }) {
    const text = TEXT[language];

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
                    {text.noThumbnail}
                </div>
            )}
        </a>
    );
}

function getStorageProvider(video: Video): string {
    const provider = video.rawPayload?.storageProvider;
    return typeof provider === 'string' ? provider : 'unknown';
}

function isRemoteMediaUrl(url?: string) {
    return Boolean(url && /^https?:\/\//i.test(url));
}

function getMediaReadiness(video: Video, language: AppLanguage) {
    const text = TEXT[language];
    const provider = getStorageProvider(video);
    const url = video.preparedLocalUrl || video.url;

    if (provider === 'cloudflare-r2' || isRemoteMediaUrl(video.preparedLocalUrl)) {
        return {
            label: text.r2Ready,
            linkLabel: text.openR2,
            badgeClass: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
            isReady: true,
            url,
        };
    }

    if (provider === 'local' || video.preparedLocalPath || video.preparedLocalUrl?.startsWith('/')) {
        return {
            label: text.localOnly,
            linkLabel: text.openLocal,
            badgeClass: 'bg-amber-50 text-amber-700 ring-amber-100',
            isReady: process.env.NODE_ENV !== 'production',
            url,
        };
    }

    return {
        label: text.preparingBadge,
        linkLabel: text.openFile,
        badgeClass: 'bg-gray-100 text-gray-600 ring-gray-200',
        isReady: false,
        url,
    };
}

function VideoRow({
    video,
    checked,
    alreadySaved,
    mode,
    onToggle,
    onRemove,
    language,
}: {
    video: Video;
    checked?: boolean;
    alreadySaved?: boolean;
    mode: SelectedTab;
    onToggle?: (id: string) => void;
    onRemove: (id: string) => void;
    language: AppLanguage;
}) {
    const text = TEXT[language];
    const readiness = getMediaReadiness(video, language);

    return (
        <div className="flex flex-col gap-3 rounded-lg border border-gray-100 bg-white p-3 shadow-sm sm:flex-row">
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

            <VideoThumb video={video} language={language} />

            <div className="min-w-0 flex-1">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ${PLATFORM_BADGES[video.platform]}`}>
                        {PLATFORM_LABELS[video.platform]}
                    </span>
                    {alreadySaved && mode === 'selected' && (
                        <span className="rounded-full bg-green-50 px-2 py-0.5 text-xs font-semibold text-green-700 ring-1 ring-green-100">
                            {text.saved}
                        </span>
                    )}
                </div>

                <h3 className="mb-1 line-clamp-2 text-sm font-semibold leading-snug text-gray-950">
                    {video.title}
                </h3>
                {video.description && (
                    <p className="line-clamp-1 text-xs text-gray-500">{video.description}</p>
                )}
                {mode === 'posting' && (
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ${readiness.badgeClass}`}>
                            {readiness.label}
                        </span>
                        {readiness.url ? (
                            <a
                                href={readiness.url}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex rounded-md bg-gray-100 px-2 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-200"
                            >
                                {readiness.linkLabel}
                            </a>
                        ) : null}
                    </div>
                )}
            </div>

            <div className="flex shrink-0 items-start">
                <button
                    onClick={() => onRemove(video.id)}
                    className="rounded-md bg-gray-100 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-red-50 hover:text-red-700"
                >
                    {text.remove}
                </button>
            </div>
        </div>
    );
}

export default function SelectedPage() {
    const language = useLanguageStore((state) => state.language);
    const text = TEXT[language];
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
    const [isUploading, setIsUploading] = useState(false);
    const [uploadDrafts, setUploadDrafts] = useState<UploadDraft[]>([]);
    const uploadDraftsRef = useRef<UploadDraft[]>([]);

    const unsavedSelectedVideos = useMemo(
        () => selectedVideos.filter((video) => !isVideoPosting(video.id)),
        [isVideoPosting, selectedVideos],
    );
    const activeVideos = activeTab === 'selected' ? selectedVideos : postingVideos;
    const readyPostingVideos = useMemo(
        () => postingVideos.filter((video) => getMediaReadiness(video, language).isReady),
        [language, postingVideos],
    );
    const activeItemCount =
        activeTab === 'upload' ? uploadDrafts.length : activeVideos.length;
    const checkedSet = new Set(checkedIds);
    const canSave = checkedIds.length > 0;

    useEffect(() => {
        uploadDraftsRef.current = uploadDrafts;
    }, [uploadDrafts]);

    useEffect(() => {
        return () => {
            uploadDraftsRef.current.forEach((draft) => URL.revokeObjectURL(draft.url));
        };
    }, []);

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

            const notReadyVideos = result.preparedVideos.filter(
                (video) => !getMediaReadiness(video, language).isReady,
            );

            if (notReadyVideos.length > 0) {
                throw new Error(
                    'Prepared media is not ready for production. Check R2 env on the web service and prepare again.',
                );
            }

            addPostingVideos(result.preparedVideos);
            setCheckedIds([]);
            setActiveTab('posting');

            const failureText = result.failures?.length
                ? ` ${result.failures.length} video(s) failed.`
                : '';
            setMessage(`Prepared and saved ${result.preparedVideos.length} video(s) to R2.${failureText}`);
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

        if (activeTab === 'upload') {
            uploadDrafts.forEach((draft) => URL.revokeObjectURL(draft.url));
            setUploadDrafts([]);
            setMessage('Upload drafts cleared.');
            return;
        }

        clearPosting();
        setMessage('Ready to Post list cleared.');
    };

    const pickUploadFiles = (files: FileList | null) => {
        const videoFiles = Array.from(files || []).filter((file) => file.type.startsWith('video/'));

        if (videoFiles.length === 0) {
            setMessage('Choose at least one video file.');
            return;
        }

        const drafts = videoFiles.map((file) => {
            const baseTitle = file.name.replace(/\.[^.]+$/, '').trim() || 'Uploaded video';

            return {
                id: `upload-${Date.now()}-${crypto.randomUUID()}`,
                file,
                url: URL.createObjectURL(file),
                title: baseTitle,
                platform: 'tiktok' as Platform,
            };
        });

        setUploadDrafts((current) => [...current, ...drafts]);
        setMessage(`${drafts.length} upload draft(s) ready to add.`);
    };

    const updateUploadDraft = (
        id: string,
        patch: Partial<Pick<UploadDraft, 'title' | 'platform'>>,
    ) => {
        setUploadDrafts((current) =>
            current.map((draft) => (draft.id === id ? { ...draft, ...patch } : draft)),
        );
    };

    const removeUploadDraft = (id: string) => {
        setUploadDrafts((current) => {
            const draft = current.find((item) => item.id === id);
            if (draft) URL.revokeObjectURL(draft.url);

            return current.filter((item) => item.id !== id);
        });
    };

    const addUploadsToReady = async () => {
        if (uploadDrafts.length === 0) {
            setMessage('Choose at least one video file before adding.');
            return;
        }

        setIsUploading(true);
        setMessage(`Uploading ${uploadDrafts.length} video(s)...`);

        try {
            const formData = new FormData();
            uploadDrafts.forEach((draft) => formData.append('files', draft.file));
            formData.append(
                'metadata',
                JSON.stringify(
                    uploadDrafts.map((draft) => ({
                        title: draft.title,
                        platform: draft.platform,
                    })),
                ),
            );

            const response = await fetch('/api/posting/upload', {
                method: 'POST',
                body: formData,
            });
            const result = (await response.json()) as UploadPostingResponse;

            if (!response.ok || result.error || !result.uploadedVideos?.length) {
                throw new Error(result.error || 'Failed to upload videos');
            }

            const notReadyVideos = result.uploadedVideos.filter(
                (video) => !getMediaReadiness(video, language).isReady,
            );

            if (notReadyVideos.length > 0) {
                throw new Error(
                    'Uploaded media is not ready for production. Check R2 env on the web service and upload again.',
                );
            }

            addPostingVideos(result.uploadedVideos);
            uploadDrafts.forEach((draft) => URL.revokeObjectURL(draft.url));
            setUploadDrafts([]);
            setActiveTab('posting');
            setMessage(`Uploaded and added ${result.uploadedVideos.length} video(s) to Ready to Post.`);
        } catch (error) {
            setMessage(`Error: ${error instanceof Error ? error.message : 'Failed to upload videos'}`);
        } finally {
            setIsUploading(false);
        }
    };

    return (
        <div className="flex h-full flex-col overflow-hidden bg-white">
            <div className="flex-none border-b border-gray-100 px-4 py-4 sm:px-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-950">{text.title}</h1>
                        <p className="mt-1 text-sm text-gray-500">
                            {text.description}
                        </p>
                    </div>

                    <button
                        onClick={clearCurrentTab}
                        disabled={activeItemCount === 0}
                        className="rounded-md bg-gray-100 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-red-50 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        {activeTab === 'selected' ? text.clearSelected : activeTab === 'upload' ? text.clearUpload : text.clearPosting}
                    </button>
                </div>

                <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
                    <button
                        onClick={() => setActiveTab('selected')}
                        className={`rounded-md px-3 py-2 text-sm font-semibold ${activeTab === 'selected'
                            ? 'bg-blue-600 text-white'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                            }`}
                    >
                        {text.selected} ({selectedVideos.length})
                    </button>
                    <button
                        onClick={() => setActiveTab('upload')}
                        className={`rounded-md px-3 py-2 text-sm font-semibold ${activeTab === 'upload'
                            ? 'bg-blue-600 text-white'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                            }`}
                    >
                        {text.upload} ({uploadDrafts.length})
                    </button>
                    <button
                        onClick={() => setActiveTab('posting')}
                        className={`rounded-md px-3 py-2 text-sm font-semibold ${activeTab === 'posting'
                            ? 'bg-blue-600 text-white'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                            }`}
                    >
                        {text.posting} ({readyPostingVideos.length})
                    </button>
                </div>

                {activeTab === 'selected' && selectedVideos.length > 0 && (
                    <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-gray-50 px-3 py-2">
                        <div className="text-xs font-medium text-gray-600">
                            {text.marked(checkedIds.length, unsavedSelectedVideos.length)}
                        </div>
                        <button
                            onClick={toggleAll}
                            disabled={unsavedSelectedVideos.length === 0}
                            className="rounded-md bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 ring-1 ring-gray-200 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            {checkedIds.length === unsavedSelectedVideos.length ? text.uncheckAll : text.checkUnsaved}
                        </button>
                    </div>
                )}

                {message && (
                    <div className="mt-3 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-medium text-blue-700">
                        {message}
                    </div>
                )}
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-5 pb-36 sm:px-6 md:pb-28">
                {activeTab === 'upload' ? (
                    <UploadPanel
                        drafts={uploadDrafts}
                        onPickFiles={pickUploadFiles}
                        onUpdateDraft={updateUploadDraft}
                        onRemoveDraft={removeUploadDraft}
                        onAddToReady={addUploadsToReady}
                        isUploading={isUploading}
                        language={language}
                    />
                ) : activeVideos.length === 0 ? (
                    <EmptyState tab={activeTab} language={language} />
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
                                language={language}
                            />
                        ))}
                    </div>
                )}
            </div>

            {activeTab === 'selected' && (
                <div className="pointer-events-none fixed inset-x-4 bottom-20 z-20 flex justify-end md:bottom-6 md:right-6 md:left-auto">
                    <div className="pointer-events-auto flex w-full items-center justify-between gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3 shadow-lg sm:w-auto">
                        <div className="text-right">
                            <div className="text-xs font-semibold text-gray-900">{checkedIds.length} video(s)</div>
                            <div className="text-[11px] text-gray-500">{text.markedFooter}</div>
                        </div>
                        <button
                            onClick={() => void saveForPosting()}
                            disabled={!canSave || isPreparing}
                            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
                        >
                            {isPreparing ? text.preparing : text.save}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
