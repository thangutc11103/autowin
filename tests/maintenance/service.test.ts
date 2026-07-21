import assert from "node:assert/strict";
import test from "node:test";
import {
  MaintenanceEnvironmentOverrideError,
  normalizeMaintenanceUpdate,
} from "@/lib/maintenance/state";
import { MaintenanceService } from "@/lib/maintenance/service";
import {
  MAINTENANCE_REDIS_KEY,
  type MaintenanceKeyValueStore,
} from "@/lib/maintenance/types";

class FakeStore implements MaintenanceKeyValueStore {
  raw: string | null = null;
  getError: Error | null = null;
  setError: Error | null = null;
  getCalls = 0;
  setCalls = 0;
  closeCalls = 0;

  async get(key: string): Promise<string | null> {
    assert.equal(key, MAINTENANCE_REDIS_KEY);
    this.getCalls += 1;
    if (this.getError) throw this.getError;
    return this.raw;
  }

  async set(key: string, value: string): Promise<void> {
    assert.equal(key, MAINTENANCE_REDIS_KEY);
    this.setCalls += 1;
    if (this.setError) throw this.setError;
    this.raw = value;
  }

  async close(): Promise<void> {
    this.closeCalls += 1;
  }
}

function createHarness(environment: Record<string, string | undefined> = {}) {
  const store = new FakeStore();
  let currentTime = new Date("2026-07-21T10:00:00.000Z");
  const warnings: string[] = [];
  const service = new MaintenanceService({
    store,
    environment,
    now: () => currentTime,
    cacheTtlMs: 2_000,
    warningIntervalMs: 30_000,
    logger: {
      warn(message) {
        warnings.push(message);
      },
    },
  });

  return {
    service,
    store,
    warnings,
    advance(milliseconds: number) {
      currentTime = new Date(currentTime.getTime() + milliseconds);
    },
  };
}

test("uses disabled defaults for a missing Redis record", async () => {
  const { service } = createHarness();
  const snapshot = await service.getRedisState();

  assert.equal(snapshot.source, "default");
  assert.equal(snapshot.state.enabled, false);
  assert.equal(snapshot.stale, false);
  assert.equal(snapshot.environmentForced, false);
});

test("caches Redis reads for two seconds and supports a fresh read", async () => {
  const { service, store, advance } = createHarness();
  store.raw = JSON.stringify(
    normalizeMaintenanceUpdate(
      { enabled: true, title: "Cached", updatedBy: "admin" },
      { now: () => new Date("2026-07-21T09:00:00.000Z") },
    ),
  );

  assert.equal((await service.getRedisState()).state.title, "Cached");
  assert.equal((await service.getRedisState()).state.title, "Cached");
  assert.equal(store.getCalls, 1);

  await service.getRedisState({ fresh: true });
  assert.equal(store.getCalls, 2);

  advance(2_001);
  await service.getRedisState();
  assert.equal(store.getCalls, 3);
});

test("persists updates, timestamps them, and invalidates the old snapshot", async () => {
  const { service, store } = createHarness();
  const updated = await service.updateState({
    enabled: true,
    title: "Deploying",
    message: "Please return later",
    estimatedEndAt: null,
    updatedBy: "admin-7",
  });

  assert.equal(store.setCalls, 1);
  assert.equal(updated.source, "redis");
  assert.equal(updated.state.updatedAt, "2026-07-21T10:00:00.000Z");
  assert.equal(updated.state.updatedBy, "admin-7");
  assert.deepEqual(JSON.parse(store.raw ?? "null"), updated.state);

  const read = await service.getRedisState();
  assert.equal(read.state.title, "Deploying");
});

test("uses last-known state when Redis later fails", async () => {
  const { service, store, advance, warnings } = createHarness();
  store.raw = JSON.stringify(
    normalizeMaintenanceUpdate(
      { enabled: true, updatedBy: "admin" },
      { now: () => new Date("2026-07-21T09:00:00.000Z") },
    ),
  );
  await service.getRedisState();
  advance(2_001);
  store.getError = new Error("redis offline");

  const snapshot = await service.getRedisState();
  assert.equal(snapshot.source, "last-known");
  assert.equal(snapshot.state.enabled, true);
  assert.equal(snapshot.stale, true);
  assert.equal(warnings.length, 1);
});

test("a fresh process fails open when Redis is unavailable", async () => {
  const { service, store } = createHarness();
  store.getError = new Error("redis offline");

  const snapshot = await service.getRedisState();
  assert.equal(snapshot.source, "default");
  assert.equal(snapshot.state.enabled, false);
  assert.equal(snapshot.stale, true);
});

test("environment override stays active during a Redis failure", async () => {
  const { service, store } = createHarness({
    MAINTENANCE_MODE: "true",
    MAINTENANCE_TITLE: "Emergency",
  });
  store.getError = new Error("redis offline");

  const snapshot = await service.getEffectiveState();
  assert.equal(snapshot.source, "environment");
  assert.equal(snapshot.environmentForced, true);
  assert.equal(snapshot.state.enabled, true);
  assert.equal(snapshot.state.title, "Emergency");
});

test("cannot disable an environment-forced state", async () => {
  const { service, store } = createHarness({ MAINTENANCE_MODE: "1" });

  await assert.rejects(
    service.updateState({ enabled: false, updatedBy: "admin" }),
    MaintenanceEnvironmentOverrideError,
  );
  assert.equal(store.setCalls, 0);
});

test("throttles Redis warnings", async () => {
  const { service, store, advance, warnings } = createHarness();
  store.getError = new Error("redis offline");

  await service.getRedisState({ fresh: true });
  await service.getRedisState({ fresh: true });
  advance(29_999);
  await service.getRedisState({ fresh: true });
  assert.equal(warnings.length, 1);

  advance(1);
  await service.getRedisState({ fresh: true });
  assert.equal(warnings.length, 2);
});

test("closes its backing store", async () => {
  const { service, store } = createHarness();
  await service.close();
  assert.equal(store.closeCalls, 1);
});
