import { randomUUID } from "crypto";
import { Pool, type PoolClient } from "pg";
import type { Video } from "@/types/video";
import { ensureTenant } from "@/lib/database/tenant-storage";
import { normalizeTenantId } from "@/lib/tenant-context";

export type UserVideoItemStatus = "selected" | "ready";

export interface UserVideoItemRecord {
  id: string;
  tenantId: string;
  userId: string;
  sourceVideoId: string | null;
  status: UserVideoItemStatus;
  video: Video;
  preparedUrl: string | null;
  r2Key: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UpsertUserVideoItemInput {
  tenantId?: string;
  userId: string;
  sourceVideoId?: string | null;
  status: UserVideoItemStatus;
  video: Video;
  preparedUrl?: string | null;
  r2Key?: string | null;
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

    pool.on("error", (error: Error) => {
      console.error("[USER_VIDEO_ITEMS] Unexpected pool error:", error.message);
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

export async function ensureUserVideoItemStorage(): Promise<void> {
  if (!schemaPromise) {
    schemaPromise = withClient(async (client) => {
      await client.query(`
        CREATE TABLE IF NOT EXISTS user_video_items (
          id TEXT PRIMARY KEY,
          tenant_id TEXT NOT NULL,
          user_id TEXT NOT NULL,
          source_video_id TEXT,
          status TEXT NOT NULL,
          video_payload JSONB NOT NULL,
          prepared_url TEXT,
          r2_key TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `);

      await client.query(`
        ALTER TABLE user_video_items
        ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'default';
      `);

      await client.query(`
        ALTER TABLE user_video_items
        ADD COLUMN IF NOT EXISTS user_id TEXT NOT NULL DEFAULT '';
      `);

      await client.query(`
        ALTER TABLE user_video_items
        ADD COLUMN IF NOT EXISTS source_video_id TEXT;
      `);

      await client.query(`
        ALTER TABLE user_video_items
        ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'selected';
      `);

      await client.query(`
        ALTER TABLE user_video_items
        ADD COLUMN IF NOT EXISTS video_payload JSONB NOT NULL DEFAULT '{}'::JSONB;
      `);

      await client.query(`
        ALTER TABLE user_video_items
        ADD COLUMN IF NOT EXISTS prepared_url TEXT;
      `);

      await client.query(`
        ALTER TABLE user_video_items
        ADD COLUMN IF NOT EXISTS r2_key TEXT;
      `);

      await client.query(`
        ALTER TABLE user_video_items
        ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
      `);

      await client.query(`
        ALTER TABLE user_video_items
        ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
      `);

      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_user_video_items_tenant_user_status
        ON user_video_items (tenant_id, user_id, status, created_at DESC);
      `);

      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_user_video_items_source_video
        ON user_video_items (source_video_id);
      `);

      await client.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_user_video_items_unique_source_status
        ON user_video_items (tenant_id, user_id, source_video_id, status)
        WHERE source_video_id IS NOT NULL;
      `);
    }).catch((error) => {
      schemaPromise = null;
      throw error;
    });
  }

  return schemaPromise;
}

function mapRow(row: Record<string, unknown>): UserVideoItemRecord {
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id),
    userId: String(row.user_id),
    sourceVideoId: row.source_video_id ? String(row.source_video_id) : null,
    status: row.status as UserVideoItemStatus,
    video: row.video_payload as Video,
    preparedUrl: row.prepared_url ? String(row.prepared_url) : null,
    r2Key: row.r2_key ? String(row.r2_key) : null,
    createdAt: new Date(row.created_at as string | Date).toISOString(),
    updatedAt: new Date(row.updated_at as string | Date).toISOString(),
  };
}

export async function listUserVideoItems(params: {
  tenantId?: string;
  userId: string;
  status?: UserVideoItemStatus | null;
  limit?: number;
}): Promise<UserVideoItemRecord[]> {
  const tenantId = normalizeTenantId(params.tenantId);
  await ensureUserVideoItemStorage();

  return withClient(async (client) => {
    const values: Array<string | number> = [tenantId, params.userId];
    const conditions = ["tenant_id = $1", "user_id = $2"];

    if (params.status) {
      values.push(params.status);
      conditions.push(`status = $${values.length}`);
    }

    values.push(Math.min(Math.max(params.limit ?? 100, 1), 500));
    const limitParam = values.length;

    const result = await client.query(
      `
        SELECT
          id,
          tenant_id,
          user_id,
          source_video_id,
          status,
          video_payload,
          prepared_url,
          r2_key,
          created_at,
          updated_at
        FROM user_video_items
        WHERE ${conditions.join(" AND ")}
        ORDER BY updated_at DESC, created_at DESC
        LIMIT $${limitParam}
      `,
      values,
    );

    return result.rows.map(mapRow);
  });
}

export async function listUserVideoItemsByIds(params: {
  tenantId?: string;
  userId: string;
  ids: string[];
  status?: UserVideoItemStatus | null;
}): Promise<UserVideoItemRecord[]> {
  const tenantId = normalizeTenantId(params.tenantId);
  const ids = Array.from(new Set(params.ids.filter(Boolean)));

  if (ids.length === 0) {
    return [];
  }

  await ensureUserVideoItemStorage();

  return withClient(async (client) => {
    const values: Array<string | string[]> = [tenantId, params.userId, ids];
    const conditions = ["tenant_id = $1", "user_id = $2", "id = ANY($3::TEXT[])"];

    if (params.status) {
      values.push(params.status);
      conditions.push(`status = $${values.length}`);
    }

    const result = await client.query(
      `
        SELECT
          id,
          tenant_id,
          user_id,
          source_video_id,
          status,
          video_payload,
          prepared_url,
          r2_key,
          created_at,
          updated_at
        FROM user_video_items
        WHERE ${conditions.join(" AND ")}
        ORDER BY updated_at DESC, created_at DESC
      `,
      values,
    );

    return result.rows.map(mapRow);
  });
}

export async function getUserVideoItemById(params: {
  tenantId?: string;
  userId: string;
  id: string;
  status?: UserVideoItemStatus | null;
}): Promise<UserVideoItemRecord | null> {
  const [item] = await listUserVideoItemsByIds({
    tenantId: params.tenantId,
    userId: params.userId,
    ids: [params.id],
    status: params.status,
  });

  return item || null;
}

export async function upsertUserVideoItem(
  input: UpsertUserVideoItemInput,
): Promise<UserVideoItemRecord> {
  const tenantId = normalizeTenantId(input.tenantId);
  await ensureTenant(tenantId);
  await ensureUserVideoItemStorage();

  return withClient(async (client) => {
    const result = await client.query(
      `
        INSERT INTO user_video_items (
          id,
          tenant_id,
          user_id,
          source_video_id,
          status,
          video_payload,
          prepared_url,
          r2_key
        )
        VALUES ($1, $2, $3, $4, $5, $6::JSONB, $7, $8)
        ON CONFLICT (tenant_id, user_id, source_video_id, status)
        WHERE source_video_id IS NOT NULL
        DO UPDATE SET
          video_payload = EXCLUDED.video_payload,
          prepared_url = EXCLUDED.prepared_url,
          r2_key = EXCLUDED.r2_key,
          updated_at = NOW()
        RETURNING
          id,
          tenant_id,
          user_id,
          source_video_id,
          status,
          video_payload,
          prepared_url,
          r2_key,
          created_at,
          updated_at
      `,
      [
        randomUUID(),
        tenantId,
        input.userId,
        input.sourceVideoId ?? null,
        input.status,
        JSON.stringify(input.video),
        input.preparedUrl ?? input.video.preparedLocalUrl ?? null,
        input.r2Key ?? getStringPayloadValue(input.video.rawPayload, "r2Key"),
      ],
    );

    return mapRow(result.rows[0]);
  });
}

export async function deleteUserVideoItem(params: {
  tenantId?: string;
  userId: string;
  id: string;
}): Promise<boolean> {
  const tenantId = normalizeTenantId(params.tenantId);
  await ensureUserVideoItemStorage();

  return withClient(async (client) => {
    const result = await client.query(
      `
        DELETE FROM user_video_items
        WHERE id = $1 AND tenant_id = $2 AND user_id = $3
      `,
      [params.id, tenantId, params.userId],
    );

    return (result.rowCount || 0) > 0;
  });
}

function getStringPayloadValue(
  payload: Record<string, unknown> | undefined,
  key: string,
): string | null {
  const value = payload?.[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}
