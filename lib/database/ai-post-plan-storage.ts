import { randomUUID } from "crypto";
import { Pool, type PoolClient } from "pg";
import type { Video } from "@/types/video";
import { ensureTenant } from "@/lib/database/tenant-storage";
import { ensureUserVideoItemStorage } from "@/lib/database/video-item-storage";
import { ensurePostingStorage, type QueuePostTargetInput } from "@/lib/database/posting-storage";
import { normalizeTenantId } from "@/lib/tenant-context";

export type AiPostPlanStatus = "draft" | "approved";
export type AiPostPlanItemStatus = "draft" | "approved";

export interface AiPostPlanItemRecord {
  id: string;
  planId: string;
  tenantId: string;
  userId: string;
  videoItemId: string;
  caption: string;
  scheduledAt: string;
  itemOrder: number;
  status: AiPostPlanItemStatus;
  createdAt: string;
  updatedAt: string;
}

export interface AiPostPlanRecord {
  id: string;
  tenantId: string;
  userId: string;
  status: AiPostPlanStatus;
  preset: string;
  timezone: string;
  timeWindow: Record<string, unknown>;
  targetPayload: unknown;
  itemCount: number;
  idempotencyKey: string;
  approvedAt: string | null;
  createdAt: string;
  updatedAt: string;
  items: AiPostPlanItemRecord[];
}

export interface AiUsageSnapshot {
  userRequestCount: number;
  userItemCount: number;
  tenantRequestCount: number;
  tenantItemCount: number;
}

export interface ApprovedPublishJob {
  tenantId: string;
  userId: string;
  postId: string;
  targetId: string;
  scheduledAt: string;
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
      console.error("[AI_POST_PLAN_DATABASE] Unexpected pool error:", error.message);
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

export async function ensureAiPostPlanStorage(): Promise<void> {
  if (!schemaPromise) {
    schemaPromise = withClient(async (client) => {
      await ensurePostingStorage();
      await ensureUserVideoItemStorage();

      await client.query(`
        CREATE TABLE IF NOT EXISTS ai_post_plans (
          id TEXT PRIMARY KEY,
          tenant_id TEXT NOT NULL,
          user_id TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'draft',
          preset TEXT NOT NULL,
          timezone TEXT NOT NULL,
          time_window JSONB NOT NULL DEFAULT '{}'::JSONB,
          target_payload JSONB NOT NULL DEFAULT '{}'::JSONB,
          item_count INTEGER NOT NULL DEFAULT 0,
          idempotency_key TEXT NOT NULL,
          approved_at TIMESTAMPTZ,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          UNIQUE (tenant_id, user_id, idempotency_key)
        );
      `);

      await client.query(`
        CREATE TABLE IF NOT EXISTS ai_post_plan_items (
          id TEXT PRIMARY KEY,
          plan_id TEXT NOT NULL REFERENCES ai_post_plans(id) ON DELETE CASCADE,
          tenant_id TEXT NOT NULL,
          user_id TEXT NOT NULL,
          video_item_id TEXT NOT NULL,
          caption TEXT NOT NULL,
          scheduled_at TIMESTAMPTZ NOT NULL,
          item_order INTEGER NOT NULL,
          status TEXT NOT NULL DEFAULT 'draft',
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          UNIQUE (plan_id, video_item_id)
        );
      `);

      await client.query(`
        CREATE TABLE IF NOT EXISTS ai_usage_events (
          tenant_id TEXT NOT NULL,
          user_id TEXT NOT NULL,
          feature TEXT NOT NULL,
          usage_date DATE NOT NULL,
          request_count INTEGER NOT NULL DEFAULT 0,
          item_count INTEGER NOT NULL DEFAULT 0,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          PRIMARY KEY (tenant_id, user_id, feature, usage_date)
        );
      `);

      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_ai_post_plans_tenant_user_status
        ON ai_post_plans (tenant_id, user_id, status, created_at DESC);
      `);

      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_ai_post_plan_items_plan
        ON ai_post_plan_items (tenant_id, user_id, plan_id, item_order);
      `);
    }).catch((error) => {
      schemaPromise = null;
      throw error;
    });
  }

  return schemaPromise;
}

export async function getAiUsageSnapshot(params: {
  tenantId?: string;
  userId: string;
  feature: string;
  usageDate?: string;
}): Promise<AiUsageSnapshot> {
  const tenantId = normalizeTenantId(params.tenantId);
  const usageDate = params.usageDate || new Date().toISOString().slice(0, 10);
  await ensureAiPostPlanStorage();

  return withClient(async (client) => {
    const userResult = await client.query(
      `
        SELECT request_count, item_count
        FROM ai_usage_events
        WHERE tenant_id = $1 AND user_id = $2 AND feature = $3 AND usage_date = $4::DATE
        LIMIT 1
      `,
      [tenantId, params.userId, params.feature, usageDate],
    );
    const tenantResult = await client.query(
      `
        SELECT
          COALESCE(SUM(request_count), 0)::INT AS request_count,
          COALESCE(SUM(item_count), 0)::INT AS item_count
        FROM ai_usage_events
        WHERE tenant_id = $1 AND feature = $2 AND usage_date = $3::DATE
      `,
      [tenantId, params.feature, usageDate],
    );

    return {
      userRequestCount: Number(userResult.rows[0]?.request_count || 0),
      userItemCount: Number(userResult.rows[0]?.item_count || 0),
      tenantRequestCount: Number(tenantResult.rows[0]?.request_count || 0),
      tenantItemCount: Number(tenantResult.rows[0]?.item_count || 0),
    };
  });
}

export async function incrementAiUsage(params: {
  tenantId?: string;
  userId: string;
  feature: string;
  itemCount: number;
  usageDate?: string;
}): Promise<void> {
  const tenantId = normalizeTenantId(params.tenantId);
  const usageDate = params.usageDate || new Date().toISOString().slice(0, 10);
  await ensureAiPostPlanStorage();

  await withClient((client) =>
    client.query(
      `
        INSERT INTO ai_usage_events (
          tenant_id,
          user_id,
          feature,
          usage_date,
          request_count,
          item_count
        )
        VALUES ($1, $2, $3, $4::DATE, 1, $5)
        ON CONFLICT (tenant_id, user_id, feature, usage_date)
        DO UPDATE SET
          request_count = ai_usage_events.request_count + 1,
          item_count = ai_usage_events.item_count + EXCLUDED.item_count,
          updated_at = NOW()
      `,
      [tenantId, params.userId, params.feature, params.itemCount, usageDate],
    ),
  );
}

export async function createAiPostPlan(params: {
  tenantId?: string;
  userId: string;
  preset: string;
  timezone: string;
  timeWindow: unknown;
  targetPayload: unknown;
  idempotencyKey: string;
  items: Array<{
    videoItemId: string;
    caption: string;
    scheduledAt: string;
  }>;
}): Promise<AiPostPlanRecord> {
  const tenantId = normalizeTenantId(params.tenantId);
  await ensureTenant(tenantId);
  await ensureAiPostPlanStorage();

  const planId = randomUUID();

  await withClient(async (client) => {
    await client.query("BEGIN");
    try {
      await client.query(
        `
          INSERT INTO ai_post_plans (
            id,
            tenant_id,
            user_id,
            status,
            preset,
            timezone,
            time_window,
            target_payload,
            item_count,
            idempotency_key
          )
          VALUES ($1, $2, $3, 'draft', $4, $5, $6::JSONB, $7::JSONB, $8, $9)
        `,
        [
          planId,
          tenantId,
          params.userId,
          params.preset,
          params.timezone,
          JSON.stringify(params.timeWindow),
          JSON.stringify(params.targetPayload),
          params.items.length,
          params.idempotencyKey,
        ],
      );

      for (const [index, item] of params.items.entries()) {
        await client.query(
          `
            INSERT INTO ai_post_plan_items (
              id,
              plan_id,
              tenant_id,
              user_id,
              video_item_id,
              caption,
              scheduled_at,
              item_order,
              status
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'draft')
          `,
          [
            randomUUID(),
            planId,
            tenantId,
            params.userId,
            item.videoItemId,
            item.caption,
            item.scheduledAt,
            index,
          ],
        );
      }

      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  });

  const plan = await getAiPostPlan({
    tenantId,
    userId: params.userId,
    planId,
  });
  if (!plan) {
    throw new Error("AI plan was not found after creation");
  }

  return plan;
}

export async function getAiPostPlan(params: {
  tenantId?: string;
  userId: string;
  planId: string;
}): Promise<AiPostPlanRecord | null> {
  const tenantId = normalizeTenantId(params.tenantId);
  await ensureAiPostPlanStorage();

  return withClient(async (client) => getPlanWithItems(client, tenantId, params.userId, params.planId));
}

export async function approveAiPostPlan(params: {
  tenantId?: string;
  userId: string;
  planId: string;
  itemOverrides: Array<{ id: string; caption: string; scheduledAt: string }>;
  accountTargets: QueuePostTargetInput[];
}): Promise<{ alreadyApproved: boolean; jobs: ApprovedPublishJob[] }> {
  const tenantId = normalizeTenantId(params.tenantId);
  await ensureAiPostPlanStorage();

  return withClient(async (client) => {
    await client.query("BEGIN");
    try {
      const planResult = await client.query(
        `
          SELECT *
          FROM ai_post_plans
          WHERE id = $1 AND tenant_id = $2 AND user_id = $3
          FOR UPDATE
        `,
        [params.planId, tenantId, params.userId],
      );
      const plan = planResult.rows[0];

      if (!plan) {
        throw new Error("AI plan was not found");
      }

      if (plan.status === "approved") {
        await client.query("COMMIT");
        return { alreadyApproved: true, jobs: [] };
      }

      const itemsResult = await client.query(
        `
          SELECT *
          FROM ai_post_plan_items
          WHERE plan_id = $1 AND tenant_id = $2 AND user_id = $3
          ORDER BY item_order ASC
        `,
        [params.planId, tenantId, params.userId],
      );
      const planItems = itemsResult.rows;
      const overrideById = new Map(params.itemOverrides.map((item) => [item.id, item]));

      if (overrideById.size !== planItems.length) {
        throw new Error("Approve payload does not match plan item count");
      }

      const videoItemIds = planItems.map((item) => String(item.video_item_id));
      const videoResult = await client.query(
        `
          SELECT id, video_payload
          FROM user_video_items
          WHERE tenant_id = $1
            AND user_id = $2
            AND status = 'ready'
            AND id = ANY($3::TEXT[])
        `,
        [tenantId, params.userId, videoItemIds],
      );
      const videosByItemId = new Map<string, Video>(
        videoResult.rows.map((row) => [String(row.id), row.video_payload as Video]),
      );

      if (videosByItemId.size !== videoItemIds.length) {
        throw new Error("One or more videos are no longer ready");
      }

      const jobs: ApprovedPublishJob[] = [];
      const queuedAt = new Date().toISOString();

      for (const item of planItems) {
        const override = overrideById.get(String(item.id));
        if (!override) {
          throw new Error("Approve payload is missing a plan item");
        }

        const video = videosByItemId.get(String(item.video_item_id));
        if (!video) {
          throw new Error("Ready video item was not found");
        }

        const postId = randomUUID();
        await client.query(
          `
            INSERT INTO scheduled_posts (
              id,
              tenant_id,
              user_id,
              video_id,
              video_title,
              video_url,
              video_thumbnail,
              caption,
              status,
              publish_window,
              scheduled_at,
              queued_at,
              video_payload,
              source,
              metadata
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'scheduled', 'schedule', $9, $10, $11::JSONB, 'ai_planner', $12::JSONB)
          `,
          [
            postId,
            tenantId,
            params.userId,
            video.id,
            video.title,
            video.preparedLocalUrl || video.url,
            video.thumbnail || null,
            override.caption,
            override.scheduledAt,
            queuedAt,
            JSON.stringify(video),
            JSON.stringify({
              source: "ai_planner",
              planId: params.planId,
              planItemId: String(item.id),
              idempotencyKey: String(plan.idempotency_key),
            }),
          ],
        );

        for (const target of params.accountTargets) {
          const targetId = randomUUID();
          await client.query(
            `
              INSERT INTO post_targets (
                id,
                tenant_id,
                user_id,
                post_id,
                account_key,
                platform,
                account_label,
                page_record_id,
                page_name,
                status
              )
              VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'scheduled')
            `,
            [
              targetId,
              tenantId,
              params.userId,
              postId,
              target.accountKey,
              target.platform,
              target.accountLabel || null,
              target.pageRecordId || null,
              target.pageName || null,
            ],
          );

          jobs.push({
            tenantId,
            userId: params.userId,
            postId,
            targetId,
            scheduledAt: override.scheduledAt,
          });
        }

        await client.query(
          `
            UPDATE ai_post_plan_items
            SET caption = $1, scheduled_at = $2, status = 'approved', updated_at = NOW()
            WHERE id = $3 AND plan_id = $4 AND tenant_id = $5 AND user_id = $6
          `,
          [override.caption, override.scheduledAt, item.id, params.planId, tenantId, params.userId],
        );
      }

      await client.query(
        `
          UPDATE ai_post_plans
          SET status = 'approved', approved_at = NOW(), updated_at = NOW()
          WHERE id = $1 AND tenant_id = $2 AND user_id = $3
        `,
        [params.planId, tenantId, params.userId],
      );

      await client.query("COMMIT");
      return { alreadyApproved: false, jobs };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  });
}

async function getPlanWithItems(
  client: PoolClient,
  tenantId: string,
  userId: string,
  planId: string,
): Promise<AiPostPlanRecord | null> {
  const result = await client.query(
    `
      SELECT
        ai_post_plans.*,
        ai_post_plan_items.id AS item_id,
        ai_post_plan_items.video_item_id,
        ai_post_plan_items.caption AS item_caption,
        ai_post_plan_items.scheduled_at AS item_scheduled_at,
        ai_post_plan_items.item_order,
        ai_post_plan_items.status AS item_status,
        ai_post_plan_items.created_at AS item_created_at,
        ai_post_plan_items.updated_at AS item_updated_at
      FROM ai_post_plans
      LEFT JOIN ai_post_plan_items
        ON ai_post_plan_items.plan_id = ai_post_plans.id
        AND ai_post_plan_items.tenant_id = ai_post_plans.tenant_id
      WHERE ai_post_plans.id = $1
        AND ai_post_plans.tenant_id = $2
        AND ai_post_plans.user_id = $3
      ORDER BY ai_post_plan_items.item_order ASC
    `,
    [planId, tenantId, userId],
  );

  const first = result.rows[0];
  if (!first) return null;

  return {
    id: String(first.id),
    tenantId: String(first.tenant_id),
    userId: String(first.user_id),
    status: first.status as AiPostPlanStatus,
    preset: String(first.preset),
    timezone: String(first.timezone),
    timeWindow: first.time_window || {},
    targetPayload: first.target_payload || {},
    itemCount: Number(first.item_count || 0),
    idempotencyKey: String(first.idempotency_key),
    approvedAt: first.approved_at ? new Date(first.approved_at as Date | string).toISOString() : null,
    createdAt: new Date(first.created_at as Date | string).toISOString(),
    updatedAt: new Date(first.updated_at as Date | string).toISOString(),
    items: result.rows
      .filter((row) => row.item_id)
      .map((row) => ({
        id: String(row.item_id),
        planId: String(row.id),
        tenantId: String(row.tenant_id),
        userId: String(row.user_id),
        videoItemId: String(row.video_item_id),
        caption: String(row.item_caption),
        scheduledAt: new Date(row.item_scheduled_at as Date | string).toISOString(),
        itemOrder: Number(row.item_order),
        status: row.item_status as AiPostPlanItemStatus,
        createdAt: new Date(row.item_created_at as Date | string).toISOString(),
        updatedAt: new Date(row.item_updated_at as Date | string).toISOString(),
      })),
  };
}
