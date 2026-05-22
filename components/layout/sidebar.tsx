'use client';

import { navItems } from '@/config/nav';
import { useLanguageStore } from '@/store/language.store';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';

export default function Sidebar() {
    const pathname = usePathname();
    const router = useRouter();
    const language = useLanguageStore((state) => state.language);
    const setLanguage = useLanguageStore((state) => state.setLanguage);
    const [isLoggingOut, setIsLoggingOut] = useState(false);

    const handleLogout = async () => {
        setIsLoggingOut(true);
        try {
            const response = await fetch('/api/auth/logout', { method: 'POST' });
            if (response.ok) {
                router.push('/login');
            }
        } catch (error) {
            console.error('Logout failed:', error);
        } finally {
            setIsLoggingOut(false);
        }
    };

    const brand = (
        <h1 className="text-base font-bold leading-tight text-gray-900">
            <span aria-hidden="true">🎬</span> Find Video <span className="md:block">Trending</span>
        </h1>
    );

    const languageSwitcher = (
        <div className="flex items-center justify-between rounded-lg bg-gray-100 p-1">
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
    );

    return (
        <>
            <header className="fixed inset-x-0 top-0 z-30 border-b border-gray-200 bg-white/95 px-4 py-3 backdrop-blur md:hidden">
                <div className="flex items-center justify-between gap-3">
                    <div className="shrink-0">{brand}</div>
                    <div className="w-28">{languageSwitcher}</div>
                </div>
            </header>

            <aside className="fixed left-0 top-0 z-20 hidden h-full w-56 flex-col border-r border-gray-200 bg-white md:flex">
                <div className="border-b border-gray-100 px-5 py-5">{brand}</div>
                <nav className="flex-1 px-3 py-4">
                    {navItems.map((item) => {
                        const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
                        return (
                            <Link
                                key={item.href}
                                href={item.href}
                                className={`mb-1 flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${isActive
                                    ? 'bg-blue-50 text-blue-700'
                                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                                    }`}
                            >
                                <span>{item.label[language]}</span>
                            </Link>
                        );
                    })}
                </nav>
                <div className="border-t border-gray-100 px-5 py-4">
                    <div className="mb-3">{languageSwitcher}</div>
                    <button
                        onClick={handleLogout}
                        disabled={isLoggingOut}
                        className="mb-3 w-full rounded-lg bg-red-600 px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-red-700 disabled:bg-gray-400"
                    >
                        {isLoggingOut
                            ? language === 'vi' ? 'Đang đăng xuất...' : 'Signing out...'
                            : language === 'vi' ? 'Đăng xuất' : 'Sign out'}
                    </button>
                    <div className="text-xs text-gray-400">MVP v1.0</div>
                </div>
            </aside>

            <nav className="fixed inset-x-0 bottom-0 z-30 flex gap-1 overflow-x-auto border-t border-gray-200 bg-white/95 px-1 py-1 shadow-[0_-4px_20px_rgba(15,23,42,0.08)] backdrop-blur md:hidden">
                {navItems.map((item) => {
                    const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
                    return (
                        <Link
                            key={item.href}
                            href={item.href}
                            className={`flex min-w-16 shrink-0 items-center justify-center rounded-md px-2 py-2 text-[11px] font-semibold ${isActive
                                ? 'bg-blue-50 text-blue-700'
                                : 'text-gray-500'
                                }`}
                        >
                            <span className="truncate">{item.label[language]}</span>
                        </Link>
                    );
                })}
            </nav>
        </>
    );
}
