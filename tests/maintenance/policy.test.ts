import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import { getMaintenanceDecision } from "@/lib/maintenance/policy";
import { createMaintenanceResponse } from "@/lib/maintenance/response";
import { createDefaultMaintenanceState } from "@/lib/maintenance/state";

test("allows static assets and health routes", () => {
  for (const pathname of [
    "/_next/static/chunk.js",
    "/_next/image",
    "/favicon.ico",
    "/robots.txt",
    "/sitemap.xml",
    "/manifest.webmanifest",
    "/images/logo.svg",
    "/api/health",
    "/api/health/redis",
  ]) {
    assert.equal(
      getMaintenanceDecision({ pathname, hasSessionCookie: false }),
      "allow",
      pathname,
    );
  }
});

test("only allows control and session routes with a session cookie", () => {
  for (const pathname of [
    "/maintenance-control",
    "/api/admin/maintenance",
    "/api/auth/me",
    "/api/auth/logout",
  ]) {
    assert.equal(
      getMaintenanceDecision({ pathname, hasSessionCookie: true }),
      "allow",
      pathname,
    );
    assert.equal(
      getMaintenanceDecision({ pathname, hasSessionCookie: false }),
      pathname.startsWith("/api/") ? "block-api" : "block-page",
      pathname,
    );
  }
});

test("blocks normal pages, login flows, and business APIs", () => {
  for (const pathname of ["/", "/login", "/discover", "/privacy"]) {
    assert.equal(
      getMaintenanceDecision({ pathname, hasSessionCookie: false }),
      "block-page",
    );
  }

  for (const pathname of [
    "/api/videos",
    "/api/auth/login",
    "/api/auth/google/callback",
    "/api/export/report.json",
  ]) {
    assert.equal(
      getMaintenanceDecision({ pathname, hasSessionCookie: false }),
      "block-api",
    );
  }
});

test("creates escaped HTML maintenance responses", async () => {
  const request = new NextRequest("https://example.com/discover");
  const response = createMaintenanceResponse(request, {
    ...createDefaultMaintenanceState(),
    enabled: true,
    title: '<script>alert("x")</script>',
    message: "We'll be back & ready <soon>",
    estimatedEndAt: "2026-07-21T11:00:00.000Z",
  });
  const body = await response.text();

  assert.equal(response.status, 503);
  assert.match(response.headers.get("content-type") ?? "", /text\/html/);
  assert.equal(response.headers.get("retry-after"), "300");
  assert.equal(response.headers.get("cache-control"), "no-store, max-age=0");
  assert.equal(response.headers.get("x-robots-tag"), "noindex, nofollow");
  assert.doesNotMatch(body, /<script>/);
  assert.match(body, /&lt;script&gt;alert\(&quot;x&quot;\)&lt;\/script&gt;/);
  assert.match(body, /We&#39;ll be back &amp; ready &lt;soon&gt;/);
});

test("creates structured JSON maintenance responses for APIs", async () => {
  const request = new NextRequest("https://example.com/api/videos");
  const state = { ...createDefaultMaintenanceState(), enabled: true };
  const response = createMaintenanceResponse(request, state);

  assert.equal(response.status, 503);
  assert.match(response.headers.get("content-type") ?? "", /application\/json/);
  assert.equal(response.headers.get("retry-after"), "300");
  assert.deepEqual(await response.json(), {
    error: "Service unavailable",
    code: "MAINTENANCE_MODE",
    maintenance: {
      title: state.title,
      message: state.message,
      estimatedEndAt: null,
    },
  });
});
