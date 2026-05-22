'use client';

import { navItems } from '@/config/nav';
import { useLanguageStore } from '@/store/language.store';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';

const NAV_LINK_BASE = 'mb-2 flex items-center gap-3 rounded-xl border px-3 py-3 text-sm font-semibold transition-all';
const NAV_LINK_ACTIVE = 'border-blue-400/50 bg-blue-500/15 text-cyan-100 shadow-[0_0_22px_rgba(59,130,246,0.22)]';
const NAV_LINK_IDLE = 'border-transparent text-slate-300 hover:border-cyan-300/15 hover:bg-slate-900/80 hover:text-slate-100';
const MOBILE_NAV_BASE = 'flex min-w-16 shrink-0 items-center justify-center rounded-lg px-2 py-2 text-[11px] font-semibold';

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
        <div className="flex items-center gap-3">
            <div className="grid size-11 place-items-center rounded-xl border border-cyan-300/25 bg-gradient-to-br from-blue-500 via-violet-500 to-cyan-400 text-sm font-black text-white shadow-[0_0_28px_rgba(59,130,246,0.46)]">
                AI
            </div>
            <h1 className="text-base font-black leading-tight tracking-tight text-slate-50">
                Find Video <span className="block text-cyan-100">Trending</span>
            </h1>
        </div>
    );

    const languageSwitcher = (
        <div className="flex items-center justify-between rounded-xl border border-cyan-300/15 bg-slate-950/70 p-1 shadow-inner shadow-blue-950/40">
            {(['vi', 'en'] as const).map((item) => (
                <button
                    key={item}
                    type="button"
                    onClick={() => setLanguage(item)}
                    className={`flex-1 rounded-lg px-2 py-1.5 text-xs font-bold uppercase transition-all ${language === item
                        ? 'bg-blue-600/70 text-cyan-50 shadow-[0_0_18px_rgba(59,130,246,0.35)] ring-1 ring-cyan-300/25'
                        : 'text-slate-400 hover:text-slate-100'
                        }`}
                >
                    {item}
                </button>
            ))}
        </div>
    );

    return (
        <>
            <header className="fixed inset-x-0 top-0 z-30 border-b border-cyan-300/10 bg-slate-950/88 px-4 py-3 backdrop-blur-xl md:hidden">
                <div className="flex items-center justify-between gap-3">
                    <div className="shrink-0">{brand}</div>
                    <div className="w-28">{languageSwitcher}</div>
                </div>
            </header>

            <aside className="fixed left-0 top-0 z-20 hidden h-full w-56 flex-col border-r border-cyan-300/10 bg-slate-950/78 shadow-[18px_0_55px_rgba(0,0,0,0.32)] backdrop-blur-xl md:flex">
                <div className="border-b border-cyan-300/10 px-5 py-6">{brand}</div>
                <nav className="flex-1 px-3 py-5">
                    {navItems.map((item) => {
                        const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
                        return (
                            <Link
                                key={item.href}
                                href={item.href}
                                className={`${NAV_LINK_BASE} ${isActive ? NAV_LINK_ACTIVE : NAV_LINK_IDLE}`}
                            >
                                <span className={`grid size-7 place-items-center rounded-lg text-xs font-black ${isActive ? 'bg-blue-500/30 text-cyan-100' : 'bg-slate-900 text-slate-500'}`}>
                                    {item.icon}
                                </span>
                                <span>{item.label[language]}</span>
                            </Link>
                        );
                    })}
                </nav>
                <div className="border-t border-cyan-300/10 px-5 py-4">
                    <div className="mb-3">{languageSwitcher}</div>
                    <button
                        onClick={handleLogout}
                        disabled={isLoggingOut}
                        className="mb-3 w-full rounded-xl bg-gradient-to-r from-rose-600 to-red-500 px-3 py-3 text-xs font-bold text-white shadow-[0_0_22px_rgba(244,63,94,0.28)] transition-all hover:from-rose-500 hover:to-red-400 disabled:opacity-50"
                    >
                        {isLoggingOut
                            ? language === 'vi' ? 'Đang đăng xuất...' : 'Signing out...'
                            : language === 'vi' ? 'Đăng xuất' : 'Sign out'}
                    </button>
                    <div className="text-xs font-medium text-slate-500">MVP v1.0</div>
                </div>
            </aside>

            <nav className="fixed inset-x-0 bottom-0 z-30 flex gap-1 overflow-x-auto border-t border-cyan-300/10 bg-slate-950/92 px-1 py-1 shadow-[0_-12px_30px_rgba(0,0,0,0.35)] backdrop-blur-xl md:hidden">
                {navItems.map((item) => {
                    const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
                    return (
                        <Link
                            key={item.href}
                            href={item.href}
                            className={`${MOBILE_NAV_BASE} ${isActive
                                ? 'bg-blue-500/20 text-cyan-100 ring-1 ring-blue-400/35'
                                : 'text-slate-300'
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
