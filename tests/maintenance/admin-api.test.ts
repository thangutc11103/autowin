import assert from "node:assert/strict";
import test from "node:test";
import type { CurrentUser } from "@/lib/auth/session-auth";
import { createMaintenanceAdminApi } from "@/lib/maintenance/admin-api";
import {
  MaintenanceEnvironmentOverrideError,
  MaintenanceValidationError,
  createDefaultMaintenanceState,
} from "@/lib/maintenance/state";
import type {
  MaintenanceServiceContract,
  MaintenanceSnapshot,
  MaintenanceUpdate,
} from "@/lib/maintenance/types";

const adminUser: CurrentUser = {
  id: "user-admin",
  email: "admin@example.com",
  displayName: "Admin",
  tenantId: "default",
  role: "admin",
  status: "active",
  sessionId: "session-1",
  deviceId: "device-1",
};

function defaultSnapshot(): MaintenanceSnapshot {
  return {
    state: createDefaultMaintenanceState(),
    source: "default",
    environmentForced: false,
    stale: false,
  };
}

class FakeService implements MaintenanceServiceContract {
  snapshot = defaultSnapshot();
  updateError: Error | null = null;
  readError: Error | null = null;
  updates: MaintenanceUpdate[] = [];

  async getRedisState(): Promise<MaintenanceSnapshot> {
    return this.snapshot;
  }

  async getEffectiveState(): Promise<MaintenanceSnapshot> {
    if (this.readError) throw this.readError;
    return this.snapshot;
  }

  async updateState(input: MaintenanceUpdate): Promise<MaintenanceSnapshot> {
    if (this.updateError) throw this.updateError;
    this.updates.push(input);
    this.snapshot = {
      ...this.snapshot,
      source: "redis",
      state: { ...this.snapshot.state, ...input, version: 1 },
    };
    return this.snapshot;
  }

  invalidateCache(): void {}
  async close(): Promise<void> {}
}

function createHarness(options: {
  denied?: Response | null;
  user?: CurrentUser | null;
  requestUserId?: string | null;
} = {}) {
  const service = new FakeService();
  let currentUserCalls = 0;
  const api = createMaintenanceAdminApi({
    requireAdmin: async () => options.denied ?? null,
    getCurrentUser: async () => {
      currentUserCalls += 1;
      return options.user === undefined ? adminUser : options.user;
    },
    getRequestUserId: () => options.requestUserId ?? null,
    service,
    logger: { error() {} },
  });
  return { api, service, getCurrentUserCalls: () => currentUserCalls };
}

test("returns authorization responses before reading state", async () => {
  for (const denied of [
    Response.json({ error: "Authentication required" }, { status: 401 }),
    Response.json({ error: "Admin permission required" }, { status: 403 }),
  ]) {
    const { api, service } = createHarness({ denied });
    const response = await api.get(new Request("https://example.com/api/admin/maintenance"));
    assert.equal(response.status, denied.status);
    assert.equal(service.updates.length, 0);
  }
});

test("authorized GET returns a no-store effective snapshot", async () => {
  const { api } = createHarness();
  const response = await api.get(
    new Request("https://example.com/api/admin/maintenance"),
  );

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(await response.json(), defaultSnapshot());
});

test("authorized PUT uses the session user as updater", async () => {
  const { api, service } = createHarness({ user: adminUser });
  const response = await api.put(
    new Request("https://example.com/api/admin/maintenance", {
      method: "PUT",
      body: JSON.stringify({
        enabled: true,
        title: "Deploying",
        message: "Return later",
        estimatedEndAt: null,
        updatedBy: "attacker-controlled",
      }),
      headers: { "content-type": "application/json" },
    }),
  );

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(service.updates.length, 1);
  assert.deepEqual(service.updates[0], {
    enabled: true,
    title: "Deploying",
    message: "Return later",
    estimatedEndAt: null,
    updatedBy: "user-admin",
  });
});

test("Basic-auth identity avoids an unnecessary session lookup", async () => {
  const { api, service, getCurrentUserCalls } = createHarness({
    user: null,
    requestUserId: "ops-admin",
  });
  const response = await api.put(
    new Request("https://example.com/api/admin/maintenance", {
      method: "PUT",
      body: JSON.stringify({ enabled: false }),
    }),
  );

  assert.equal(response.status, 200);
  assert.equal(service.updates[0].updatedBy, "ops-admin");
  assert.equal(getCurrentUserCalls(), 0);
});

test("maps malformed JSON and validation failures to 400", async () => {
  const malformed = createHarness();
  const malformedResponse = await malformed.api.put(
    new Request("https://example.com/api/admin/maintenance", {
      method: "PUT",
      body: "{",
    }),
  );
  assert.equal(malformedResponse.status, 400);

  const invalid = createHarness();
  invalid.service.updateError = new MaintenanceValidationError("enabled must be a boolean");
  const invalidResponse = await invalid.api.put(
    new Request("https://example.com/api/admin/maintenance", {
      method: "PUT",
      body: JSON.stringify({ enabled: "yes" }),
    }),
  );
  assert.equal(invalidResponse.status, 400);
  assert.deepEqual(await invalidResponse.json(), {
    error: "enabled must be a boolean",
  });
});

test("maps environment override conflict to 409", async () => {
  const { api, service } = createHarness();
  service.updateError = new MaintenanceEnvironmentOverrideError();
  const response = await api.put(
    new Request("https://example.com/api/admin/maintenance", {
      method: "PUT",
      body: JSON.stringify({ enabled: false }),
    }),
  );

  assert.equal(response.status, 409);
  assert.match((await response.json()).error, /MAINTENANCE_MODE/);
});

test("maps service failures to a generic 503", async () => {
  const getHarness = createHarness();
  getHarness.service.readError = new Error("redis password leaked here");
  const getResponse = await getHarness.api.get(
    new Request("https://example.com/api/admin/maintenance"),
  );
  assert.equal(getResponse.status, 503);
  assert.deepEqual(await getResponse.json(), { error: "Maintenance service unavailable" });

  const putHarness = createHarness();
  putHarness.service.updateError = new Error("redis offline");
  const putResponse = await putHarness.api.put(
    new Request("https://example.com/api/admin/maintenance", {
      method: "PUT",
      body: JSON.stringify({ enabled: true }),
    }),
  );
  assert.equal(putResponse.status, 503);
});
