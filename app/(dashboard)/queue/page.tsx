'use client';

import { useEffect, useMemo, useState } from 'react';
import { useLanguageStore } from '@/store/language.store';

type StopResponse = {
  success?: boolean;
  error?: string;
  message?: string;
};

type QueueCleanupScope = 'finished' | 'waiting' | 'all-non-active';

type InspectJobData = {
  id: string;
  state: string;
  progress: number | Record<string, unknown>;
  attempts: number;
  maxAttempts: number;
  createdAt: string;
  processedOn: string | null;
  data?: {
    title?: string;
    platform?: string;
    batchId?: string;
  };
};

type InspectResponse = {
  success?: boolean;
  error?: string;
  summary?: {
    byState?: {
      waiting?: number;
      active?: number;
      completed?: number;
      failed?: number;
    };
  };
  jobs?: InspectJobData[];
};

type CleanupResponse = {
  success?: boolean;
  error?: string;
  message?: string;
  cleanedCount?: number;
  errorCount?: number;
  removedByState?: {
    waiting: number;
    completed: number;
    failed: number;
  };
};

const TEXT = {
  vi: {
    title: 'Bảng điều khiển hàng đợi',
    description: 'Theo dõi job đang chạy và dọn trạng thái hàng đợi một cách có kiểm soát.',
    refresh: 'Làm mới',
    refreshing: 'Đang làm mới...',
    activeJobs: 'Job đang chạy',
    waitingJobs: 'Job đang chờ',
    runningJobs: 'Job đang xử lý',
    noActiveJobs: 'Hiện không có job đang chạy.',
    clearJobs: 'Dọn job',
    cleanupTitle: 'Dọn lịch sử hàng đợi',
    clearDescription: 'Thao tác này chỉ nên dùng khi bạn đã kiểm tra job không còn active.',
    cleanupScope: 'Phạm vi dọn dẹp',
    confirm: 'Tôi hiểu thao tác này không thể hoàn tác.',
    cancel: 'Hủy',
    confirmAction: 'Xác nhận dọn job',
    clearing: 'Đang dọn...',
    stop: 'Dừng',
    stopping: 'Đang dừng...',
    confirmRequired: 'Vui lòng xác nhận trước khi dọn hàng đợi.',
    columns: {
      jobId: 'Mã job',
      title: 'Tiêu đề',
      platform: 'Nền tảng',
      batch: 'Lô',
      attempts: 'Lần thử',
      progress: 'Tiến độ',
      started: 'Bắt đầu',
      elapsed: 'Đã chạy',
      action: 'Thao tác',
    },
    scopes: {
      finished: 'Job đã kết thúc (hoàn tất + lỗi)',
      waiting: 'Chỉ job đang chờ',
      'all-non-active': 'Tất cả job không active (chờ + hoàn tất + lỗi)',
    },
  },
  en: {
    title: 'Queue Dashboard',
    description: 'Monitor active jobs and clear queue states with explicit confirmation.',
    refresh: 'Refresh',
    refreshing: 'Refreshing...',
    activeJobs: 'Active jobs',
    waitingJobs: 'Waiting jobs',
    runningJobs: 'Running jobs',
    noActiveJobs: 'No active jobs at the moment.',
    clearJobs: 'Clear jobs',
    cleanupTitle: 'Clear queue history',
    clearDescription: 'Use this only after checking that no active job will be affected.',
    cleanupScope: 'Cleanup scope',
    confirm: 'I understand this action cannot be undone.',
    cancel: 'Cancel',
    confirmAction: 'Confirm cleanup',
    clearing: 'Clearing...',
    stop: 'Stop',
    stopping: 'Stopping...',
    confirmRequired: 'Please confirm before clearing the queue.',
    columns: {
      jobId: 'Job ID',
      title: 'Title',
      platform: 'Platform',
      batch: 'Batch',
      attempts: 'Attempts',
      progress: 'Progress',
      started: 'Started',
      elapsed: 'Elapsed',
      action: 'Action',
    },
    scopes: {
      finished: 'Finished jobs (completed + failed)',
      waiting: 'Waiting jobs only',
      'all-non-active': 'All non-active jobs (waiting + completed + failed)',
    },
  },
};

const SCOPE_OPTIONS: QueueCleanupScope[] = ['finished', 'waiting', 'all-non-active'];

function formatProgress(progress: InspectJobData['progress']) {
  if (typeof progress === 'number') return `${progress}%`;
  if (!progress || typeof progress !== 'object') return '0%';

  const total = Number((progress as Record<string, unknown>).total || 0);
  const current = Number((progress as Record<string, unknown>).current || 0);
  if (total > 0) return `${Math.min(100, Math.round((current / total) * 100))}%`;
  return 'In progress';
}

function formatElapsed(startedAt: string | null) {
  if (!startedAt) return '-';
  const diffMs = Date.now() - new Date(startedAt).getTime();
  if (!Number.isFinite(diffMs) || diffMs < 0) return '-';
  const totalSeconds = Math.floor(diffMs / 1000);
  return `${Math.floor(totalSeconds / 60)}m ${totalSeconds % 60}s`;
}

function getJobStartTime(job: InspectJobData): string | null {
  return job.processedOn || job.createdAt || null;
}

function isStopEligible(state: string) {
  return state === 'active' || state === 'waiting';
}

export default function QueuePage() {
  const language = useLanguageStore((state) => state.language);
  const text = TEXT[language];
  const [loadingJobs, setLoadingJobs] = useState(false);
  const [jobsError, setJobsError] = useState<string | null>(null);
  const [jobs, setJobs] = useState<InspectJobData[]>([]);
  const [waitingCount, setWaitingCount] = useState(0);
  const [activeCount, setActiveCount] = useState(0);
  const [scope, setScope] = useState<QueueCleanupScope>('finished');
  const [confirmCleanup, setConfirmCleanup] = useState(false);
  const [isCleanupOpen, setIsCleanupOpen] = useState(false);
  const [cleaning, setCleaning] = useState(false);
  const [cleanupMessage, setCleanupMessage] = useState<string | null>(null);
  const [stoppingJobId, setStoppingJobId] = useState<string | null>(null);
  const [stopMessage, setStopMessage] = useState<string | null>(null);

  const selectedScopeLabel = useMemo(() => text.scopes[scope], [scope, text.scopes]);

  const fetchRunningJobs = async () => {
    setLoadingJobs(true);
    setJobsError(null);

    try {
      const response = await fetch('/api/filter/inspect?state=active&limit=200&includeGroups=false', {
        cache: 'no-store',
      });
      const result = (await response.json()) as InspectResponse;

      if (!response.ok || result.error) {
        throw new Error(result.error || 'Failed to load queue status');
      }

      setJobs(result.jobs || []);
      setActiveCount(result.summary?.byState?.active || 0);
      setWaitingCount(result.summary?.byState?.waiting || 0);
    } catch (error) {
      setStopMessage(null);
      setJobsError(error instanceof Error ? error.message : 'Failed to load queue status');
    } finally {
      setLoadingJobs(false);
    }
  };

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void fetchRunningJobs();
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, []);

  const stopJob = async (jobId: string) => {
    setStoppingJobId(jobId);
    setStopMessage(null);

    try {
      const response = await fetch('/api/filter/stop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId }),
      });
      const result = (await response.json()) as StopResponse;
      if (!response.ok || result.error) throw new Error(result.error || 'Failed to stop job');

      setStopMessage(result.message || 'Job stopped.');
      await fetchRunningJobs();
    } catch (error) {
      setStopMessage(error instanceof Error ? error.message : 'Failed to stop job');
    } finally {
      setStoppingJobId(null);
    }
  };

  const clearJobs = async () => {
    if (!confirmCleanup) {
      setCleanupMessage(text.confirmRequired);
      return;
    }

    setCleaning(true);
    setCleanupMessage(null);

    try {
      const response = await fetch('/api/filter/cleanup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'queue', scope, confirm: true }),
      });
      const result = (await response.json()) as CleanupResponse;
      if (!response.ok || result.error) throw new Error(result.error || 'Failed to clear jobs');

      const removed = result.removedByState;
      const removedText = removed
        ? ` waiting=${removed.waiting}, completed=${removed.completed}, failed=${removed.failed}`
        : '';
      setCleanupMessage(`Done. Removed ${result.cleanedCount || 0} jobs.${removedText}`);
      setConfirmCleanup(false);
      setIsCleanupOpen(false);
      await fetchRunningJobs();
    } catch (error) {
      setCleanupMessage(error instanceof Error ? error.message : 'Failed to clear jobs');
    } finally {
      setCleaning(false);
    }
  };

  return (
    <div className="h-full overflow-auto p-4 sm:p-6">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-950">{text.title}</h1>
          <p className="mt-1 max-w-xl text-sm text-gray-600">{text.description}</p>
        </div>

        <button
          onClick={() => void fetchRunningJobs()}
          disabled={loadingJobs}
          className="w-fit rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
        >
          {loadingJobs ? text.refreshing : text.refresh}
        </button>
      </div>

      <div className="mb-6 grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <div className="text-xs font-semibold uppercase text-gray-500">{text.activeJobs}</div>
          <div className="mt-2 text-2xl font-bold text-emerald-700">{activeCount}</div>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <div className="text-xs font-semibold uppercase text-gray-500">{text.waitingJobs}</div>
          <div className="mt-2 text-2xl font-bold text-amber-700">{waitingCount}</div>
        </div>
      </div>

      <section className="mb-8 rounded-lg border border-gray-200 bg-white p-4">
        <h2 className="mb-3 text-base font-semibold text-gray-900">{text.runningJobs}</h2>
        {jobsError ? (
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{jobsError}</div>
        ) : jobs.length === 0 ? (
          <p className="text-sm text-gray-500">{text.noActiveJobs}</p>
        ) : (
          <div className="grid gap-3 lg:hidden">
            {jobs.map((job) => (
              <div key={job.id} className="rounded-lg border border-gray-200 p-3 text-sm">
                <div className="font-semibold text-gray-900">{job.data?.title || job.id}</div>
                <div className="mt-2 grid grid-cols-2 gap-2 text-gray-600">
                  <span>{text.columns.platform}: {job.data?.platform || '-'}</span>
                  <span>{text.columns.progress}: {formatProgress(job.progress)}</span>
                  <span>{text.columns.attempts}: {job.attempts}/{job.maxAttempts || 0}</span>
                  <span>{text.columns.elapsed}: {formatElapsed(getJobStartTime(job))}</span>
                </div>
                <button
                  onClick={() => void stopJob(job.id)}
                  disabled={stoppingJobId === job.id || !isStopEligible(job.state)}
                  className="mt-3 rounded-md bg-amber-600 px-3 py-1 text-xs font-semibold text-white hover:bg-amber-700 disabled:cursor-not-allowed disabled:bg-amber-300"
                >
                  {stoppingJobId === job.id ? text.stopping : text.stop}
                </button>
              </div>
            ))}
          </div>
        )}

        {jobs.length > 0 && !jobsError && (
          <div className="hidden overflow-x-auto lg:block">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead>
                <tr className="text-left text-xs uppercase text-gray-500">
                  <th className="px-2 py-2">{text.columns.jobId}</th>
                  <th className="px-2 py-2">{text.columns.title}</th>
                  <th className="px-2 py-2">{text.columns.platform}</th>
                  <th className="px-2 py-2">{text.columns.batch}</th>
                  <th className="px-2 py-2">{text.columns.attempts}</th>
                  <th className="px-2 py-2">{text.columns.progress}</th>
                  <th className="px-2 py-2">{text.columns.started}</th>
                  <th className="px-2 py-2">{text.columns.elapsed}</th>
                  <th className="px-2 py-2">{text.columns.action}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-gray-700">
                {jobs.map((job) => (
                  <tr key={job.id}>
                    <td className="px-2 py-2 font-mono text-xs">{job.id}</td>
                    <td className="px-2 py-2">{job.data?.title || '-'}</td>
                    <td className="px-2 py-2">{job.data?.platform || '-'}</td>
                    <td className="px-2 py-2">{job.data?.batchId || '-'}</td>
                    <td className="px-2 py-2">{job.attempts}/{job.maxAttempts || 0}</td>
                    <td className="px-2 py-2">{formatProgress(job.progress)}</td>
                    <td className="px-2 py-2">{job.processedOn ? new Date(job.processedOn).toLocaleString() : '-'}</td>
                    <td className="px-2 py-2">{formatElapsed(getJobStartTime(job))}</td>
                    <td className="px-2 py-2">
                      <button
                        onClick={() => void stopJob(job.id)}
                        disabled={stoppingJobId === job.id || !isStopEligible(job.state)}
                        className="rounded-md bg-amber-600 px-3 py-1 text-xs font-semibold text-white hover:bg-amber-700 disabled:cursor-not-allowed disabled:bg-amber-300"
                      >
                        {stoppingJobId === job.id ? text.stopping : text.stop}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {stopMessage && (
          <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">{stopMessage}</div>
        )}
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-4">
        <h2 className="mb-2 text-base font-semibold text-gray-900">{text.cleanupTitle}</h2>
        <p className="mb-3 text-sm text-gray-600">{text.clearDescription}</p>

        <div className="mb-4">
          <label className="mb-1 block text-xs font-semibold uppercase text-gray-500">{text.cleanupScope}</label>
          <select
            value={scope}
            onChange={(event) => {
              setScope(event.target.value as QueueCleanupScope);
              setConfirmCleanup(false);
            }}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          >
            {SCOPE_OPTIONS.map((option) => (
              <option key={option} value={option}>{text.scopes[option]}</option>
            ))}
          </select>
        </div>

        <button
          onClick={() => setIsCleanupOpen(true)}
          disabled={cleaning}
          className="rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-red-300"
        >
          {cleaning ? text.clearing : text.clearJobs}
        </button>

        {cleanupMessage && (
          <div className="mt-3 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-700">{cleanupMessage}</div>
        )}
      </section>

      {isCleanupOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/70 px-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-cyan-300/20 bg-slate-950 p-5 text-slate-100 shadow-2xl">
            <h3 className="text-lg font-bold">{text.cleanupTitle}</h3>
            <p className="mt-2 text-sm text-slate-300">{selectedScopeLabel}</p>
            <label className="mt-4 flex items-start gap-3 rounded-xl border border-amber-300/20 bg-amber-500/10 p-3 text-sm text-amber-100">
              <input
                type="checkbox"
                checked={confirmCleanup}
                onChange={(event) => setConfirmCleanup(event.target.checked)}
                className="mt-0.5 size-4 accent-amber-500"
              />
              <span>{text.confirm}</span>
            </label>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setIsCleanupOpen(false);
                  setConfirmCleanup(false);
                }}
                className="rounded-md border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-200 hover:bg-slate-900"
              >
                {text.cancel}
              </button>
              <button
                type="button"
                onClick={() => void clearJobs()}
                disabled={cleaning || !confirmCleanup}
                className="rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-red-300"
              >
                {cleaning ? text.clearing : text.confirmAction}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
