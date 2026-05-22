'use client';

import { useMemo, useState } from 'react';
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
    description: 'Theo dõi job đang chạy và dọn các trạng thái hàng đợi an toàn.',
    refresh: 'Làm mới',
    refreshing: 'Đang làm mới...',
    activeJobs: 'Job đang chạy',
    waitingJobs: 'Job đang chờ',
    runningJobs: 'Job đang xử lý',
    noActiveJobs: 'Hiện không có job đang chạy.',
    clearJobs: 'Dọn job',
    clearDescription: 'Chỉ dọn các job không còn active. Thao tác này không thể hoàn tác.',
    cleanupScope: 'Phạm vi dọn dẹp',
    confirm: 'Tôi hiểu thao tác này sẽ xóa lịch sử hàng đợi trong phạm vi đã chọn.',
    clearing: 'Đang dọn...',
    stop: 'Dừng',
    stopping: 'Đang dừng...',
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
    description: 'Monitor active jobs and clear safe queue states.',
    refresh: 'Refresh',
    refreshing: 'Refreshing...',
    activeJobs: 'Active jobs',
    waitingJobs: 'Waiting jobs',
    runningJobs: 'Running jobs',
    noActiveJobs: 'No active jobs at the moment.',
    clearJobs: 'Clear jobs',
    clearDescription: 'Only non-active scopes are available. This action cannot be undone.',
    cleanupScope: 'Cleanup scope',
    confirm: 'I understand this will remove queued history for the selected scope.',
    clearing: 'Clearing...',
    stop: 'Stop',
    stopping: 'Stopping...',
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

const SCOPE_OPTIONS: Array<{ value: QueueCleanupScope; needsConfirm: boolean }> = [
  { value: 'finished', needsConfirm: false },
  { value: 'waiting', needsConfirm: true },
  { value: 'all-non-active', needsConfirm: true },
];

function formatProgress(progress: InspectJobData['progress']) {
  if (typeof progress === 'number') {
    return `${progress}%`;
  }

  if (!progress || typeof progress !== 'object') {
    return '0%';
  }

  const total = Number((progress as Record<string, unknown>).total || 0);
  const current = Number((progress as Record<string, unknown>).current || 0);

  if (total > 0) {
    return `${Math.min(100, Math.round((current / total) * 100))}%`;
  }

  return 'In progress';
}

function formatElapsed(startedAt: string | null) {
  if (!startedAt) return '-';
  const diffMs = Date.now() - new Date(startedAt).getTime();
  if (!Number.isFinite(diffMs) || diffMs < 0) return '-';
  const totalSeconds = Math.floor(diffMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${seconds}s`;
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
  const [confirmDestructive, setConfirmDestructive] = useState(false);
  const [cleaning, setCleaning] = useState(false);
  const [cleanupMessage, setCleanupMessage] = useState<string | null>(null);
  const [stoppingJobId, setStoppingJobId] = useState<string | null>(null);
  const [stopMessage, setStopMessage] = useState<string | null>(null);

  const selectedScope = useMemo(
    () => SCOPE_OPTIONS.find((item) => item.value === scope) || SCOPE_OPTIONS[0],
    [scope],
  );

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

  const stopJob = async (jobId: string) => {
    setStoppingJobId(jobId);
    setStopMessage(null);

    try {
      const response = await fetch('/api/filter/stop', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ jobId }),
      });

      const result = (await response.json()) as StopResponse;
      if (!response.ok || result.error) {
        throw new Error(result.error || 'Failed to stop job');
      }

      setStopMessage(result.message || 'Job stopped.');
      await fetchRunningJobs();
    } catch (error) {
      setStopMessage(error instanceof Error ? error.message : 'Failed to stop job');
    } finally {
      setStoppingJobId(null);
    }
  };

  const clearJobs = async () => {
    if (selectedScope.needsConfirm && !confirmDestructive) {
      setCleanupMessage('Please confirm before clearing this scope.');
      return;
    }

    setCleaning(true);
    setCleanupMessage(null);

    try {
      const response = await fetch('/api/filter/cleanup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          mode: 'queue',
          scope,
          confirm: selectedScope.needsConfirm ? true : undefined,
        }),
      });

      const result = (await response.json()) as CleanupResponse;
      if (!response.ok || result.error) {
        throw new Error(result.error || 'Failed to clear jobs');
      }

      const removed = result.removedByState;
      const removedText = removed
        ? ` waiting=${removed.waiting}, completed=${removed.completed}, failed=${removed.failed}`
        : '';
      setCleanupMessage(`Done. Removed ${result.cleanedCount || 0} jobs.${removedText}`);
      setConfirmDestructive(false);
      await fetchRunningJobs();
    } catch (error) {
      setCleanupMessage(error instanceof Error ? error.message : 'Failed to clear jobs');
    } finally {
      setCleaning(false);
    }
  };

  return (
    <div className="h-full overflow-auto p-4 sm:p-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-950">{text.title}</h1>
          <p className="mt-1 text-sm text-gray-600">{text.description}</p>
        </div>

        <button
          onClick={() => void fetchRunningJobs()}
          disabled={loadingJobs}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
        >
          {loadingJobs ? text.refreshing : text.refresh}
        </button>
      </div>

      <div className="mb-6 grid gap-3 md:grid-cols-2">
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <div className="text-xs font-semibold uppercase text-gray-500">{text.activeJobs}</div>
          <div className="mt-2 text-2xl font-bold text-emerald-700">{activeCount}</div>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <div className="text-xs font-semibold uppercase text-gray-500">{text.waitingJobs}</div>
          <div className="mt-2 text-2xl font-bold text-amber-700">{waitingCount}</div>
        </div>
      </div>

      <div className="mb-8 rounded-lg border border-gray-200 bg-white p-4">
        <h2 className="mb-3 text-base font-semibold text-gray-900">{text.runningJobs}</h2>
        {jobsError ? (
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{jobsError}</div>
        ) : jobs.length === 0 ? (
          <p className="text-sm text-gray-500">{text.noActiveJobs}</p>
        ) : (
          <div className="overflow-x-auto">
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
          <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
            {stopMessage}
          </div>
        )}
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <h2 className="mb-2 text-base font-semibold text-gray-900">{text.clearJobs}</h2>
        <p className="mb-3 text-sm text-gray-600">{text.clearDescription}</p>

        <div className="mb-3">
          <label className="mb-1 block text-xs font-semibold uppercase text-gray-500">{text.cleanupScope}</label>
          <select
            value={scope}
            onChange={(event) => {
              setScope(event.target.value as QueueCleanupScope);
              setConfirmDestructive(false);
            }}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          >
            {SCOPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {text.scopes[option.value]}
              </option>
            ))}
          </select>
        </div>

        {selectedScope.needsConfirm && (
          <label className="mb-3 flex items-center gap-2 text-sm text-amber-700">
            <input
              type="checkbox"
              checked={confirmDestructive}
              onChange={(event) => setConfirmDestructive(event.target.checked)}
              className="size-4 accent-amber-600"
            />
            {text.confirm}
          </label>
        )}

        <button
          onClick={() => void clearJobs()}
          disabled={cleaning || (selectedScope.needsConfirm && !confirmDestructive)}
          className="rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-red-300"
        >
          {cleaning ? text.clearing : text.clearJobs}
        </button>

        {cleanupMessage && (
          <div className="mt-3 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-700">
            {cleanupMessage}
          </div>
        )}
      </div>
    </div>
  );
}
