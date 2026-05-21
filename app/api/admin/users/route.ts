import {
  FEATURE_KEYS,
  listFeatureDefinitions,
  listManagedUsers,
  requireAdmin,
  upsertManagedUser,
  type AccountPermissionInput,
  type FeatureKey,
  type UserPermissionInput,
  type UserRole,
  type UserStatus,
} from "@/lib/auth/access-control";
import { hashPassword, revokeUserSessions } from "@/lib/auth/session-auth";
import { oauthStorage } from "@/lib/oauth-storage";
import { getTenantIdFromRequest } from "@/lib/tenant-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isFeatureKey(value: unknown): value is FeatureKey {
  return (
    typeof value === "string" && FEATURE_KEYS.includes(value as FeatureKey)
  );
}

function normalizePermissions(value: unknown): UserPermissionInput[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is Record<string, unknown> => {
      return (
        typeof item === "object" &&
        item !== null &&
        isFeatureKey(item.featureKey)
      );
    })
    .map((item) => ({
      featureKey: item.featureKey as FeatureKey,
      enabled: Boolean(item.enabled),
      limitValue:
        typeof item.limitValue === "number" && Number.isFinite(item.limitValue)
          ? item.limitValue
          : null,
      expiresAt:
        typeof item.expiresAt === "string" && item.expiresAt.trim()
          ? item.expiresAt
          : null,
    }));
}

function normalizeAccountPermissions(value: unknown): AccountPermissionInput[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is Record<string, unknown> => {
      return (
        typeof item === "object" &&
        item !== null &&
        typeof item.accountKey === "string" &&
        item.accountKey.trim().length > 0
      );
    })
    .map((item) => ({
      accountKey: String(item.accountKey).trim(),
      canView: Boolean(item.canView),
      canPost: Boolean(item.canPost),
      canEdit: Boolean(item.canEdit),
    }));
}

function getPasswordHash(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0) {
    return null;
  }

  if (value.length < 8) {
    throw new Error("Password must be at least 8 characters");
  }

  return hashPassword(value);
}

export async function GET(request: Request) {
  try {
    const adminError = await requireAdmin(request);
    if (adminError) return adminError;

    const tenantId = getTenantIdFromRequest(request);
    console.log("[GET /api/admin/users] Loading for tenantId:", tenantId);

    const [users, features, connectedAccounts] = await Promise.all([
      listManagedUsers(tenantId),
      listFeatureDefinitions(),
      oauthStorage.getStoredAccounts({ tenantId }),
    ]);

    console.log("[GET /api/admin/users] Found users:", users.length, "records");

    return Response.json({
      tenantId,
      featureKeys: FEATURE_KEYS,
      features,
      connectedAccounts: connectedAccounts.map((account) => ({
        key: account.key,
        platform: account.platform,
        handle: account.handle,
        label: account.label,
        displayName: account.displayName,
        connectedAt: account.connectedAt,
      })),
      users,
    });
  } catch (error) {
    console.error("[GET /api/admin/users]", error);
    return Response.json(
      {
        error: error instanceof Error ? error.message : "Failed to load users",
      },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const adminError = await requireAdmin(request);
    if (adminError) return adminError;

    const tenantId = getTenantIdFromRequest(request);
    const body = (await request.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    const id = typeof body.id === "string" ? body.id.trim() : "";
    const email =
      typeof body.email === "string" ? body.email.trim().toLowerCase() : null;
    const displayName =
      typeof body.displayName === "string" ? body.displayName.trim() : null;
    const role =
      typeof body.role === "string" ? (body.role as UserRole) : "viewer";
    const status =
      body.status === "suspended"
        ? ("suspended" as UserStatus)
        : ("active" as UserStatus);
    let passwordHash: string | null = null;

    try {
      passwordHash = getPasswordHash(body.password);
    } catch (error) {
      return Response.json(
        { error: error instanceof Error ? error.message : "Invalid password" },
        { status: 400 },
      );
    }

    if (!id) {
      return Response.json({ error: "User id is required" }, { status: 400 });
    }

    if (!["owner", "admin", "editor", "viewer"].includes(role)) {
      return Response.json({ error: "Invalid role" }, { status: 400 });
    }

    await upsertManagedUser({
      id,
      email,
      displayName,
      passwordHash,
      status,
      tenantId,
      role,
      permissions: normalizePermissions(body.permissions),
      accountPermissions: normalizeAccountPermissions(body.accountPermissions),
    });

    const users = await listManagedUsers(tenantId);

    return Response.json({
      success: true,
      tenantId,
      users,
    });
  } catch (error) {
    console.error("[POST /api/admin/users]", error);
    return Response.json(
      {
        error: error instanceof Error ? error.message : "Failed to create user",
      },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const adminError = await requireAdmin(request);
    if (adminError) return adminError;

    const tenantId = getTenantIdFromRequest(request);
    const body = (await request.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    const userId = typeof body.userId === "string" ? body.userId.trim() : "";

    if (!userId) {
      return Response.json({ error: "User id is required" }, { status: 400 });
    }

    await revokeUserSessions({ tenantId, userId });
    return Response.json({ success: true });
  } catch (error) {
    console.error("[DELETE /api/admin/users]", error);
    return Response.json(
      {
        error: error instanceof Error ? error.message : "Failed to delete user",
      },
      { status: 500 },
    );
  }
}
