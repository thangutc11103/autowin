'use client';

import { useEffect, useState } from 'react';

interface JobData {
    id: string;
    data: any;
    state: string;
    progress: number;
    attempts: number;
    maxAttempts: number;
    createdAt: string;
    processedOn: string | null;
    finishedOn: string | null;
}

interface InspectResponse {
    success: boolean;
    summary: {
        totalJobs: number;
        filteredJobs: number;
        byState: Record<string, number>;
    };
    filters: {
        batchId: string;
        platform: string;
    };
    jobs: JobData[];
    groupedByBatch: Record<string, JobData[]>;
    groupedByState: Record<string, JobData[]>;
}

export default function DebugPage() {
    const [data, setData] = useState<InspectResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchData = async () => {
        setLoading(true);
        setError(null);
        try {
            const response = await fetch('/api/filter/inspect');
            if (!response.ok) {
                throw new Error(`API Error: ${response.status}`);
            }
            const result = await response.json();
            if (result.error) {
                throw new Error(result.error);
            }
            setData(result);
        } catch (err) {
            const errorMsg = err instanceof Error ? err.message : 'Unknown error';
            console.error('Error fetching data:', err);
            setError(errorMsg);
            setData(null);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
        const interval = setInterval(fetchData, 3000); // Auto-refresh every 3 seconds
        return () => clearInterval(interval);
    }, []);

    return (
        <div className="p-6 bg-gray-50 min-h-screen">
            <h1 className="text-3xl font-bold mb-6">🔍 Redis Queue Inspector</h1>

            {/* Error Message */}
            {error && (
                <div className="mb-6 p-4 bg-red-50 border border-red-300 rounded-lg">
                    <p className="text-red-700 font-semibold mb-2">❌ Error: {error}</p>
                    <details className="text-xs text-red-600 mt-2">
                        <summary className="cursor-pointer font-semibold">Show Details</summary>
                        <pre className="mt-2 p-2 bg-red-100 rounded overflow-auto max-h-32">
                            {error}
                        </pre>
                    </details>
                    <button
                        onClick={fetchData}
                        className="mt-2 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
                    >
                        Retry
                    </button>
                </div>
            )}

            {/* Loading Message */}
            {loading && !data && (
                <div className="mb-6 p-4 bg-blue-50 border border-blue-300 rounded-lg">
                    <p className="text-blue-700 font-semibold">⏳ Loading Redis data...</p>
                </div>
            )}

            {/* Filters */}
            <div className="bg-white p-4 rounded-lg shadow mb-6 flex gap-4 justify-end">
                <button
                    onClick={fetchData}
                    disabled={loading}
                    className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400"
                >
                    {loading ? 'Loading...' : '🔄 Refresh'}
                </button>
            </div>

            {data && (
                <>
                    {/* Summary */}
                    <div className="grid grid-cols-3 gap-4 mb-6">
                        <div className="bg-white p-4 rounded-lg shadow">
                            <p className="text-sm text-gray-600">Total Jobs</p>
                            <p className="text-3xl font-bold text-blue-600">{data.summary.totalJobs}</p>
                        </div>
                        <div className="bg-white p-4 rounded-lg shadow">
                            <p className="text-sm text-gray-600">Filtered Results</p>
                            <p className="text-3xl font-bold text-purple-600">{data.summary.filteredJobs}</p>
                        </div>
                        <div className="bg-white p-4 rounded-lg shadow">
                            <p className="text-sm text-gray-600">Job States</p>
                            <ul className="text-sm mt-2 space-y-1">
                                <li><span className="font-semibold">Waiting:</span> {data.summary.byState.waiting}</li>
                                <li><span className="font-semibold">Active:</span> {data.summary.byState.active}</li>
                                <li><span className="font-semibold">Completed:</span> {data.summary.byState.completed}</li>
                                <li><span className="font-semibold">Failed:</span> {data.summary.byState.failed}</li>
                            </ul>
                        </div>
                    </div>

                    {/* Jobs Table */}
                    <div className="bg-white rounded-lg shadow overflow-hidden">
                        <div className="px-6 py-4 border-b border-gray-200">
                            <h2 className="text-lg font-semibold">Jobs List ({data.jobs.length})</h2>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead className="bg-gray-100 border-b border-gray-200">
                                    <tr>
                                        <th className="px-4 py-2 text-left">Job ID</th>
                                        <th className="px-4 py-2 text-left">State</th>
                                        <th className="px-4 py-2 text-left">Type</th>
                                        <th className="px-4 py-2 text-left">Value</th>
                                        <th className="px-4 py-2 text-left">Platform</th>
                                        <th className="px-4 py-2 text-left">Created</th>
                                        <th className="px-4 py-2 text-left">Progress</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {data.jobs.length === 0 ? (
                                        <tr>
                                            <td colSpan={7} className="px-4 py-4 text-center text-gray-500">
                                                No jobs found
                                            </td>
                                        </tr>
                                    ) : (
                                        data.jobs.map((job) => (
                                            <tr key={job.id} className="border-b border-gray-100 hover:bg-gray-50">
                                                <td className="px-4 py-2 font-mono text-xs">{job.id?.substring(0, 8)}...</td>
                                                <td className="px-4 py-2">
                                                    <span className={`px-2 py-1 rounded text-xs font-semibold ${job.state === 'completed' ? 'bg-green-100 text-green-800' :
                                                        job.state === 'active' ? 'bg-blue-100 text-blue-800' :
                                                            job.state === 'failed' ? 'bg-red-100 text-red-800' :
                                                                'bg-yellow-100 text-yellow-800'
                                                        }`}>
                                                        {job.state}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-2">{job.data?.type}</td>
                                                <td className="px-4 py-2 truncate max-w-xs">{job.data?.value}</td>
                                                <td className="px-4 py-2">{job.data?.platform}</td>
                                                <td className="px-4 py-2 text-xs">{new Date(job.createdAt).toLocaleTimeString()}</td>
                                                <td className="px-4 py-2">{job.progress}%</td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Raw JSON */}
                    <div className="mt-6 bg-white rounded-lg shadow p-6">
                        <h2 className="text-lg font-semibold mb-4">📋 Raw JSON Data</h2>
                        <pre className="bg-gray-100 p-4 rounded overflow-auto max-h-96 text-xs">
                            {JSON.stringify(data, null, 2)}
                        </pre>
                    </div>
                </>
            )}
        </div>
    );
}
