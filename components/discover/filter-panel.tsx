'use client';

import { useState } from 'react';
import { PLATFORM_FILTER_CONFIGS } from '@/config/filter-config';
import type { Platform } from '@/types/video';
import { useFilterStore } from '@/store/filter.store';
import { PlatformFilterValues } from '@/types/filter';
import type { DecomposeFilterRequest, JobSubmissionResult } from '@/types/job';

const PLATFORM_ACTIVE_COLORS: Record<Platform, string> = {
    tiktok: 'bg-pink-50 border-pink-300 text-pink-700',
    douyin: 'bg-purple-50 border-purple-300 text-purple-700',
    facebook: 'bg-blue-50 border-blue-300 text-blue-700',
    instagram: 'bg-orange-50 border-orange-300 text-orange-700',
    youtube: 'bg-red-50 border-red-300 text-red-700',
};

interface SectionProps {
    label: string;
    children: React.ReactNode;
}

function FilterSection({ label, children }: SectionProps) {
    return (
        <div className="border-b border-gray-100 last:border-0">
            <button className="w-full flex items-center justify-between py-2 px-1 text-xs font-semibold text-gray-600 hover:text-gray-900 transition-colors cursor-pointer">
                <span>{label}</span>
                <span className="text-gray-400">▾</span>
            </button>
            <div className="pb-3 px-1">{children}</div>
        </div>
    );
}

export default function FilterPanel() {
    const { activePlatform, filters, setActivePlatform, setFilterValue, resetFilters } = useFilterStore();
    // draftFilters: Giá trị đang edit (không submit)
    const [draftFilters, setDraftFilters] = useState<Record<string, Record<string, string | number>>>({});
    // lastCommittedFilters: Những gì đã gửi thành công lên redis
    const [lastCommittedFilters, setLastCommittedFilters] = useState<Record<string, Record<string, string | number>>>({});
    // submittedFields: Track những fields thực sự được submit (để không show stale values từ batch cũ)
    const [submittedFields, setSubmittedFields] = useState<Record<string, Set<string>>>({});
    // batchIds: Lưu batchId cho mỗi platform để xóa từ Redis
    const [batchIds, setBatchIds] = useState<Record<string, string>>({});
    const [expandedPlatforms, setExpandedPlatforms] = useState<Set<Platform>>(new Set(['tiktok']));
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submitMessage, setSubmitMessage] = useState<{
        type: 'success' | 'error';
        text: string;
    } | null>(null);

    const togglePlatformExpand = (platform: Platform) => {
        setExpandedPlatforms((prev) => {
            const next = new Set(prev);
            if (next.has(platform)) {
                next.delete(platform);
            } else {
                next.add(platform);
            }
            return next;
        });
    };

    const handlePlatformClick = (platform: Platform) => {
        setActivePlatform(platform);
        if (!expandedPlatforms.has(platform)) {
            setExpandedPlatforms((prev) => new Set([...prev, platform]));
        }
    };

    const handleInputChange = (platform: Platform, fieldKey: string, value: string | number) => {
        setDraftFilters((prev) => ({
            ...prev,
            [platform]: {
                ...prev[platform],
                [fieldKey]: value,
            },
        }));
    };

    const handleFieldChange = (
        platform: Platform,
        key: keyof PlatformFilterValues,
        value: number
    ) => {
        setDraftFilters((prev) => ({
            ...prev,
            [platform]: {
                ...prev[platform],
                [key]: value,
            },
        }));
    };

    const submitFiltersToRedis = async (
        platform: Platform,
        processedFilters: Record<string, string[] | number>
    ) => {
        setIsSubmitting(true);
        setSubmitMessage(null);

        try {
            const request: DecomposeFilterRequest = {
                platform,
                filters: processedFilters as any,
            };

            const response = await fetch('/api/filter/decompose', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(request),
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to submit filters');
            }

            const result: JobSubmissionResult = await response.json();
            setSubmitMessage({
                type: 'success',
                text: `✓ ${result.message} (Batch ID: ${result.batchId})`,
            });

            // Lưu những gì đã submit thành công
            setLastCommittedFilters((prev) => ({
                ...prev,
                [platform]: draftFilters[platform] || {},
            }));

            // Track những fields đã submit (để không show stale values từ batch cũ)
            const submittedFieldsForPlatform = new Set(Object.keys(processedFilters));
            setSubmittedFields((prev) => ({
                ...prev,
                [platform]: submittedFieldsForPlatform,
            }));

            // Lưu batchId để xóa Redis sau này
            setBatchIds((prev) => ({
                ...prev,
                [platform]: result.batchId,
            }));

            console.log(`Successfully submitted ${result.totalJobs} jobs to Redis queue`);
        } catch (error) {
            const errorText = error instanceof Error ? error.message : 'Unknown error';
            setSubmitMessage({
                type: 'error',
                text: `✗ Error: ${errorText}`,
            });
            console.error('Error submitting filters to Redis:', error);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleFind = async (platform: Platform) => {
        setActivePlatform(platform);

        // Clear old data from store trước khi submit new filters (tránh mixing old + new)
        resetFilters(platform);

        const platformFilters = draftFilters[platform] || {};
        const platformConfig = PLATFORM_FILTER_CONFIGS.find((c) => c.platform === platform);

        const processedFilters: Record<string, string[] | number> = {};

        // Xử lý các fields từ draftFilters
        Object.entries(platformFilters).forEach(([key, value]) => {
            if (typeof value === 'string') {
                const arrayValue = value
                    .split(',')
                    .map((v) => v.trim())
                    .filter((v) => v);
                if (arrayValue.length > 0) {
                    processedFilters[key] = arrayValue;
                    setFilterValue(platform, key as keyof PlatformFilterValues, arrayValue);
                }
            } else {
                processedFilters[key] = value;
                setFilterValue(platform, key as keyof PlatformFilterValues, value);
            }
        });

        // Thêm slider fields (như limit) nếu chưa có, dùng default value
        if (platformConfig) {
            platformConfig.sections.forEach((section) => {
                section.fields.forEach((field) => {
                    if (field.type === 'slider' && !(field.key in processedFilters)) {
                        // Nếu slider không có trong draftFilters, thêm default value = min
                        const defaultValue = field.min ?? 1;
                        processedFilters[field.key] = defaultValue;
                        setFilterValue(platform, field.key as keyof PlatformFilterValues, defaultValue);
                    }
                });
            });
        }

        await submitFiltersToRedis(platform, processedFilters);
    };

    return (
        <div className="h-full flex flex-col bg-white border-r border-gray-200">
            <div className="px-4 py-4 border-b border-gray-100">
                <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wide">Platform</h2>
            </div>

            {/* Submit Message */}
            {submitMessage && (
                <div
                    className={`mx-2 mt-2 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${submitMessage.type === 'success'
                        ? 'bg-green-50 border border-green-300 text-green-700'
                        : 'bg-red-50 border border-red-300 text-red-700'
                        }`}
                >
                    {submitMessage.text}
                </div>
            )}

            <div className="flex-1 overflow-y-auto py-2">
                {PLATFORM_FILTER_CONFIGS.map((config) => {
                    const isActive = activePlatform === config.platform;
                    const isExpanded = expandedPlatforms.has(config.platform);
                    const platformFilters = filters[config.platform] ?? {};
                    const activeClass = isActive ? PLATFORM_ACTIVE_COLORS[config.platform] : '';

                    return (
                        <div key={config.platform} className="mb-1">
                            {/* Platform Header */}
                            <div
                                className={`flex items-center justify-between mx-2 px-3 py-2 rounded-lg cursor-pointer border transition-all ${isActive
                                    ? `${activeClass} border`
                                    : 'border-transparent hover:bg-gray-50'
                                    }`}
                            >
                                <button
                                    className="flex items-center gap-2 flex-1 text-left cursor-pointer"
                                    onClick={() => handlePlatformClick(config.platform)}
                                >
                                    <span className="text-base">{config.emoji}</span>
                                    <span className="text-sm font-semibold text-gray-700">{config.label}</span>
                                </button>
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        togglePlatformExpand(config.platform);
                                    }}
                                    className="text-gray-400 hover:text-gray-600 ml-1 text-xs cursor-pointer"
                                >
                                    ▸
                                </button>
                            </div>

                            {/* Platform Filters */}
                            {isExpanded && (
                                <div className="mx-2 mt-1 mb-2 px-3 py-2 bg-gray-50 rounded-lg">
                                    {config.sections.map((section) => (
                                        <FilterSection key={section.label} label={section.label}>
                                            {section.fields.map((field) => {
                                                const rawVal = platformFilters[field.key as keyof PlatformFilterValues];

                                                if (field.type === 'slider') {
                                                    const draftVal = draftFilters[config.platform]?.[field.key];
                                                    const committedVal = lastCommittedFilters[config.platform]?.[field.key];
                                                    const isFieldSubmitted = submittedFields[config.platform]?.has(field.key);
                                                    const tempVal = draftVal ?? (isFieldSubmitted ? committedVal : undefined) ?? rawVal ?? (field.min ?? 0);
                                                    const val = typeof tempVal === 'number' ? tempVal : (field.min ?? 0);

                                                    return (
                                                        <div key={field.key}>
                                                            <div className="flex justify-between text-xs text-gray-400 mb-1">
                                                                <span>{field.min ?? 0}</span>
                                                                <span className="font-medium text-gray-600">{val}</span>
                                                                <span>{field.max ?? 100}</span>
                                                            </div>
                                                            <input
                                                                type="range"
                                                                min={field.min ?? 0}
                                                                max={field.max ?? 100}
                                                                step={field.step ?? 1}
                                                                value={val}
                                                                onChange={(e) =>
                                                                    handleFieldChange(
                                                                        config.platform,
                                                                        field.key as keyof PlatformFilterValues,
                                                                        Number(e.target.value)
                                                                    )
                                                                }
                                                                className="w-full accent-blue-500 cursor-pointer"
                                                            />
                                                        </div>
                                                    );
                                                }

                                                const draftVal = draftFilters[config.platform]?.[field.key];
                                                const committedVal = lastCommittedFilters[config.platform]?.[field.key];
                                                // Only show committed value if field was actually submitted
                                                const isFieldSubmitted = submittedFields[config.platform]?.has(field.key);
                                                const val = draftVal ?? (isFieldSubmitted ? committedVal : undefined) ?? '';

                                                return (
                                                    <input
                                                        key={field.key}
                                                        type="text"
                                                        placeholder={field.placeholder ?? ''}
                                                        value={val}
                                                        onChange={(e) =>
                                                            handleInputChange(config.platform, field.key, e.target.value)
                                                        }
                                                        className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white mb-2"
                                                    />
                                                );
                                            })}
                                        </FilterSection>
                                    ))}

                                    <div className="flex justify-end gap-2 mt-3">
                                        <button
                                            onClick={async () => {
                                                const batchId = batchIds[config.platform];

                                                try {
                                                    // Nếu có batchId, call API để xóa từ Redis trước
                                                    if (batchId) {
                                                        const clearResponse = await fetch('/api/filter/clear', {
                                                            method: 'POST',
                                                            headers: { 'Content-Type': 'application/json' },
                                                            body: JSON.stringify({ batchId, platform: config.platform }),
                                                        });

                                                        if (clearResponse.ok) {
                                                            const clearResult = await clearResponse.json();
                                                            console.log(`✓ Cleared ${clearResult.removedCount} jobs from Redis for batch: ${batchId}`);
                                                            setSubmitMessage({
                                                                type: 'success',
                                                                text: `✓ Cleared ${clearResult.removedCount} jobs from Redis`,
                                                            });
                                                        } else {
                                                            const errorData = await clearResponse.json();
                                                            console.error('Clear failed:', errorData);
                                                            setSubmitMessage({
                                                                type: 'error',
                                                                text: `✗ Failed to clear: ${errorData.error}`,
                                                            });
                                                        }
                                                    }

                                                    // Xóa local state
                                                    setDraftFilters((prev) => {
                                                        const updated = { ...prev };
                                                        delete updated[config.platform];
                                                        return updated;
                                                    });
                                                    setLastCommittedFilters((prev) => {
                                                        const updated = { ...prev };
                                                        delete updated[config.platform];
                                                        return updated;
                                                    });
                                                    setSubmittedFields((prev) => {
                                                        const updated = { ...prev };
                                                        delete updated[config.platform];
                                                        return updated;
                                                    });
                                                    setBatchIds((prev) => {
                                                        const updated = { ...prev };
                                                        delete updated[config.platform];
                                                        return updated;
                                                    });

                                                    // Xóa từ Zustand store để tránh stale data
                                                    resetFilters(config.platform);
                                                } catch (error) {
                                                    console.error('Error in Clear button:', error);
                                                    setSubmitMessage({
                                                        type: 'error',
                                                        text: `✗ Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
                                                    });
                                                }
                                            }}
                                            className="px-4 py-2 bg-gray-200 text-gray-700 text-xs font-semibold rounded-lg hover:bg-gray-300 transition-colors cursor-pointer"
                                        >
                                            Clear
                                        </button>
                                        <button
                                            onClick={() => handleFind(config.platform)}
                                            disabled={isSubmitting}
                                            className="px-4 py-2 bg-blue-600 text-white text-xs font-semibold rounded-lg hover:bg-blue-700 disabled:bg-blue-400 transition-colors cursor-pointer"
                                        >
                                            {isSubmitting ? 'Submitting...' : 'Find'}
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
