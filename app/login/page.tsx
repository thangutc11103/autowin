"use client";

import { useState } from "react";

export default function LoginPage() {
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ login, password }),
      });
      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(result.error || "Login failed");
      }

      window.location.href = "/discover";
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Login failed");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-4 py-8">
      <section className="mb-6 w-full max-w-sm text-center">
        <p className="text-xs font-semibold uppercase text-blue-700">
          AutoWin Content Dashboard
        </p>
        <h1 className="mt-2 text-2xl font-bold text-gray-950">
          Đăng nhập cổng quản trị nội bộ
        </h1>
        <p className="mt-2 text-sm leading-6 text-gray-600">
          Chỉ tài khoản được cấp quyền mới có thể truy cập. Trang này không
          phải trang đăng nhập của Facebook, Instagram, TikTok hay YouTube.
        </p>
      </section>

      <form
        onSubmit={submit}
        className="w-full max-w-sm rounded-lg border border-gray-200 bg-white p-6 shadow-sm"
      >
        <h2 className="text-lg font-bold text-gray-950">Tài khoản AutoWin</h2>
        <p className="mt-1 text-sm text-gray-500">
          Đăng nhập bằng tài khoản nội bộ do quản trị viên AutoWin cấp.
        </p>
        <div className="mt-5 space-y-4">
          <label className="block">
            <span className="text-xs font-semibold uppercase text-gray-500">
              Tên đăng nhập hoặc email
            </span>
            <input
              value={login}
              onChange={(event) => setLogin(event.target.value)}
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
              autoComplete="username"
              inputMode="email"
            />
          </label>
          <label className="block">
            <span className="text-xs font-semibold uppercase text-gray-500">
              Mật khẩu nội bộ
            </span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
              autoComplete="current-password"
            />
          </label>
        </div>

        {message ? (
          <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {message}
          </div>
        ) : null}

        <button
          type="submit"
          disabled={isSubmitting}
          className="mt-5 w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:bg-blue-300"
        >
          {isSubmitting ? "Đang đăng nhập" : "Đăng nhập"}
        </button>
      </form>

      <footer className="mt-8 max-w-sm text-center text-xs leading-5 text-gray-500">
        <p className="mb-2">
          AutoWin sử dụng API chính thức của các nền tảng sau khi bạn kết nối
          tài khoản trong dashboard.
        </p>
        <a href="/privacy-policy" className="text-blue-600 hover:underline">
          Privacy Policy
        </a>
        <span> | </span>
        <a href="/terms-of-service" className="text-blue-600 hover:underline">
          Terms of Service
        </a>
      </footer>
    </main>
  );
}
