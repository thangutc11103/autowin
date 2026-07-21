"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { MaintenanceSnapshot } from "@/lib/maintenance/types";

function toLocalInput(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function formatTimestamp(value: string | null): string {
  if (!value) return "Chưa đặt thời gian";
  const date = new Date(value);
  if (date.getTime() === 0) return "Chưa có lần cập nhật";
  return new Intl.DateTimeFormat("vi-VN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

async function readError(response: Response): Promise<string> {
  const payload = (await response.json().catch(() => null)) as {
    error?: string;
  } | null;
  return payload?.error || `Yêu cầu thất bại với mã ${response.status}`;
}

export default function MaintenanceControl() {
  const [snapshot, setSnapshot] = useState<MaintenanceSnapshot | null>(null);
  const [title, setTitle] = useState("");
  const [visitorMessage, setVisitorMessage] = useState("");
  const [estimatedEndAt, setEstimatedEndAt] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function applySnapshot(next: MaintenanceSnapshot) {
    setSnapshot(next);
    setTitle(next.state.title);
    setVisitorMessage(next.state.message);
    setEstimatedEndAt(toLocalInput(next.state.estimatedEndAt));
  }

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const response = await fetch("/api/admin/maintenance", {
          cache: "no-store",
        });
        if (!response.ok) throw new Error(await readError(response));
        const next = (await response.json()) as MaintenanceSnapshot;
        if (!cancelled) applySnapshot(next);
      } catch (loadError) {
        if (!cancelled) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Không thể tải trạng thái bảo trì.",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  async function save(enabled: boolean) {
    if (!snapshot || snapshot.environmentForced) return;
    if (
      enabled &&
      !snapshot.state.enabled &&
      !window.confirm(
        "Bật bảo trì sẽ chặn toàn bộ trang và API nghiệp vụ. Bạn có muốn tiếp tục?",
      )
    ) {
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/maintenance", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled,
          title,
          message: visitorMessage,
          estimatedEndAt: estimatedEndAt
            ? new Date(estimatedEndAt).toISOString()
            : null,
        }),
      });
      if (!response.ok) throw new Error(await readError(response));
      applySnapshot((await response.json()) as MaintenanceSnapshot);
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Không thể cập nhật trạng thái bảo trì.",
      );
    } finally {
      setSaving(false);
    }
  }

  const active = snapshot?.state.enabled ?? false;
  const locked = snapshot?.environmentForced ?? false;

  return (
    <main className="min-h-[100dvh] bg-slate-100 text-slate-950">
      <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8 lg:py-10">
        <header className="mb-8 flex flex-wrap items-center justify-between gap-4 border-b border-slate-300 pb-5">
          <div>
            <p className="text-sm font-semibold text-slate-600">Find App</p>
            <h1 className="mt-1 text-3xl font-bold tracking-tight sm:text-4xl">
              Điều khiển bảo trì
            </h1>
          </div>
          <Link
            href="/admin"
            className="rounded-lg border border-slate-400 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 active:translate-y-px"
          >
            Trở lại quản trị
          </Link>
        </header>

        {loading ? (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(300px,0.85fr)]">
            <div className="h-[540px] animate-pulse rounded-2xl bg-slate-200 motion-reduce:animate-none" />
            <div className="h-[380px] animate-pulse rounded-2xl bg-slate-200 motion-reduce:animate-none" />
          </div>
        ) : snapshot ? (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(300px,0.85fr)]">
            <section className="rounded-2xl border border-slate-300 bg-white p-5 shadow-sm shadow-slate-300/30 sm:p-7">
              <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-5">
                <div>
                  <div
                    role="status"
                    className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-bold ${
                      active
                        ? "bg-amber-100 text-amber-900"
                        : "bg-emerald-100 text-emerald-900"
                    }`}
                  >
                    <span
                      aria-hidden="true"
                      className={`h-2.5 w-2.5 rounded-full ${
                        active ? "bg-amber-600" : "bg-emerald-700"
                      }`}
                    />
                    {active ? "Đang bật bảo trì" : "Website đang hoạt động"}
                  </div>
                  <p className="mt-3 text-sm text-slate-600">
                    Nguồn điều khiển: {locked ? "Biến môi trường" : "Redis"}
                  </p>
                </div>
                <div className="text-right text-xs leading-5 text-slate-500">
                  <p>{formatTimestamp(snapshot.state.updatedAt)}</p>
                  <p>Cập nhật bởi {snapshot.state.updatedBy}</p>
                </div>
              </div>

              {locked ? (
                <div className="mt-5 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm leading-6 text-amber-950">
                  <p className="font-bold">Đang bị khóa bởi MAINTENANCE_MODE.</p>
                  <p className="mt-1">
                    Hãy đặt biến này thành false hoặc xóa biến, sau đó khởi động lại tiến trình web.
                  </p>
                </div>
              ) : null}

              {error ? (
                <div
                  role="alert"
                  className="mt-5 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm font-medium text-red-900"
                >
                  {error}
                </div>
              ) : null}

              <div className="mt-6 grid gap-5">
                <label className="grid gap-2 text-sm font-semibold text-slate-800">
                  Tiêu đề
                  <input
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    maxLength={120}
                    disabled={locked || saving}
                    className="w-full rounded-lg border border-slate-400 bg-white px-3.5 py-3 text-base font-normal text-slate-950 outline-none transition focus:border-blue-700 focus:ring-2 focus:ring-blue-200 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
                  />
                  <span className="text-xs font-normal text-slate-500">
                    {title.length}/120 ký tự
                  </span>
                </label>

                <label className="grid gap-2 text-sm font-semibold text-slate-800">
                  Thông báo cho khách truy cập
                  <textarea
                    value={visitorMessage}
                    onChange={(event) => setVisitorMessage(event.target.value)}
                    maxLength={1000}
                    rows={5}
                    disabled={locked || saving}
                    className="w-full resize-y rounded-lg border border-slate-400 bg-white px-3.5 py-3 text-base font-normal leading-7 text-slate-950 outline-none transition focus:border-blue-700 focus:ring-2 focus:ring-blue-200 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
                  />
                  <span className="text-xs font-normal text-slate-500">
                    {visitorMessage.length}/1000 ký tự
                  </span>
                </label>

                <label className="grid gap-2 text-sm font-semibold text-slate-800">
                  Thời gian hoạt động lại dự kiến
                  <input
                    type="datetime-local"
                    value={estimatedEndAt}
                    onChange={(event) => setEstimatedEndAt(event.target.value)}
                    disabled={locked || saving}
                    className="w-full rounded-lg border border-slate-400 bg-white px-3.5 py-3 text-base font-normal text-slate-950 outline-none transition focus:border-blue-700 focus:ring-2 focus:ring-blue-200 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
                  />
                  <span className="text-xs font-normal text-slate-500">
                    Có thể để trống nếu chưa xác định thời gian.
                  </span>
                </label>
              </div>

              <div className="mt-7 flex flex-wrap gap-3 border-t border-slate-200 pt-5">
                {active ? (
                  <>
                    <button
                      type="button"
                      onClick={() => void save(true)}
                      disabled={locked || saving}
                      className="rounded-lg bg-blue-700 px-5 py-3 text-sm font-bold text-white transition hover:bg-blue-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 focus-visible:ring-offset-2 active:translate-y-px disabled:cursor-not-allowed disabled:bg-slate-400"
                    >
                      {saving ? "Đang lưu" : "Lưu nội dung"}
                    </button>
                    <button
                      type="button"
                      onClick={() => void save(false)}
                      disabled={locked || saving}
                      className="rounded-lg border border-emerald-700 bg-white px-5 py-3 text-sm font-bold text-emerald-800 transition hover:bg-emerald-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 focus-visible:ring-offset-2 active:translate-y-px disabled:cursor-not-allowed disabled:border-slate-300 disabled:text-slate-400"
                    >
                      Tắt bảo trì
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => void save(true)}
                    disabled={locked || saving}
                    className="rounded-lg bg-amber-700 px-5 py-3 text-sm font-bold text-white transition hover:bg-amber-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-700 focus-visible:ring-offset-2 active:translate-y-px disabled:cursor-not-allowed disabled:bg-slate-400"
                  >
                    {saving ? "Đang bật" : "Bật bảo trì"}
                  </button>
                )}
              </div>
            </section>

            <aside className="lg:sticky lg:top-8 lg:self-start">
              <div className="rounded-2xl bg-slate-950 p-6 text-slate-100 shadow-xl shadow-slate-400/20 sm:p-8">
                <p className="text-sm font-semibold text-slate-400">Xem trước trang khách</p>
                <div className="mt-10 h-2.5 w-2.5 rounded-full bg-amber-500" aria-hidden="true" />
                <h2 className="mt-5 text-3xl font-bold tracking-tight">
                  {title || "Tiêu đề bảo trì"}
                </h2>
                <p className="mt-4 whitespace-pre-wrap text-base leading-7 text-slate-300">
                  {visitorMessage || "Thông báo sẽ xuất hiện tại đây."}
                </p>
                <div className="mt-8 border-t border-slate-700 pt-5 text-sm text-slate-400">
                  {estimatedEndAt
                    ? `Dự kiến: ${formatTimestamp(new Date(estimatedEndAt).toISOString())}`
                    : "Chưa đặt thời gian hoạt động lại"}
                </div>
              </div>
              <p className="mt-4 px-1 text-sm leading-6 text-slate-600">
                Khi bật, trang thông thường trả về HTML 503 và API nghiệp vụ trả về JSON 503. Health check và trang điều khiển này vẫn hoạt động.
              </p>
            </aside>
          </div>
        ) : (
          <section className="rounded-2xl border border-red-300 bg-white p-8">
            <h2 className="text-xl font-bold">Không thể tải trang điều khiển</h2>
            <p className="mt-2 text-slate-600">
              Kiểm tra kết nối Redis hoặc dùng lệnh terminal để khôi phục website.
            </p>
          </section>
        )}
      </div>
    </main>
  );
}
