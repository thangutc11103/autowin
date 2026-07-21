import assert from "node:assert/strict";
import test from "node:test";
import {
  MaintenanceCliUsageError,
  parseMaintenanceCliArgs,
  runMaintenanceCli,
} from "@/lib/maintenance/cli";
import { createDefaultMaintenanceState } from "@/lib/maintenance/state";
import type {
  MaintenanceServiceContract,
  MaintenanceSnapshot,
  MaintenanceUpdate,
} from "@/lib/maintenance/types";

class FakeService implements MaintenanceServiceContract {
  redisSnapshot: MaintenanceSnapshot = {
    state: createDefaultMaintenanceState(),
    source: "default",
    environmentForced: false,
    stale: false,
  };
  effectiveSnapshot = this.redisSnapshot;
  updates: MaintenanceUpdate[] = [];
  error: Error | null = null;
  closeCalls = 0;

  async getRedisState(): Promise<MaintenanceSnapshot> {
    if (this.error) throw this.error;
    return this.redisSnapshot;
  }

  async getEffectiveState(): Promise<MaintenanceSnapshot> {
    if (this.error) throw this.error;
    return this.effectiveSnapshot;
  }

  async updateState(update: MaintenanceUpdate): Promise<MaintenanceSnapshot> {
    if (this.error) throw this.error;
    this.updates.push(update);
    return this.effectiveSnapshot;
  }

  invalidateCache(): void {}

  async close(): Promise<void> {
    this.closeCalls += 1;
  }
}

test("parses status, on, and off commands", () => {
  assert.deepEqual(parseMaintenanceCliArgs(["status"]), { action: "status" });
  assert.deepEqual(parseMaintenanceCliArgs(["off"]), { action: "off" });
  assert.deepEqual(
    parseMaintenanceCliArgs([
      "on",
      "--title",
      "Đang nâng cấp",
      "--message",
      "Vui lòng quay lại",
      "--until",
      "2026-07-21T18:00:00+07:00",
    ]),
    {
      action: "on",
      title: "Đang nâng cấp",
      message: "Vui lòng quay lại",
      estimatedEndAt: "2026-07-21T18:00:00+07:00",
    },
  );
});

test("rejects missing commands, values, duplicate, and unknown options", () => {
  const invalidArguments = [
    [],
    ["unknown"],
    ["status", "--title", "x"],
    ["off", "--message", "x"],
    ["on", "--title"],
    ["on", "--unknown", "x"],
    ["on", "--title", "one", "--title", "two"],
  ];

  for (const argv of invalidArguments) {
    assert.throws(() => parseMaintenanceCliArgs(argv), MaintenanceCliUsageError);
  }
});

test("status prints both Redis and effective state", async () => {
  const service = new FakeService();
  service.effectiveSnapshot = {
    ...service.redisSnapshot,
    source: "environment",
    environmentForced: true,
    state: { ...service.redisSnapshot.state, enabled: true },
  };
  const output: string[] = [];
  const errors: string[] = [];

  const exitCode = await runMaintenanceCli(["status"], {
    service,
    username: "tester",
    output: (line) => output.push(line),
    errorOutput: (line) => errors.push(line),
  });

  assert.equal(exitCode, 0);
  assert.equal(errors.length, 0);
  assert.deepEqual(JSON.parse(output.join("\n")), {
    redis: service.redisSnapshot,
    effective: service.effectiveSnapshot,
  });
  assert.equal(service.closeCalls, 1);
});

test("on forwards only supplied copy fields", async () => {
  const service = new FakeService();
  const exitCode = await runMaintenanceCli(["on", "--title", "Deploying"], {
    service,
    username: "operator",
    output: () => undefined,
    errorOutput: () => undefined,
  });

  assert.equal(exitCode, 0);
  assert.deepEqual(service.updates, [
    { enabled: true, title: "Deploying", updatedBy: "cli:operator" },
  ]);
  assert.equal(service.closeCalls, 1);
});

test("off requests an immediate disable", async () => {
  const service = new FakeService();
  const exitCode = await runMaintenanceCli(["off"], {
    service,
    username: "operator",
    output: () => undefined,
    errorOutput: () => undefined,
  });

  assert.equal(exitCode, 0);
  assert.deepEqual(service.updates, [
    { enabled: false, updatedBy: "cli:operator" },
  ]);
  assert.equal(service.closeCalls, 1);
});

test("returns exit code one and always closes after failures", async () => {
  const service = new FakeService();
  service.error = new Error("redis offline");
  const errors: string[] = [];
  const exitCode = await runMaintenanceCli(["on", "--until", "not-a-date"], {
    service,
    username: "operator",
    output: () => undefined,
    errorOutput: (line) => errors.push(line),
  });

  assert.equal(exitCode, 1);
  assert.match(errors.join("\n"), /redis offline/);
  assert.equal(service.closeCalls, 1);
});

test("invalid CLI syntax also exits one and closes", async () => {
  const service = new FakeService();
  const errors: string[] = [];
  const exitCode = await runMaintenanceCli(["on", "--message"], {
    service,
    username: "operator",
    output: () => undefined,
    errorOutput: (line) => errors.push(line),
  });

  assert.equal(exitCode, 1);
  assert.match(errors.join("\n"), /Usage:/);
  assert.equal(service.closeCalls, 1);
});
