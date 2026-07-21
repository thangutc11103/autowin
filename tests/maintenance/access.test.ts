import assert from "node:assert/strict";
import test from "node:test";
import { isMaintenanceAdmin } from "@/lib/maintenance/policy";

test("only owner and admin can render maintenance controls", () => {
  assert.equal(isMaintenanceAdmin({ role: "owner" }), true);
  assert.equal(isMaintenanceAdmin({ role: "admin" }), true);
  assert.equal(isMaintenanceAdmin({ role: "editor" }), false);
  assert.equal(isMaintenanceAdmin({ role: "viewer" }), false);
  assert.equal(isMaintenanceAdmin({ role: "unknown" }), false);
  assert.equal(isMaintenanceAdmin(null), false);
  assert.equal(isMaintenanceAdmin(undefined), false);
});
