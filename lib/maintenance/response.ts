import { NextResponse, type NextRequest } from "next/server";
import type { MaintenanceState } from "@/lib/maintenance/types";

const MAINTENANCE_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
  "Retry-After": "300",
  "X-Robots-Tag": "noindex, nofollow",
};

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return entities[character];
  });
}

function renderMaintenanceHtml(
  request: NextRequest,
  state: MaintenanceState,
): string {
  const title = escapeHtml(state.title);
  const message = escapeHtml(state.message);
  const reloadPath = escapeHtml(request.nextUrl.pathname || "/");
  const estimatedEnd = state.estimatedEndAt
    ? `<div class="eta"><span>Dự kiến hoạt động lại</span><time datetime="${escapeHtml(
        state.estimatedEndAt,
      )}">${escapeHtml(state.estimatedEndAt)}</time></div>`
    : "";

  return `<!doctype html>
<html lang="vi">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex,nofollow">
  <title>${title}</title>
  <style>
    :root { color-scheme: light; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 24px; color: #17211b; background: #f3f1ea; }
    main { width: min(100%, 680px); border: 1px solid #d9d5ca; border-radius: 24px; background: #fffdf8; padding: clamp(28px, 6vw, 56px); box-shadow: 0 24px 70px rgba(38, 47, 41, .10); }
    .status { display: inline-flex; align-items: center; gap: 9px; margin-bottom: 34px; border: 1px solid #d9d5ca; border-radius: 999px; padding: 8px 12px; color: #59635d; font-size: 13px; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; }
    .dot { width: 9px; height: 9px; border-radius: 50%; background: #d79036; box-shadow: 0 0 0 5px #f8ead7; }
    h1 { margin: 0; max-width: 560px; font-family: Georgia, "Times New Roman", serif; font-size: clamp(38px, 8vw, 66px); font-weight: 500; line-height: .98; letter-spacing: -.045em; }
    p { margin: 26px 0 0; max-width: 540px; color: #5d665f; font-size: clamp(16px, 2.5vw, 19px); line-height: 1.7; }
    .eta { display: grid; gap: 6px; margin-top: 30px; border-left: 3px solid #d79036; padding: 4px 0 4px 16px; }
    .eta span { color: #7b837d; font-size: 12px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; }
    .eta time { font-size: 15px; font-weight: 700; }
    footer { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 18px; margin-top: 42px; padding-top: 24px; border-top: 1px solid #e5e1d8; }
    footer small { color: #858b86; }
    a { display: inline-flex; align-items: center; justify-content: center; border-radius: 999px; background: #1f4d39; padding: 11px 18px; color: white; font-size: 14px; font-weight: 750; text-decoration: none; }
    a:hover { background: #183d2e; }
    a:focus-visible { outline: 3px solid #d79036; outline-offset: 3px; }
  </style>
</head>
<body>
  <main>
    <div class="status"><span class="dot"></span>Đang bảo trì</div>
    <h1>${title}</h1>
    <p>${message}</p>
    ${estimatedEnd}
    <footer>
      <small>Cảm ơn bạn đã kiên nhẫn.</small>
      <a href="${reloadPath}">Thử tải lại</a>
    </footer>
  </main>
</body>
</html>`;
}

export function createMaintenanceResponse(
  request: NextRequest,
  state: MaintenanceState,
): NextResponse {
  if (request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json(
      {
        error: "Service unavailable",
        code: "MAINTENANCE_MODE",
        maintenance: {
          title: state.title,
          message: state.message,
          estimatedEndAt: state.estimatedEndAt,
        },
      },
      { status: 503, headers: MAINTENANCE_HEADERS },
    );
  }

  return new NextResponse(renderMaintenanceHtml(request, state), {
    status: 503,
    headers: {
      ...MAINTENANCE_HEADERS,
      "Content-Type": "text/html; charset=utf-8",
    },
  });
}
