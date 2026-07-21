import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import { handleProxyRequest } from "@/lib/maintenance/proxy-handler";
import { createDefaultMaintenanceState } from "@/lib/maintenance/state";
import type { MaintenanceSnapshot } from "@/lib/maintenance/types";

function snapshot(enabled: boolean): MaintenanceSnapshot {
  return {
    state: { ...createDefaultMaintenanceState(), enabled },
    source: enabled ? "redis" : "default",
    environmentForced: false,
    stale: false,
  };
}

function request(pathname: string, session = false): NextRequest {
  return new NextRequest(`https://example.com${pathname}`, {
    headers: session ? { cookie: "autowin_session=test-session" } : undefined,
  });
}

test("disabled maintenance preserves existing authentication behavior", async () => {
  const dependencies = {
    getMaintenanceState: async () => snapshot(false),
  };

  const pageResponse = await handleProxyRequest(request("/discover"), dependencies);
  assert.equal(pageResponse.status, 307);
  assert.equal(pageResponse.headers.get("location"), "https://example.com/login");

  const apiResponse = await handleProxyRequest(request("/api/videos"), dependencies);
  assert.equal(apiResponse.status, 401);
  assert.deepEqual(await apiResponse.json(), { error: "Authentication required" });

  const sessionResponse = await handleProxyRequest(
    request("/discover", true),
    dependencies,
  );
  assert.equal(sessionResponse.status, 200);
  assert.equal(sessionResponse.headers.get("x-middleware-next"), "1");
});

test("enabled maintenance blocks ordinary pages and APIs", async () => {
  const dependencies = {
    getMaintenanceState: async () => snapshot(true),
  };

  for (const pathname of ["/", "/login", "/discover"]) {
    const response = await handleProxyRequest(request(pathname), dependencies);
    assert.equal(response.status, 503, pathname);
    assert.match(response.headers.get("content-type") ?? "", /text\/html/);
  }

  const apiResponse = await handleProxyRequest(
    request("/api/videos", true),
    dependencies,
  );
  assert.equal(apiResponse.status, 503);
  assert.equal((await apiResponse.json()).code, "MAINTENANCE_MODE");
});

test("enabled maintenance preserves health and authenticated control routing", async () => {
  const dependencies = {
    getMaintenanceState: async () => snapshot(true),
  };

  const health = await handleProxyRequest(request("/api/health"), dependencies);
  assert.equal(health.status, 200);
  assert.equal(health.headers.get("x-middleware-next"), "1");

  const control = await handleProxyRequest(
    request("/maintenance-control", true),
    dependencies,
  );
  assert.equal(control.status, 200);
  assert.equal(control.headers.get("x-middleware-next"), "1");

  const noSession = await handleProxyRequest(
    request("/maintenance-control"),
    dependencies,
  );
  assert.equal(noSession.status, 503);
});
