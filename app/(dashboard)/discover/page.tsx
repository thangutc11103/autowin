'use client';
import FilterPanel from '@/components/discover/filter-panel';
import { useFilterStore } from '@/store/filter.store';
export default function DiscoverPage() {
    const { filters, activePlatform } = useFilterStore();
    return (
        <div className="flex h-full overflow-hidden">
            {/* Left Filter Panel - independent scroll */}
            <div className="w-72 flex-none overflow-hidden">
                <FilterPanel />
            </div>

            {/* Right Main Content - independent scroll */}
            <div className="flex-1 flex flex-col overflow-hidden">
                {/* Sticky top bar with search */}
                <div className="flex-none bg-white border-b border-gray-100 px-6 py-3 flex items-center gap-4">
                    <h1 className="text-lg font-bold text-gray-900 whitespace-nowrap">
                        {/* {getPlatformDisplayName(activePlatform)} */}xxxx
                    </h1>
                    <div className="flex-1 max-w-md">
                        {/* <SearchBar onSearch={handleSearch} /> */}xxxx
                    </div>
                </div>

                {/* Scrollable video grid */}
                <div className="flex-1 overflow-y-auto px-6 py-4">
                    {filters[activePlatform] && (
                        <div className="text-sm text-gray-500">
                            Current Filters: {JSON.stringify(filters[activePlatform])}
                        </div>
                    )}
                    {/* <VideoGrid videos={videos} isLoading={isLoading} /> */}
                </div>
            </div>
        </div>
    );
}