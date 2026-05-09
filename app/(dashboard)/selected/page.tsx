'use client';

export default function SelectedPage() {
    return (
        <div className="p-6">
            <h1 className="text-2xl font-bold mb-4">Selected Videos</h1>
            <p className="text-gray-600 mb-6">
                This is the page where you can view and manage your selected videos.
            </p>
            {/* Placeholder for future selected videos features */}
            <div className="p-4 bg-gray-100 rounded-lg text-center">
                <p className="text-gray-500">🚧 Under Construction 🚧</p>
                <p className="text-sm text-gray-400 mt-2">Stay tuned for upcoming features!</p>
            </div>
        </div>
    );
}