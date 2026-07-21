import assert from "node:assert/strict";
import test from "node:test";
import {
  createDefaultMaintenanceState,
  isMaintenanceEnvironmentForced,
  MaintenanceValidationError,
  normalizeMaintenanceUpdate,
  parseStoredMaintenanceState,
  resolveEnvironmentMaintenanceState,
} from "@/lib/maintenance/state";

test("creates deterministic disabled defaults", () => {
  assert.deepEqual(createDefaultMaintenanceState(), {
    version: 1,
    enabled: false,
    title: "Hệ thống đang được bảo trì",
    message: "Chúng tôi đang nâng cấp hệ thống. Vui lòng quay lại sau.",
    estimatedEndAt: null,
    updatedAt: "1970-01-01T00:00:00.000Z",
    updatedBy: "system",
  });
});

test("normalizes an update and preserves omitted copy", () => {
  const baseState = createDefaultMaintenanceState();
  const state = normalizeMaintenanceUpdate(
    {
      enabled: true,
      title: "  Đang   nâng cấp  ",
      message: " Vui lòng\n quay lại   sau ",
      estimatedEndAt: "2026-07-21T18:00:00+07:00",
      updatedBy: " admin-1 ",
    },
    {
      baseState,
      now: () => new Date("2026-07-21T10:00:00.000Z"),
    },
  );

  assert.deepEqual(state, {
    version: 1,
    enabled: true,
    title: "Đang nâng cấp",
    message: "Vui lòng quay lại sau",
    estimatedEndAt: "2026-07-21T11:00:00.000Z",
    updatedAt: "2026-07-21T10:00:00.000Z",
    updatedBy: "admin-1",
  });

  const copied = normalizeMaintenanceUpdate(
    { enabled: false, updatedBy: "cli:test" },
    { baseState: state, now: () => new Date("2026-07-21T10:01:00.000Z") },
  );
  assert.equal(copied.title, state.title);
  assert.equal(copied.message, state.message);
  assert.equal(copied.estimatedEndAt, state.estimatedEndAt);
});

test("rejects invalid updates", () => {
  const invalidUpdates: unknown[] = [
    null,
    {},
    { enabled: "true", updatedBy: "admin" },
    { enabled: true, title: "   ", updatedBy: "admin" },
    { enabled: true, message: "   ", updatedBy: "admin" },
    { enabled: true, title: "x".repeat(121), updatedBy: "admin" },
    { enabled: true, message: "x".repeat(1001), updatedBy: "admin" },
    { enabled: true, estimatedEndAt: "tomorrow", updatedBy: "admin" },
    { enabled: true, updatedBy: "   " },
  ];

  for (const input of invalidUpdates) {
    assert.throws(
      () => normalizeMaintenanceUpdate(input),
      MaintenanceValidationError,
    );
  }
});

test("parses only versioned, valid stored state", () => {
  const valid = {
    version: 1,
    enabled: true,
    title: "Bảo trì",
    message: "Quay lại sau",
    estimatedEndAt: null,
    updatedAt: "2026-07-21T10:00:00.000Z",
    updatedBy: "admin",
  };

  assert.deepEqual(parseStoredMaintenanceState(JSON.stringify(valid)), valid);
  assert.throws(() => parseStoredMaintenanceState("{"), MaintenanceValidationError);
  assert.throws(
    () => parseStoredMaintenanceState(JSON.stringify({ ...valid, version: 2 })),
    MaintenanceValidationError,
  );
  assert.throws(
    () => parseStoredMaintenanceState(JSON.stringify({ ...valid, updatedAt: "bad" })),
    MaintenanceValidationError,
  );
});

test("recognizes supported environment truthy values", () => {
  for (const value of ["true", "TRUE", "1", "yes", "on"]) {
    assert.equal(isMaintenanceEnvironmentForced({ MAINTENANCE_MODE: value }), true);
  }
  for (const value of [undefined, "", "false", "0", "no", "off"]) {
    assert.equal(isMaintenanceEnvironmentForced({ MAINTENANCE_MODE: value }), false);
  }
});

test("environment override forces maintenance and selectively replaces copy", () => {
  const base = normalizeMaintenanceUpdate(
    {
      enabled: false,
      title: "Stored title",
      message: "Stored message",
      estimatedEndAt: "2026-07-22T00:00:00.000Z",
      updatedBy: "admin",
    },
    { now: () => new Date("2026-07-21T10:00:00.000Z") },
  );

  assert.equal(
    resolveEnvironmentMaintenanceState(base, { MAINTENANCE_MODE: "false" }),
    base,
  );

  const forced = resolveEnvironmentMaintenanceState(base, {
    MAINTENANCE_MODE: "true",
    MAINTENANCE_TITLE: " Emergency   maintenance ",
    MAINTENANCE_MESSAGE: "Try again later",
    MAINTENANCE_UNTIL: "2026-07-21T18:00:00+07:00",
  });
  assert.equal(forced.enabled, true);
  assert.equal(forced.title, "Emergency maintenance");
  assert.equal(forced.message, "Try again later");
  assert.equal(forced.estimatedEndAt, "2026-07-21T11:00:00.000Z");
  assert.equal(forced.updatedBy, "environment");
});

test("invalid environment copy cannot disable a forced state", () => {
  const base = createDefaultMaintenanceState();
  const forced = resolveEnvironmentMaintenanceState(base, {
    MAINTENANCE_MODE: "1",
    MAINTENANCE_TITLE: " ",
    MAINTENANCE_MESSAGE: "x".repeat(1001),
    MAINTENANCE_UNTIL: "invalid",
  });

  assert.equal(forced.enabled, true);
  assert.equal(forced.title, base.title);
  assert.equal(forced.message, base.message);
  assert.equal(forced.estimatedEndAt, null);
});
