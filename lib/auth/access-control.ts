import { Pool, type PoolClient } from "pg";
import { randomUUID } from "crypto";
import type { Platform } from "@/types/video";
import { ensureTenant } from "@/lib/database/tenant-storage";
import { normalizeTenantId } from "@/lib/tenant-context";

export const FEATURE_KEYS = [
  "scrape_tiktok",
  "scrape_instagram",
  "scrape_youtube",
  "scrape_facebook",
  "scrape_douyin",
  "upload_media",
  "queue_post",
  "publish_tiktok",
  "publish_facebook",
  "publish_instagram",
  "publish_youtube",
  "ai_video_edit",
  "manage_accounts",
  "manage_users",
  "admin_panel",
] as const;

export type FeatureKey = (typeof FEATURE_KEYS)[number];
export type UserRole = "owner" | "admin" | "editor" | "viewer";
export type UserStatus = "active" | "suspended";

export interface AccessUser {
  id: string;
  email?: string | null;
  displayName?: string | null;
  status: UserStatus;
  createdAt: string;
  updatedAt: string;
}

export interface UserPermissionInput {
  featureKey: FeatureKey;
  enabled: boolean;
  limitValue?: number | null;
  expiresAt?: string | null;
}

export interface AccountPermissionInput {
  accountKey: string;
  canView?: boolean;
  canPost?: boolean;
  canEdit?: boolean;
}

let pool: Pool | null = null;
let schemaPromise: Promise<void> | null = null;

function getConnectionString(): string {
  const connectionString =
    process.env.SUPABASE_DATABASE_URL || process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error("Missing SUPABASE_DATABASE_URL or DATABASE_URL");
  }

  return connectionString;
}

function shouldUseSsl(connectionString: string): boolean {
  try {
    const url = new URL(connectionString);
    return (
      url.hostname.endsWith(".supabase.co") ||
      url.hostname.endsWith(".neon.tech") ||
      url.searchParams.get("sslmode") === "require"
    );
  } catch {
    return true;
  }
}

function getPool(): Pool {
  if (!pool) {
    const connectionString = getConnectionString();
    pool = new Pool({
      connectionString,
      ssl: shouldUseSsl(connectionString)
        ? { rejectUnauthorized: true }
        : undefined,
      max: 5,
    });
  }

  return pool;
}

async function withClient<T>(
  callback: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await getPool().connect();

  try {
    return await callback(client);
  } finally {
    client.release();
  }
}

export async function ensureAccessControlStorage(): Promise<void> {
  if (!schemaPromise) {
    schemaPromise = withClient(async (client) => {
      await client.query(`
        CREATE TABLE IF NOT EXISTS features (
          key TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          description TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `);

      for (const featureKey of FEATURE_KEYS) {
        await client.query(
          `
            INSERT INTO features (key, name)
            VALUES ($1, $2)
            ON CONFLICT (key)
            DO UPDATE SET name = EXCLUDED.name
          `,
          [featureKey, featureKey.replace(/_/g, " ")],
        );
      }

      await client.query(`
        CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY,
          email TEXT UNIQUE,
          display_name TEXT,
          status TEXT NOT NULL DEFAULT 'active',
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `);

      await client.query(`
        CREATE TABLE IF NOT EXISTS tenant_members (
          tenant_id TEXT NOT NULL,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          role TEXT NOT NULL DEFAULT 'viewer',
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          PRIMARY KEY (tenant_id, user_id)
        );
      `);

      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_tenant_members_user_id
        ON tenant_members (user_id);
      `);

      await client.query(`
        CREATE TABLE IF NOT EXISTS user_feature_permissions (
          id TEXT PRIMARY KEY,
          tenant_id TEXT NOT NULL,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          feature_key TEXT NOT NULL REFERENCES features(key) ON DELETE CASCADE,
          enabled BOOLEAN NOT NULL DEFAULT FALSE,
          limit_value INTEGER,
          expires_at TIMESTAMPTZ,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          UNIQUE (tenant_id, user_id, feature_key)
        );
      `);

      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_user_feature_permissions_lookup
        ON user_feature_permissions (tenant_id, user_id, feature_key);
      `);

      await client.query(`
        CREATE TABLE IF NOT EXISTS user_account_permissions (
          id TEXT PRIMARY KEY,
          tenant_id TEXT NOT NULL,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          account_key TEXT NOT NULL,
          can_view BOOLEAN NOT NULL DEFAULT TRUE,
          can_post BOOLEAN NOT NULL DEFAULT FALSE,
          can_edit BOOLEAN NOT NULL DEFAULT FALSE,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          UNIQUE (tenant_id, user_id, account_key)
        );
      `);

      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_user_account_permissions_lookup
        ON user_account_permissions (tenant_id, user_id, account_key);
      `);
    }).catch((error) => {
      schemaPromise = null;
      throw error;
    });
  }

  return schemaPromise;
}

function parseBasicAuth(header: string | null): {
  username: string;
  password: string;
} | null {
  if (!header?.startsWith("Basic ")) {
    return null;
  }

  try {
    const decoded = Buffer.from(header.slice("Basic ".length), "base64").toString(
      "utf8",
    );
    const separator = decoded.indexOf(":");

    if (separator < 0) {
      return null;
    }

    return {
      username: decoded.slice(0, separator),
      password: decoded.slice(separator + 1),
    };
  } catch {
    return null;
  }
}

export function isAdminRequest(request: Request): boolean {
  const adminUsername = process.env.ADMIN_USERNAME;
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (!adminUsername || !adminPassword) {
    return process.env.NODE_ENV !== "production";
  }

  const credentials = parseBasicAuth(request.headers.get("authorization"));
  return (
    credentials?.username === adminUsername &&
    credentials.password === adminPassword
  );
}

export function getRequestUserId(request: Request): string | null {
  const headerUserId = request.headers.get("x-user-id")?.trim();
  if (headerUserId) {
    return headerUserId;
  }

  const headerEmail = request.headers.get("x-user-email")?.trim();
  if (headerEmail) {
    return headerEmail.toLowerCase();
  }

  const credentials = parseBasicAuth(request.headers.get("authorization"));
  if (credentials?.username) {
    return credentials.username.toLowerCase();
  }

  return null;
}

export function getScrapeFeatureKey(platform: Platform): FeatureKey {
  return `scrape_${platform}` as FeatureKey;
}

export function getPublishFeatureKey(platform: Exclude<Platform, "douyin">): FeatureKey {
  return `publish_${platform}` as FeatureKey;
}

export async function upsertManagedUser(params: {
  id: string;
  email?: string | null;
  displayName?: string | null;
  status?: UserStatus;
  tenantId?: string;
  role?: UserRole;
  permissions?: UserPermissionInput[];
  accountPermissions?: AccountPermissionInput[];
}): Promise<void> {
  const tenantId = normalizeTenantId(params.tenantId);
  await ensureTenant(tenantId);
  await ensureAccessControlStorage();

  await withClient(async (client) => {
    await client.query("BEGIN");

    try {
      await client.query(
        `
          INSERT INTO users (id, email, display_name, status)
          VALUES ($1, $2, $3, $4)
          ON CONFLICT (id)
          DO UPDATE SET
            email = EXCLUDED.email,
            display_name = EXCLUDED.display_name,
            status = EXCLUDED.status,
            updated_at = NOW()
        `,
        [
          params.id,
          params.email ?? null,
          params.displayName ?? null,
          params.status || "active",
        ],
      );

      await client.query(
        `
          INSERT INTO tenant_members (tenant_id, user_id, role)
          VALUES ($1, $2, $3)
          ON CONFLICT (tenant_id, user_id)
          DO UPDATE SET role = EXCLUDED.role, updated_at = NOW()
        `,
        [tenantId, params.id, params.role || "viewer"],
      );

      for (const permission of params.permissions || []) {
        await client.query(
          `
            INSERT INTO user_feature_permissions (
              id,
              tenant_id,
              user_id,
              feature_key,
              enabled,
              limit_value,
              expires_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            ON CONFLICT (tenant_id, user_id, feature_key)
            DO UPDATE SET
              enabled = EXCLUDED.enabled,
              limit_value = EXCLUDED.limit_value,
              expires_at = EXCLUDED.expires_at,
              updated_at = NOW()
          `,
          [
            randomUUID(),
            tenantId,
            params.id,
            permission.featureKey,
            permission.enabled,
            permission.limitValue ?? null,
            permission.expiresAt ?? null,
          ],
        );
      }

      for (const permission of params.accountPermissions || []) {
        await client.query(
          `
            INSERT INTO user_account_permissions (
              id,
              tenant_id,
              user_id,
              account_key,
              can_view,
              can_post,
              can_edit
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            ON CONFLICT (tenant_id, user_id, account_key)
            DO UPDATE SET
              can_view = EXCLUDED.can_view,
              can_post = EXCLUDED.can_post,
              can_edit = EXCLUDED.can_edit,
              updated_at = NOW()
          `,
          [
            randomUUID(),
            tenantId,
            params.id,
            permission.accountKey,
            permission.canView ?? true,
            permission.canPost ?? false,
            permission.canEdit ?? false,
          ],
        );
      }

      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  });
}

export async function listManagedUsers(tenantIdInput?: string) {
  const tenantId = normalizeTenantId(tenantIdInput);
  await ensureAccessControlStorage();

  return withClient(async (client) => {
    const result = await client.query(
      `
        SELECT
          users.id,
          users.email,
          users.display_name,
          users.status,
          users.created_at,
          users.updated_at,
          tenant_members.tenant_id,
          tenant_members.role,
          COALESCE(
            JSONB_AGG(
              JSONB_BUILD_OBJECT(
                'featureKey', user_feature_permissions.feature_key,
                'enabled', user_feature_permissions.enabled,
                'limitValue', user_feature_permissions.limit_value,
                'expiresAt', user_feature_permissions.expires_at
              )
            ) FILTER (WHERE user_feature_permissions.feature_key IS NOT NULL),
            '[]'::JSONB
          ) AS permissions,
          COALESCE(
            (
              SELECT JSONB_AGG(
                JSONB_BUILD_OBJECT(
                  'accountKey', user_account_permissions.account_key,
                  'canView', user_account_permissions.can_view,
                  'canPost', user_account_permissions.can_post,
                  'canEdit', user_account_permissions.can_edit
                )
              )
              FROM user_account_permissions
              WHERE user_account_permissions.user_id = users.id
                AND user_account_permissions.tenant_id = tenant_members.tenant_id
            ),
            '[]'::JSONB
          ) AS account_permissions
        FROM users
        INNER JOIN tenant_members
          ON tenant_members.user_id = users.id
          AND tenant_members.tenant_id = $1
        LEFT JOIN user_feature_permissions
          ON user_feature_permissions.user_id = users.id
          AND user_feature_permissions.tenant_id = tenant_members.tenant_id
        GROUP BY users.id, tenant_members.tenant_id, tenant_members.role
        ORDER BY users.created_at DESC
      `,
      [tenantId],
    );

    return result.rows;
  });
}

export async function requireAdmin(request: Request): Promise<Response | null> {
  if (isAdminRequest(request)) {
    return null;
  }

  const userId = getRequestUserId(request);
  if (!userId) {
    return Response.json({ error: "Authentication required" }, { status: 401 });
  }

  return Response.json({ error: "Admin permission required" }, { status: 403 });
}

export async function listFeatureDefinitions(): Promise<Array<{
  key: string;
  name: string;
  description?: string | null;
}>> {
  await ensureAccessControlStorage();

  return withClient(async (client) => {
    const result = await client.query(
      `
        SELECT key, name, description
        FROM features
        ORDER BY key ASC
      `,
    );

    return result.rows;
  });
}

export async function requireFeature(params: {
  request: Request;
  tenantId?: string;
  featureKey: FeatureKey;
}): Promise<Response | null> {
  if (isAdminRequest(params.request)) {
    return null;
  }

  const userId = getRequestUserId(params.request);
  if (!userId) {
    return Response.json({ error: "Authentication required" }, { status: 401 });
  }

  const tenantId = normalizeTenantId(params.tenantId);
  await ensureAccessControlStorage();

  const allowed = await withClient(async (client) => {
    const result = await client.query(
      `
        SELECT
          users.status,
          tenant_members.role,
          user_feature_permissions.enabled,
          user_feature_permissions.expires_at
        FROM users
        INNER JOIN tenant_members
          ON tenant_members.user_id = users.id
          AND tenant_members.tenant_id = $2
        LEFT JOIN user_feature_permissions
          ON user_feature_permissions.user_id = users.id
          AND user_feature_permissions.tenant_id = $2
          AND user_feature_permissions.feature_key = $3
        WHERE users.id = $1
        LIMIT 1
      `,
      [userId, tenantId, params.featureKey],
    );

    const row = result.rows[0];
    if (!row || row.status !== "active") {
      return false;
    }

    if (row.role === "owner" || row.role === "admin") {
      return true;
    }

    if (!row.enabled) {
      return false;
    }

    if (row.expires_at && new Date(row.expires_at).getTime() < Date.now()) {
      return false;
    }

    return true;
  });

  if (!allowed) {
    return Response.json(
      { error: `Feature permission required: ${params.featureKey}` },
      { status: 403 },
    );
  }

  return null;
}

export async function requireAccountPermission(params: {
  request: Request;
  tenantId?: string;
  accountKey: string;
  action: "view" | "post" | "edit";
}): Promise<Response | null> {
  if (isAdminRequest(params.request)) {
    return null;
  }

  const userId = getRequestUserId(params.request);
  if (!userId) {
    return Response.json({ error: "Authentication required" }, { status: 401 });
  }

  const tenantId = normalizeTenantId(params.tenantId);
  await ensureAccessControlStorage();

  const allowed = await withClient(async (client) => {
    const result = await client.query(
      `
        SELECT
          users.status,
          tenant_members.role,
          user_account_permissions.can_view,
          user_account_permissions.can_post,
          user_account_permissions.can_edit
        FROM users
        INNER JOIN tenant_members
          ON tenant_members.user_id = users.id
          AND tenant_members.tenant_id = $2
        LEFT JOIN user_account_permissions
          ON user_account_permissions.user_id = users.id
          AND user_account_permissions.tenant_id = $2
          AND user_account_permissions.account_key = $3
        WHERE users.id = $1
        LIMIT 1
      `,
      [userId, tenantId, params.accountKey],
    );

    const row = result.rows[0];
    if (!row || row.status !== "active") {
      return false;
    }

    if (row.role === "owner" || row.role === "admin") {
      return true;
    }

    if (params.action === "view") return Boolean(row.can_view);
    if (params.action === "post") return Boolean(row.can_post);
    return Boolean(row.can_edit);
  });

  if (!allowed) {
    return Response.json(
      { error: `Account permission required: ${params.action}` },
      { status: 403 },
    );
  }

  return null;
}
