'use client';

export default function QueuePage() {
    return (
        <div className="p-6">
            <h1 className="text-2xl font-bold mb-4">Queue Dashboard</h1>
            <p className="text-gray-600 mb-6">
                This is the queue page where you can monitor the status of your scraping jobs and manage the queue.
            </p>
            {/* Placeholder for future queue monitoring features */}
            <div className="p-4 bg-gray-100 rounded-lg text-center">
                <p className="text-gray-500">🚧 Under Construction 🚧</p>
                <p className="text-sm text-gray-400 mt-2">Stay tuned for upcoming features!</p>
            </div>
        </div>
    );
}