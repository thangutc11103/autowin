"use client";

/* eslint-disable react-hooks/exhaustive-deps, react-hooks/set-state-in-effect */

import { useEffect, useMemo, useState } from "react";
import { useLanguageStore } from "@/store/language.store";

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

interface AuthMeResponse {
  user?: {
    role?: Role | string | null;
  } | null;
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

const TEXT = {
  vi: {
    title: "Quản trị",
    description: "Quản lý người dùng, vai trò và quyền truy cập tính năng cho tenant này.",
    newUser: "Người dùng mới",
    users: "Người dùng",
    noUsers: "Chưa có người dùng được quản lý.",
    noEmail: "Chưa có email",
    userAccess: "Quyền truy cập người dùng",
    userId: "Mã người dùng",
    email: "Email",
    displayName: "Tên hiển thị",
    password: "Mật khẩu",
    role: "Vai trò",
    status: "Trạng thái",
    placeholderUser: "user_123 hoặc email",
    placeholderName: "Thành viên đội",
    placeholderPasswordNew: "Tối thiểu 8 ký tự",
    placeholderPasswordEdit: "Để trống nếu giữ nguyên",
    featurePermissions: "Quyền tính năng",
    accountPermissions: "Quyền tài khoản",
    noAccounts: "Chưa có tài khoản nào được kết nối.",
    signOutDevices: "Đăng xuất thiết bị",
    saving: "Đang lưu",
    saveAccess: "Lưu quyền",
    saved: "Đã lưu quyền người dùng.",
    sessionsRevoked: "Đã thu hồi phiên đăng nhập.",
    failedRevoke: "Không thể thu hồi phiên đăng nhập",
    requiredUser: "Cần nhập mã người dùng.",
    failedSave: "Không thể lưu người dùng",
    failedLoad: "Không thể tải người dùng",
    accountActions: { canView: "Xem", canPost: "Đăng", canEdit: "Sửa" },
  },
  en: {
    title: "Admin",
    description: "Manage users, roles, and feature access for this tenant.",
    newUser: "New user",
    users: "Users",
    noUsers: "No managed users yet.",
    noEmail: "No email",
    userAccess: "User access",
    userId: "User ID",
    email: "Email",
    displayName: "Display name",
    password: "Password",
    role: "Role",
    status: "Status",
    placeholderUser: "user_123 or email",
    placeholderName: "Team member",
    placeholderPasswordNew: "Min 8 characters",
    placeholderPasswordEdit: "Leave blank to keep",
    featurePermissions: "Feature permissions",
    accountPermissions: "Account permissions",
    noAccounts: "No connected accounts yet.",
    signOutDevices: "Sign out devices",
    saving: "Saving",
    saveAccess: "Save access",
    saved: "User permissions saved.",
    sessionsRevoked: "User sessions revoked.",
    failedRevoke: "Failed to revoke sessions",
    requiredUser: "User id is required.",
    failedSave: "Failed to save user",
    failedLoad: "Failed to load users",
    accountActions: { canView: "View", canPost: "Post", canEdit: "Edit" },
  },
};

export default function AdminPage() {
  const language = useLanguageStore((state) => state.language);
  const text = TEXT[language];
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [featureKeys, setFeatureKeys] = useState<string[]>(defaultFeatures);
  const [connectedAccounts, setConnectedAccounts] = useState<ConnectedAccount[]>([]);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [currentUserRole, setCurrentUserRole] = useState<Role | null>(null);
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
  const isAdminManagingOwner =
    currentUserRole === "admin" && selectedUser?.role === "owner";
  const ownerProtectedMessage =
    language === "vi"
      ? "Chỉ owner mới có thể xử lý tài khoản owner."
      : "Only owner can manage an owner account.";

  async function loadUsers() {
    try {
      const response = await fetch("/api/admin/users", { cache: "no-store" });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
        throw new Error(error?.error || `Failed to load users: ${response.status}`);
      }

      const result = await response.json();
      console.log("[Admin Users API]", result);

      setUsers(result.users || []);
      setFeatureKeys(result.featureKeys || defaultFeatures);
      setConnectedAccounts(result.connectedAccounts || []);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : text.failedLoad;
      console.error("[loadUsers error]", errorMessage, error);
      throw error;
    }
  }

  useEffect(() => {
    void Promise.all([
      fetch("/api/auth/me", { cache: "no-store" })
        .then(async (response) => {
          if (!response.ok) return null;
          return (await response.json()) as AuthMeResponse;
        })
        .then((result) => {
          const role = result?.user?.role;
          if (role === "owner" || role === "admin" || role === "editor" || role === "viewer") {
            setCurrentUserRole(role);
          }
        }),
      loadUsers(),
    ]).catch((error) => {
      setMessage(error instanceof Error ? error.message : text.failedLoad);
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
      setMessage(text.requiredUser);
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
      setMessage(text.saved);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : text.failedSave);
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
      <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6 sm:py-6">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-950">{text.title}</h1>
            <p className="mt-1 text-sm text-gray-500">
              {text.description}
            </p>
          </div>
          <button
            type="button"
            onClick={resetForm}
            className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-100"
          >
            {text.newUser}
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
              <h2 className="text-sm font-bold text-gray-950">{text.users}</h2>
            </div>
            <div className="divide-y divide-gray-100">
              {users.length === 0 ? (
                <div className="px-4 py-8 text-sm text-gray-500">
                  {text.noUsers}
                </div>
              ) : (
                users.map((user) => (
                  <button
                    key={user.id}
                    type="button"
                    onClick={() => setSelectedUserId(user.id)}
                    className={`block w-full px-4 py-3 text-left text-sm hover:bg-gray-50 ${selectedUserId === user.id ? "bg-blue-50" : ""
                      }`}
                  >
                    <div className="font-semibold text-gray-950">{user.id}</div>
                    <div className="mt-1 text-gray-500">
                      {user.email || text.noEmail} - {user.role} - {user.status}
                    </div>
                  </button>
                ))
              )}
            </div>
          </section>

          <section className="rounded-lg border border-gray-200 bg-white">
            <div className="border-b border-gray-200 px-5 py-4">
              <h2 className="text-sm font-bold text-gray-950">{text.userAccess}</h2>
            </div>
            <div className="grid gap-4 p-5 md:grid-cols-2">
              <label className="block">
                <span className="text-xs font-semibold uppercase text-gray-500">
                  {text.userId}
                </span>
                <input
                  value={form.id}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, id: event.target.value }))
                  }
                  className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none focus:border-blue-500"
                  placeholder={text.placeholderUser}
                />
              </label>

              <label className="block">
                <span className="text-xs font-semibold uppercase text-gray-500">
                  {text.email}
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
                  {text.displayName}
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
                  placeholder={text.placeholderName}
                />
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-xs font-semibold uppercase text-gray-500">
                    {text.password}
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
                    placeholder={selectedUser ? text.placeholderPasswordEdit : text.placeholderPasswordNew}
                  />
                </label>

                <label className="block">
                  <span className="text-xs font-semibold uppercase text-gray-500">
                    {text.role}
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
                    {text.status}
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
                {text.featurePermissions}
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
                {text.accountPermissions}
              </h3>
              {connectedAccounts.length === 0 ? (
                <div className="rounded-md border border-gray-200 px-3 py-3 text-sm text-gray-500">
                  {text.noAccounts}
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
                                <span>{text.accountActions[field]}</span>
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
                    if (isAdminManagingOwner) {
                      setMessage(ownerProtectedMessage);
                      return;
                    }

                    setMessage(null);
                    const response = await fetch("/api/admin/users", {
                      method: "DELETE",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ userId: selectedUser.id }),
                    });
                    const result = await response.json().catch(() => ({}));
                    setMessage(
                      response.ok
                        ? text.sessionsRevoked
                        : result.error || text.failedRevoke,
                    );
                  }}
                  disabled={isAdminManagingOwner}
                  title={isAdminManagingOwner ? ownerProtectedMessage : undefined}
                  className="mr-3 rounded-md border border-red-200 bg-white px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {text.signOutDevices}
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => void saveUser()}
                disabled={isSaving}
                className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
              >
                {isSaving ? text.saving : text.saveAccess}
              </button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
