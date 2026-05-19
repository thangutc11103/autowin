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
import { oauthStorage } from "@/lib/oauth-storage";
import { getTenantIdFromRequest } from "@/lib/tenant-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isFeatureKey(value: unknown): value is FeatureKey {
  return typeof value === "string" && FEATURE_KEYS.includes(value as FeatureKey);
}

function normalizePermissions(value: unknown): UserPermissionInput[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is Record<string, unknown> => {
      return typeof item === "object" && item !== null && isFeatureKey(item.featureKey);
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

export async function GET(request: Request) {
  const adminError = await requireAdmin(request);
  if (adminError) return adminError;

  const tenantId = getTenantIdFromRequest(request);
  const [users, features, connectedAccounts] = await Promise.all([
    listManagedUsers(tenantId),
    listFeatureDefinitions(),
    oauthStorage.getStoredAccounts({ tenantId }),
  ]);

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
}

export async function POST(request: Request) {
  const adminError = await requireAdmin(request);
  if (adminError) return adminError;

  const tenantId = getTenantIdFromRequest(request);
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const id = typeof body.id === "string" ? body.id.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : null;
  const displayName =
    typeof body.displayName === "string" ? body.displayName.trim() : null;
  const role = typeof body.role === "string" ? (body.role as UserRole) : "viewer";
  const status =
    body.status === "suspended" ? ("suspended" as UserStatus) : ("active" as UserStatus);

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
}
