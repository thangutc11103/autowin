'use client';
import { navItems } from '@/config/nav';
import { useLanguageStore } from '@/store/language.store';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
// import { useVideoStore } from '@/store/video.store';

export default function Sidebar() {
    const pathname = usePathname();
    const language = useLanguageStore((state) => state.language);
    const setLanguage = useLanguageStore((state) => state.setLanguage);
    // const selectedCount = useVideoStore((s) => s.selectedVideos.length);
    return (
        <aside className="fixed left-0 top-0 h-full w-56 bg-white border-r border-gray-200 flex flex-col z-20">
            <div className="px-5 py-5 border-b border-gray-100">
                <h1 className="text-base font-bold text-gray-900 leading-tight">
                    🎬 Find Video<br />Trending
                </h1>
            </div>
            <nav className="flex-1 py-4 px-3">
                {navItems.map((item) => {
                    const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
                    return (
                        <Link
                            key={item.href}
                            href={item.href}
                            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg mb-1 text-sm font-medium transition-colors ${isActive
                                ? 'bg-blue-50 text-blue-700'
                                : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                                }`}
                        >
                            <span className="text-base">{item.icon}</span>
                            <span>{item.label[language]}</span>
                            {/* {item.href === '/selected' && selectedCount > 0 && (
                                <span className="ml-auto bg-blue-600 text-white text-xs font-bold rounded-full px-1.5 py-0.5 min-w-[20px] text-center">
                                    {selectedCount}
                                </span>
                            )} */}
                        </Link>
                    );
                })}
            </nav>
            <div className="px-5 py-4 border-t border-gray-100">
                <div className="mb-3 flex items-center justify-between rounded-lg bg-gray-100 p-1">
                    {(['vi', 'en'] as const).map((item) => (
                        <button
                            key={item}
                            type="button"
                            onClick={() => setLanguage(item)}
                            className={`flex-1 rounded-md px-2 py-1.5 text-xs font-bold uppercase transition-colors ${language === item
                                ? 'bg-white text-blue-700 shadow-sm'
                                : 'text-gray-500 hover:text-gray-900'
                                }`}
                        >
                            {item}
                        </button>
                    ))}
                </div>
                <div className="text-xs text-gray-400">MVP v1.0</div>
            </div>
        </aside>
    );
}
