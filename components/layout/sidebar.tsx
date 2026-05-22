'use client';

import { navItems } from '@/config/nav';
import { useLanguageStore } from '@/store/language.store';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

export default function Sidebar() {
    const pathname = usePathname();
    const router = useRouter();
    const language = useLanguageStore((state) => state.language);
    const setLanguage = useLanguageStore((state) => state.setLanguage);
    const [isLoggingOut, setIsLoggingOut] = useState(false);
    const [mobileOpen, setMobileOpen] = useState(false);
    const previousPathname = useRef(pathname);

    useEffect(() => {
        if (previousPathname.current !== pathname) {
            previousPathname.current = pathname;
            window.setTimeout(() => setMobileOpen(false), 0);
        }
    }, [pathname]);

    useEffect(() => {
        document.body.style.overflow = mobileOpen ? 'hidden' : '';
        return () => {
            document.body.style.overflow = '';
        };
    }, [mobileOpen]);

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

    const navLinks = (compact = false) => (
        <nav className={compact ? 'flex-1 overflow-y-auto px-3 py-3' : 'flex-1 px-3 py-4'}>
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
    );

    const footer = (
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
    );

    return (
        <>
            <header className="fixed inset-x-0 top-0 z-40 border-b border-gray-200 bg-white/95 px-3 py-2 backdrop-blur md:hidden">
                <div className="flex h-11 items-center justify-between gap-3">
                    <button
                        type="button"
                        onClick={() => setMobileOpen(true)}
                        aria-label={language === 'vi' ? 'Mở menu' : 'Open menu'}
                        className="flex size-10 items-center justify-center rounded-lg text-2xl leading-none text-gray-800 hover:bg-gray-100"
                    >
                        ≡
                    </button>
                    <div className="min-w-0 flex-1 text-center">
                        <div className="truncate text-sm font-bold text-gray-900">Find Video Trending</div>
                    </div>
                    <button
                        type="button"
                        aria-label="More"
                        className="flex size-10 items-center justify-center rounded-lg text-xl leading-none text-gray-800 hover:bg-gray-100"
                    >
                        ⋯
                    </button>
                </div>
            </header>

            <aside className="fixed left-0 top-0 z-20 hidden h-full w-56 flex-col border-r border-gray-200 bg-white md:flex">
                <div className="border-b border-gray-100 px-5 py-5">{brand}</div>
                {navLinks()}
                {footer}
            </aside>

            <div
                className={`fixed inset-0 z-50 md:hidden ${mobileOpen ? 'pointer-events-auto' : 'pointer-events-none'}`}
                aria-hidden={!mobileOpen}
            >
                <button
                    type="button"
                    aria-label={language === 'vi' ? 'Đóng menu' : 'Close menu'}
                    onClick={() => setMobileOpen(false)}
                    className={`absolute inset-0 bg-gray-950/35 transition-opacity ${mobileOpen ? 'opacity-100' : 'opacity-0'}`}
                />
                <aside
                    className={`absolute inset-y-0 left-0 flex w-[82vw] max-w-[300px] flex-col border-r border-gray-200 bg-white shadow-2xl transition-transform duration-200 ease-out ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}`}
                >
                    <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
                        {brand}
                        <button
                            type="button"
                            onClick={() => setMobileOpen(false)}
                            aria-label={language === 'vi' ? 'Đóng menu' : 'Close menu'}
                            className="flex size-9 items-center justify-center rounded-lg text-2xl text-gray-500 hover:bg-gray-100 hover:text-gray-900"
                        >
                            ×
                        </button>
                    </div>
                    {navLinks(true)}
                    {footer}
                </aside>
            </div>
        </>
    );
}
