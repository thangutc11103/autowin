'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { PLATFORM_FILTER_CONFIGS } from '@/config/filter-config';
import { useLanguageStore, type AppLanguage } from '@/store/language.store';
import { useVideoStore } from '@/store/video.store';
import type { Platform, Video } from '@/types/video';

type WorkflowStatus = 'idle' | 'active' | 'ready' | 'warning' | 'success' | 'failed';
type PublishStatus = 'draft' | 'queued' | 'scheduled' | 'publishing' | 'published' | 'failed';

interface QueueInspectResponse {
  summary?: {
    byState?: {
      waiting?: number;
      active?: number;
      completed?: number;
      failed?: number;
    };
  };
  error?: string;
}

interface ScheduledPost {
  id: string;
  videoTitle: string;
  caption: string;
  status: PublishStatus;
  scheduledAt?: string | null;
  queuedAt: string;
  targets: Array<{
    platform: Exclude<Platform, 'douyin'>;
    accountLabel?: string | null;
    pageName?: string | null;
    status: PublishStatus;
    lastError?: string | null;
  }>;
}

interface ScheduledPostsResponse {
  posts?: ScheduledPost[];
  error?: string;
}

const PLATFORM_LABELS: Record<Platform, string> = {
  tiktok: 'TikTok',
  douyin: 'Douyin',
  facebook: 'Facebook',
  instagram: 'Instagram',
  youtube: 'YouTube',
};

const PLATFORM_BADGES: Record<Platform, string> = {
  tiktok: 'bg-pink-50 text-pink-700 ring-pink-100',
  douyin: 'bg-zinc-100 text-zinc-700 ring-zinc-200',
  facebook: 'bg-blue-50 text-blue-700 ring-blue-100',
  instagram: 'bg-orange-50 text-orange-700 ring-orange-100',
  youtube: 'bg-red-50 text-red-700 ring-red-100',
};

const STATUS_STYLES: Record<WorkflowStatus, string> = {
  idle: 'bg-gray-50 text-gray-600 ring-gray-200',
  active: 'bg-blue-50 text-blue-700 ring-blue-100',
  ready: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
  warning: 'bg-amber-50 text-amber-800 ring-amber-100',
  success: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
  failed: 'bg-red-50 text-red-700 ring-red-100',
};

const PUBLISH_STYLES: Record<PublishStatus, string> = {
  draft: 'bg-gray-50 text-gray-700 ring-gray-200',
  queued: 'bg-blue-50 text-blue-700 ring-blue-100',
  scheduled: 'bg-violet-50 text-violet-700 ring-violet-100',
  publishing: 'bg-amber-50 text-amber-800 ring-amber-100',
  published: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
  failed: 'bg-red-50 text-red-700 ring-red-100',
};

const COPY = {
  vi: {
    title: 'Bảng điều khiển AI video',
    description: 'Theo dõi toàn bộ quy trình từ tìm video, chọn nội dung, chuẩn bị media đến đăng bài đa nền tảng.',
    refresh: 'Làm mới trạng thái',
    overview: 'Tổng quan vận hành',
    recentResults: 'Kết quả tìm kiếm gần đây',
    selectedQueue: 'Danh sách đã chọn',
    editStatus: 'Trạng thái chỉnh sửa',
    publishStatus: 'Trạng thái đăng bài',
    platformFilters: 'Bộ lọc nền tảng',
    dataModel: 'Mô hình dữ liệu Supabase/Postgres',
    openDiscover: 'Mở Khám phá',
    openSelected: 'Mở Đã chọn',
    openAutomation: 'Mở Tự động',
    empty: 'Chưa có dữ liệu',
    noPosts: 'Chưa có bài đăng trong hàng đợi.',
    noVideos: 'Chưa có video trong phiên hiện tại.',
    selectedHint: 'Video được chọn tạm thời trước khi lưu sang danh sách sẵn sàng đăng.',
    editHint: 'Video có media R2/local được xem là sẵn sàng chỉnh sửa hoặc đăng.',
    scraped: 'Video đã tải',
    selected: 'Đã chọn',
    ready: 'Sẵn sàng đăng',
    activeJobs: 'Job đang chạy',
    waitingJobs: 'Job đang chờ',
    prepared: 'Đã chuẩn bị',
    sourceOnly: 'Chỉ có link nguồn',
    fields: 'trường lọc',
    currentBatch: 'Batch hiện tại',
    noBatch: 'Chưa có batch',
    records: 'bản ghi',
    status: {
      idle: 'Chưa chạy',
      active: 'Đang xử lý',
      ready: 'Sẵn sàng',
      warning: 'Cần xử lý',
      success: 'Hoàn tất',
      failed: 'Lỗi',
      draft: 'Bản nháp',
      queued: 'Trong hàng đợi',
      scheduled: 'Đã lên lịch',
      publishing: 'Đang đăng',
      published: 'Đã đăng',
    },
    tables: {
      scrapeRuns: 'Lưu từng lượt scrape, batch, platform, trạng thái và nguồn tìm kiếm.',
      scrapedVideos: 'Lưu video tìm được, thumbnail, URL nguồn, raw payload và media URL đã resolve.',
      scheduledPosts: 'Lưu bài đăng đã soạn, caption, lịch đăng, payload video và trạng thái tổng.',
      postTargets: 'Lưu từng target đăng bài theo tài khoản/page/platform và trạng thái publish riêng.',
    },
  },
  en: {
    title: 'AI Video Workflow Dashboard',
    description: 'Track the full workflow from video discovery and selection to media preparation and multi-platform publishing.',
    refresh: 'Refresh status',
    overview: 'Operations overview',
    recentResults: 'Recent search results',
    selectedQueue: 'Selected queue',
    editStatus: 'Edit status',
    publishStatus: 'Publish status',
    platformFilters: 'Platform filters',
    dataModel: 'Supabase/Postgres data model',
    openDiscover: 'Open Discover',
    openSelected: 'Open Selected',
    openAutomation: 'Open Automation',
    empty: 'No data yet',
    noPosts: 'No queued posts yet.',
    noVideos: 'No videos in the current session.',
    selectedHint: 'Temporary selections before saving approved videos to the posting queue.',
    editHint: 'Videos with R2/local media are treated as ready for editing or publishing.',
    scraped: 'Loaded videos',
    selected: 'Selected',
    ready: 'Ready to post',
    activeJobs: 'Active jobs',
    waitingJobs: 'Waiting jobs',
    prepared: 'Prepared',
    sourceOnly: 'Source only',
    fields: 'filter fields',
    currentBatch: 'Current batch',
    noBatch: 'No batch yet',
    records: 'records',
    status: {
      idle: 'Idle',
      active: 'Active',
      ready: 'Ready',
      warning: 'Needs work',
      success: 'Done',
      failed: 'Failed',
      draft: 'Draft',
      queued: 'Queued',
      scheduled: 'Scheduled',
      publishing: 'Publishing',
      published: 'Published',
    },
    tables: {
      scrapeRuns: 'Stores each scrape run, batch, platform, status, and source query.',
      scrapedVideos: 'Stores discovered videos, thumbnails, source URLs, raw payload, and resolved media URLs.',
      scheduledPosts: 'Stores composed posts, captions, schedule windows, video payloads, and aggregate status.',
      postTargets: 'Stores each account/page/platform target and its independent publish status.',
    },
  },
} satisfies Record<AppLanguage, {
  title: string;
  description: string;
  refresh: string;
  overview: string;
  recentResults: string;
  selectedQueue: string;
  editStatus: string;
  publishStatus: string;
  platformFilters: string;
  dataModel: string;
  openDiscover: string;
  openSelected: string;
  openAutomation: string;
  empty: string;
  noPosts: string;
  noVideos: string;
  selectedHint: string;
  editHint: string;
  scraped: string;
  selected: string;
  ready: string;
  activeJobs: string;
  waitingJobs: string;
  prepared: string;
  sourceOnly: string;
  fields: string;
  currentBatch: string;
  noBatch: string;
  records: string;
  status: Record<WorkflowStatus | PublishStatus, string>;
  tables: Record<string, string>;
}>;

function getPreparedCount(videos: Video[]) {
  return videos.filter((video) => video.preparedLocalUrl || video.mediaVideoUrl).length;
}

function StatCard({
  label,
  value,
  status,
  detail,
}: {
  label: string;
  value: string | number;
  status: WorkflowStatus;
  detail: string;
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-gray-500">{label}</p>
        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ${STATUS_STYLES[status]}`}>
          {detail}
        </span>
      </div>
      <p className="mt-4 text-3xl font-bold text-gray-950">{value}</p>
    </div>
  );
}

function Section({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-gray-200 bg-white shadow-sm">
      <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-4 py-3">
        <h2 className="text-base font-bold text-gray-950">{title}</h2>
        {action}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

function VideoList({ videos, emptyText }: { videos: Video[]; emptyText: string }) {
  if (videos.length === 0) {
    return <p className="rounded-lg border border-dashed border-gray-200 bg-gray-50 p-4 text-sm text-gray-500">{emptyText}</p>;
  }

  return (
    <div className="grid gap-3">
      {videos.slice(0, 5).map((video) => (
        <div key={video.id} className="flex min-w-0 items-center justify-between gap-3 rounded-lg border border-gray-100 p-3">
          <div className="min-w-0">
            <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ${PLATFORM_BADGES[video.platform]}`}>
              {PLATFORM_LABELS[video.platform]}
            </span>
            <p className="mt-2 truncate text-sm font-semibold text-gray-950">{video.title}</p>
            <p className="truncate text-xs text-gray-500">{video.url}</p>
          </div>
          <a href={video.url} target="_blank" rel="noreferrer" className="shrink-0 rounded-md bg-gray-100 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-200">
            Open
          </a>
        </div>
      ))}
    </div>
  );
}

export default function DashboardPage() {
  const language = useLanguageStore((state) => state.language);
  const text = COPY[language];
  const videos = useVideoStore((state) => state.videos);
  const selectedVideos = useVideoStore((state) => state.selectedVideos);
  const postingVideos = useVideoStore((state) => state.postingVideos);
  const currentBatchByPlatform = useVideoStore((state) => state.currentBatchByPlatform);
  const [queueSummary, setQueueSummary] = useState({ active: 0, waiting: 0 });
  const [posts, setPosts] = useState<ScheduledPost[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const preparedCount = useMemo(() => getPreparedCount(postingVideos), [postingVideos]);
  const sourceOnlyCount = Math.max(postingVideos.length - preparedCount, 0);

  const refreshStatus = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const [inspectResponse, postsResponse] = await Promise.all([
        fetch('/api/filter/inspect?limit=200&includeGroups=false', { cache: 'no-store' }),
        fetch('/api/posting/queue', { cache: 'no-store' }),
      ]);

      if (inspectResponse.ok) {
        const inspect = (await inspectResponse.json()) as QueueInspectResponse;
        setQueueSummary({
          active: inspect.summary?.byState?.active || 0,
          waiting: inspect.summary?.byState?.waiting || 0,
        });
      }

      if (postsResponse.ok) {
        const result = (await postsResponse.json()) as ScheduledPostsResponse;
        setPosts(result.posts || []);
      }
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void refreshStatus();
    }, 0);

    return () => window.clearTimeout(timeout);
  }, [refreshStatus]);

  const publishCounts = posts.reduce<Record<string, number>>((acc, post) => {
    acc[post.status] = (acc[post.status] || 0) + 1;
    return acc;
  }, {});

  return (
    <div className="h-full overflow-auto bg-gray-50">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-5 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-blue-700">SaaS workflow</p>
            <h1 className="mt-1 text-3xl font-bold text-gray-950">{text.title}</h1>
            <p className="mt-2 max-w-3xl text-sm text-gray-600">{text.description}</p>
          </div>
          <button
            type="button"
            onClick={() => void refreshStatus()}
            disabled={isRefreshing}
            className="inline-flex h-10 items-center justify-center rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700 disabled:bg-blue-300"
          >
            {isRefreshing ? '...' : text.refresh}
          </button>
        </header>

        <section aria-label={text.overview} className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label={text.scraped} value={videos.length} status={videos.length ? 'active' : 'idle'} detail={videos.length ? text.status.active : text.status.idle} />
          <StatCard label={text.selected} value={selectedVideos.length} status={selectedVideos.length ? 'ready' : 'idle'} detail={selectedVideos.length ? text.status.ready : text.status.idle} />
          <StatCard label={text.ready} value={postingVideos.length} status={postingVideos.length ? 'ready' : 'warning'} detail={`${preparedCount} ${text.prepared}`} />
          <StatCard label={text.publishStatus} value={posts.length} status={posts.length ? 'active' : 'idle'} detail={`${queueSummary.active} ${text.activeJobs}`} />
        </section>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
          <div className="grid gap-6">
            <Section
              title={text.recentResults}
              action={<Link href="/discover" className="text-sm font-semibold text-blue-700 hover:text-blue-800">{text.openDiscover}</Link>}
            >
              <VideoList videos={videos} emptyText={text.noVideos} />
            </Section>

            <div className="grid gap-6 lg:grid-cols-2">
              <Section
                title={text.selectedQueue}
                action={<Link href="/selected" className="text-sm font-semibold text-blue-700 hover:text-blue-800">{text.openSelected}</Link>}
              >
                <p className="mb-3 text-sm text-gray-500">{text.selectedHint}</p>
                <VideoList videos={selectedVideos} emptyText={text.empty} />
              </Section>

              <Section
                title={text.editStatus}
                action={<Link href="/automation" className="text-sm font-semibold text-blue-700 hover:text-blue-800">{text.openAutomation}</Link>}
              >
                <p className="mb-3 text-sm text-gray-500">{text.editHint}</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
                    <p className="text-xs font-semibold uppercase text-gray-500">{text.prepared}</p>
                    <p className="mt-2 text-2xl font-bold text-emerald-700">{preparedCount}</p>
                  </div>
                  <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
                    <p className="text-xs font-semibold uppercase text-gray-500">{text.sourceOnly}</p>
                    <p className="mt-2 text-2xl font-bold text-amber-700">{sourceOnlyCount}</p>
                  </div>
                </div>
              </Section>
            </div>

            <Section title={text.publishStatus}>
              {posts.length === 0 ? (
                <p className="rounded-lg border border-dashed border-gray-200 bg-gray-50 p-4 text-sm text-gray-500">{text.noPosts}</p>
              ) : (
                <div className="grid gap-3">
                  {posts.slice(0, 6).map((post) => (
                    <div key={post.id} className="rounded-lg border border-gray-100 p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="min-w-0 flex-1 truncate text-sm font-semibold text-gray-950">{post.videoTitle}</p>
                        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ${PUBLISH_STYLES[post.status] || PUBLISH_STYLES.queued}`}>
                          {text.status[post.status] || post.status}
                        </span>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {post.targets.map((target, index) => (
                          <span key={`${post.id}-${target.platform}-${index}`} className={`rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ${PUBLISH_STYLES[target.status] || PUBLISH_STYLES.queued}`}>
                            {PLATFORM_LABELS[target.platform]} · {text.status[target.status] || target.status}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {(['queued', 'scheduled', 'publishing', 'published'] as const).map((status) => (
                  <div key={status} className="rounded-lg bg-gray-50 p-3">
                    <p className="text-xs font-semibold uppercase text-gray-500">{text.status[status]}</p>
                    <p className="mt-2 text-xl font-bold text-gray-950">{publishCounts[status] || 0}</p>
                  </div>
                ))}
              </div>
            </Section>
          </div>

          <aside className="grid content-start gap-6">
            <Section title={text.platformFilters}>
              <div className="grid gap-3">
                {PLATFORM_FILTER_CONFIGS.map((config) => {
                  const fieldCount = config.sections.reduce((total, section) => total + section.fields.length, 0);
                  return (
                    <div key={config.platform} className="rounded-lg border border-gray-100 p-3">
                      <div className="flex items-center justify-between gap-3">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ${PLATFORM_BADGES[config.platform]}`}>
                          {config.label}
                        </span>
                        <span className="text-xs font-semibold text-gray-500">{fieldCount} {text.fields}</span>
                      </div>
                      <p className="mt-3 truncate text-xs text-gray-500">
                        {text.currentBatch}: {currentBatchByPlatform[config.platform] || text.noBatch}
                      </p>
                    </div>
                  );
                })}
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="rounded-lg bg-blue-50 p-3">
                  <p className="text-xs font-semibold uppercase text-blue-700">{text.activeJobs}</p>
                  <p className="mt-2 text-2xl font-bold text-blue-900">{queueSummary.active}</p>
                </div>
                <div className="rounded-lg bg-amber-50 p-3">
                  <p className="text-xs font-semibold uppercase text-amber-700">{text.waitingJobs}</p>
                  <p className="mt-2 text-2xl font-bold text-amber-900">{queueSummary.waiting}</p>
                </div>
              </div>
            </Section>

            <Section title={text.dataModel}>
              <div className="grid gap-3">
                {[
                  ['scrape_runs', text.tables.scrapeRuns],
                  ['scraped_videos', text.tables.scrapedVideos],
                  ['scheduled_posts', text.tables.scheduledPosts],
                  ['post_targets', text.tables.postTargets],
                ].map(([table, description]) => (
                  <div key={table} className="rounded-lg border border-gray-100 bg-gray-50 p-3">
                    <p className="font-mono text-sm font-bold text-gray-950">{table}</p>
                    <p className="mt-1 text-sm text-gray-600">{description}</p>
                  </div>
                ))}
              </div>
            </Section>
          </aside>
        </div>
      </div>
    </div>
  );
}
