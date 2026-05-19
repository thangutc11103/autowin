"use client";

/* eslint-disable react-hooks/set-state-in-effect */

import { useEffect, useMemo, useState } from "react";

type Role = "owner" | "admin" | "editor" | "viewer";
type Status = "active" | "suspended";

interface Permission {
  featureKey: string;
  enabled: boolean;
}

interface AccountPermission {
  accountKey: string;
  canView: boolean;
  canPost: boolean;
  canEdit: boolean;
}

interface ConnectedAccount {
  key: string;
  platform: string;
  handle?: string | null;
  label?: string | null;
  displayName?: string | null;
}

interface ManagedUser {
  id: string;
  email?: string | null;
  display_name?: string | null;
  status: Status;
  role: Role;
  permissions: Permission[];
  account_permissions?: AccountPermission[];
}

const roleOptions: Role[] = ["viewer", "editor", "admin", "owner"];
const defaultFeatures = [
  "scrape_tiktok",
  "scrape_instagram",
  "scrape_youtube",
  "scrape_facebook",
  "upload_media",
  "queue_post",
  "publish_tiktok",
  "publish_facebook",
  "ai_video_edit",
];

export default function AdminPage() {
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [featureKeys, setFeatureKeys] = useState<string[]>(defaultFeatures);
  const [connectedAccounts, setConnectedAccounts] = useState<ConnectedAccount[]>([]);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [form, setForm] = useState({
    id: "",
    email: "",
    displayName: "",
    password: "",
    role: "viewer" as Role,
    status: "active" as Status,
    permissions: new Set<string>(),
    accountPermissions: new Map<string, AccountPermission>(),
  });

  const selectedUser = useMemo(
    () => users.find((user) => user.id === selectedUserId) || null,
    [selectedUserId, users],
  );

  async function loadUsers() {
    const response = await fetch("/api/admin/users", { cache: "no-store" });
    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || "Failed to load users");
    }

    setUsers(result.users || []);
    setFeatureKeys(result.featureKeys || defaultFeatures);
    setConnectedAccounts(result.connectedAccounts || []);
  }

  useEffect(() => {
    loadUsers().catch((error) => {
      setMessage(error instanceof Error ? error.message : "Failed to load users");
    });
  }, []);

  useEffect(() => {
    if (!selectedUser) return;

    setForm({
      id: selectedUser.id,
      email: selectedUser.email || "",
      displayName: selectedUser.display_name || "",
      password: "",
      role: selectedUser.role,
      status: selectedUser.status,
      permissions: new Set(
        (selectedUser.permissions || [])
          .filter((permission) => permission.enabled)
          .map((permission) => permission.featureKey),
      ),
      accountPermissions: new Map(
        (selectedUser.account_permissions || []).map((permission) => [
          permission.accountKey,
          permission,
        ]),
      ),
    });
  }, [selectedUser]);

  function toggleFeature(featureKey: string) {
    setForm((current) => {
      const permissions = new Set(current.permissions);
      if (permissions.has(featureKey)) {
        permissions.delete(featureKey);
      } else {
        permissions.add(featureKey);
      }

      return { ...current, permissions };
    });
  }

  function toggleAccountPermission(
    accountKey: string,
    field: keyof Pick<AccountPermission, "canView" | "canPost" | "canEdit">,
  ) {
    setForm((current) => {
      const accountPermissions = new Map(current.accountPermissions);
      const currentPermission = accountPermissions.get(accountKey) || {
        accountKey,
        canView: false,
        canPost: false,
        canEdit: false,
      };
      accountPermissions.set(accountKey, {
        ...currentPermission,
        [field]: !currentPermission[field],
      });

      return { ...current, accountPermissions };
    });
  }

  async function saveUser() {
    setMessage(null);

    if (!form.id.trim()) {
      setMessage("User id is required.");
      return;
    }

    setIsSaving(true);

    try {
      const response = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: form.id.trim(),
          email: form.email.trim() || null,
          displayName: form.displayName.trim() || null,
          password: form.password || undefined,
          role: form.role,
          status: form.status,
          permissions: featureKeys.map((featureKey) => ({
            featureKey,
            enabled: form.permissions.has(featureKey),
          })),
          accountPermissions: Array.from(form.accountPermissions.values()),
        }),
      });
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Failed to save user");
      }

      setUsers(result.users || []);
      setSelectedUserId(form.id.trim());
      setMessage("User permissions saved.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to save user");
    } finally {
      setIsSaving(false);
    }
  }

  function resetForm() {
    setSelectedUserId("");
    setForm({
      id: "",
      email: "",
      displayName: "",
      password: "",
      role: "viewer",
      status: "active",
      permissions: new Set<string>(),
      accountPermissions: new Map<string, AccountPermission>(),
    });
  }

  return (
    <div className="h-full overflow-auto bg-gray-50">
      <div className="mx-auto max-w-7xl px-6 py-6">
        <div className="mb-5 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-950">Admin</h1>
            <p className="mt-1 text-sm text-gray-500">
              Manage users, roles, and feature access for this tenant.
            </p>
          </div>
          <button
            type="button"
            onClick={resetForm}
            className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-100"
          >
            New user
          </button>
        </div>

        {message ? (
          <div className="mb-4 rounded-md border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
            {message}
          </div>
        ) : null}

        <div className="grid gap-5 lg:grid-cols-[360px_1fr]">
          <section className="rounded-lg border border-gray-200 bg-white">
            <div className="border-b border-gray-200 px-4 py-3">
              <h2 className="text-sm font-bold text-gray-950">Users</h2>
            </div>
            <div className="divide-y divide-gray-100">
              {users.length === 0 ? (
                <div className="px-4 py-8 text-sm text-gray-500">
                  No managed users yet.
                </div>
              ) : (
                users.map((user) => (
                  <button
                    key={user.id}
                    type="button"
                    onClick={() => setSelectedUserId(user.id)}
                    className={`block w-full px-4 py-3 text-left text-sm hover:bg-gray-50 ${
                      selectedUserId === user.id ? "bg-blue-50" : ""
                    }`}
                  >
                    <div className="font-semibold text-gray-950">{user.id}</div>
                    <div className="mt-1 text-gray-500">
                      {user.email || "No email"} - {user.role} - {user.status}
                    </div>
                  </button>
                ))
              )}
            </div>
          </section>

          <section className="rounded-lg border border-gray-200 bg-white">
            <div className="border-b border-gray-200 px-5 py-4">
              <h2 className="text-sm font-bold text-gray-950">User access</h2>
            </div>
            <div className="grid gap-4 p-5 md:grid-cols-2">
              <label className="block">
                <span className="text-xs font-semibold uppercase text-gray-500">
                  User ID
                </span>
                <input
                  value={form.id}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, id: event.target.value }))
                  }
                  className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none focus:border-blue-500"
                  placeholder="user_123 or email"
                />
              </label>

              <label className="block">
                <span className="text-xs font-semibold uppercase text-gray-500">
                  Email
                </span>
                <input
                  value={form.email}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, email: event.target.value }))
                  }
                  className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none focus:border-blue-500"
                  placeholder="user@example.com"
                />
              </label>

              <label className="block">
                <span className="text-xs font-semibold uppercase text-gray-500">
                  Display name
                </span>
                <input
                  value={form.displayName}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      displayName: event.target.value,
                    }))
                  }
                  className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none focus:border-blue-500"
                  placeholder="Team member"
                />
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-xs font-semibold uppercase text-gray-500">
                    Password
                  </span>
                  <input
                    type="password"
                    value={form.password}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        password: event.target.value,
                      }))
                    }
                    className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none focus:border-blue-500"
                    placeholder={selectedUser ? "Leave blank to keep" : "Min 8 characters"}
                  />
                </label>

                <label className="block">
                  <span className="text-xs font-semibold uppercase text-gray-500">
                    Role
                  </span>
                  <select
                    value={form.role}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        role: event.target.value as Role,
                      }))
                    }
                    className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none focus:border-blue-500"
                  >
                    {roleOptions.map((role) => (
                      <option key={role} value={role}>
                        {role}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <span className="text-xs font-semibold uppercase text-gray-500">
                    Status
                  </span>
                  <select
                    value={form.status}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        status: event.target.value as Status,
                      }))
                    }
                    className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none focus:border-blue-500"
                  >
                    <option value="active">active</option>
                    <option value="suspended">suspended</option>
                  </select>
                </label>
              </div>
            </div>

            <div className="border-t border-gray-200 px-5 py-4">
              <h3 className="mb-3 text-sm font-bold text-gray-950">
                Feature permissions
              </h3>
              <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                {featureKeys.map((featureKey) => (
                  <label
                    key={featureKey}
                    className="flex items-center gap-2 rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-700"
                  >
                    <input
                      type="checkbox"
                      checked={form.permissions.has(featureKey)}
                      onChange={() => toggleFeature(featureKey)}
                      className="h-4 w-4"
                    />
                    <span>{featureKey}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="border-t border-gray-200 px-5 py-4">
              <h3 className="mb-3 text-sm font-bold text-gray-950">
                Account permissions
              </h3>
              {connectedAccounts.length === 0 ? (
                <div className="rounded-md border border-gray-200 px-3 py-3 text-sm text-gray-500">
                  No connected accounts yet.
                </div>
              ) : (
                <div className="space-y-2">
                  {connectedAccounts.map((account) => {
                    const permission = form.accountPermissions.get(account.key);
                    const label =
                      account.label ||
                      account.displayName ||
                      account.handle ||
                      account.key;

                    return (
                      <div
                        key={account.key}
                        className="grid gap-3 rounded-md border border-gray-200 px-3 py-3 text-sm md:grid-cols-[1fr_auto]"
                      >
                        <div>
                          <div className="font-semibold text-gray-900">
                            {label}
                          </div>
                          <div className="mt-1 text-xs text-gray-500">
                            {account.platform} - {account.key}
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-3">
                          {(["canView", "canPost", "canEdit"] as const).map(
                            (field) => (
                              <label
                                key={field}
                                className="flex items-center gap-1 text-gray-700"
                              >
                                <input
                                  type="checkbox"
                                  checked={Boolean(permission?.[field])}
                                  onChange={() =>
                                    toggleAccountPermission(account.key, field)
                                  }
                                  className="h-4 w-4"
                                />
                                <span>{field.replace("can", "")}</span>
                              </label>
                            ),
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="flex items-center justify-end border-t border-gray-200 px-5 py-4">
              {selectedUser ? (
                <button
                  type="button"
                  onClick={async () => {
                    setMessage(null);
                    const response = await fetch("/api/admin/users", {
                      method: "DELETE",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ userId: selectedUser.id }),
                    });
                    const result = await response.json().catch(() => ({}));
                    setMessage(
                      response.ok
                        ? "User sessions revoked."
                        : result.error || "Failed to revoke sessions",
                    );
                  }}
                  className="mr-3 rounded-md border border-red-200 bg-white px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-50"
                >
                  Sign out devices
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => void saveUser()}
                disabled={isSaving}
                className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
              >
                {isSaving ? "Saving" : "Save access"}
              </button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
