'use client';

import { useMemo, useState } from 'react';

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

const SCOPE_OPTIONS: Array<{ value: QueueCleanupScope; label: string; needsConfirm: boolean }> = [
  { value: 'finished', label: 'Finished jobs (completed + failed)', needsConfirm: false },
  { value: 'waiting', label: 'Waiting jobs only', needsConfirm: true },
  { value: 'all-non-active', label: 'All non-active jobs (waiting + completed + failed)', needsConfirm: true },
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

export default function QueuePage() {
  const [loadingJobs, setLoadingJobs] = useState(false);
  const [jobsError, setJobsError] = useState<string | null>(null);
  const [jobs, setJobs] = useState<InspectJobData[]>([]);
  const [waitingCount, setWaitingCount] = useState(0);
  const [activeCount, setActiveCount] = useState(0);

  const [scope, setScope] = useState<QueueCleanupScope>('finished');
  const [confirmDestructive, setConfirmDestructive] = useState(false);
  const [cleaning, setCleaning] = useState(false);
  const [cleanupMessage, setCleanupMessage] = useState<string | null>(null);

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
      setJobsError(error instanceof Error ? error.message : 'Failed to load queue status');
    } finally {
      setLoadingJobs(false);
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
    <div className="p-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-950">Queue Dashboard</h1>
          <p className="mt-1 text-sm text-gray-600">Monitor active jobs and clear safe queue states.</p>
        </div>

        <button
          onClick={() => void fetchRunningJobs()}
          disabled={loadingJobs}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
        >
          {loadingJobs ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      <div className="mb-6 grid gap-3 md:grid-cols-2">
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <div className="text-xs font-semibold uppercase text-gray-500">Active jobs</div>
          <div className="mt-2 text-2xl font-bold text-emerald-700">{activeCount}</div>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <div className="text-xs font-semibold uppercase text-gray-500">Waiting jobs</div>
          <div className="mt-2 text-2xl font-bold text-amber-700">{waitingCount}</div>
        </div>
      </div>

      <div className="mb-8 rounded-lg border border-gray-200 bg-white p-4">
        <h2 className="mb-3 text-base font-semibold text-gray-900">Running jobs</h2>
        {jobsError ? (
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{jobsError}</div>
        ) : jobs.length === 0 ? (
          <p className="text-sm text-gray-500">No active jobs at the moment.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead>
                <tr className="text-left text-xs uppercase text-gray-500">
                  <th className="px-2 py-2">Job ID</th>
                  <th className="px-2 py-2">Title</th>
                  <th className="px-2 py-2">Platform</th>
                  <th className="px-2 py-2">Batch</th>
                  <th className="px-2 py-2">Attempts</th>
                  <th className="px-2 py-2">Progress</th>
                  <th className="px-2 py-2">Started</th>
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
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <h2 className="mb-2 text-base font-semibold text-gray-900">Clear jobs</h2>
        <p className="mb-3 text-sm text-gray-600">Only non-active scopes are available. This action cannot be undone.</p>

        <div className="mb-3">
          <label className="mb-1 block text-xs font-semibold uppercase text-gray-500">Cleanup scope</label>
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
                {option.label}
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
            I understand this will remove queued history for the selected scope.
          </label>
        )}

        <button
          onClick={() => void clearJobs()}
          disabled={cleaning || (selectedScope.needsConfirm && !confirmDestructive)}
          className="rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-red-300"
        >
          {cleaning ? 'Clearing...' : 'Clear jobs'}
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
