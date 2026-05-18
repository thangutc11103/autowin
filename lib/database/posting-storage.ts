import { randomUUID } from "crypto";
import { Pool, type PoolClient } from "pg";
import type { Platform, Video } from "@/types/video";

export type ScheduledPostStatus =
  | "draft"
  | "queued"
  | "scheduled"
  | "publishing"
  | "published"
  | "failed";

export type PostTargetStatus =
  | "queued"
  | "scheduled"
  | "publishing"
  | "published"
  | "failed"
  | "skipped";

export interface QueuePostTargetInput {
  accountKey: string;
  platform: Exclude<Platform, "douyin">;
  accountLabel?: string;
}

export interface QueuePostInput {
  video: Video;
  caption: string;
  publishWindow: "now" | "schedule";
  scheduledAt?: string | null;
  accountTargets: QueuePostTargetInput[];
}

export interface ScheduledPostRecord {
  id: string;
  videoId: string;
  videoTitle: string;
  videoUrl: string;
  videoThumbnail?: string | null;
  caption: string;
  status: ScheduledPostStatus;
  publishWindow: "now" | "schedule";
  scheduledAt?: string | null;
  queuedAt: string;
  createdAt: string;
  targets: Array<{
    id: string;
    accountKey: string;
    platform: Exclude<Platform, "douyin">;
    accountLabel?: string | null;
    status: PostTargetStatus;
    lastError?: string | null;
    publishedAt?: string | null;
  }>;
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
      console.error("[POSTING_DATABASE] Unexpected pool error:", error.message);
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

async function ensurePostingStorage(): Promise<void> {
  if (!schemaPromise) {
    schemaPromise = withClient(async (client) => {
      await client.query(`
        CREATE TABLE IF NOT EXISTS scheduled_posts (
          id TEXT PRIMARY KEY,
          video_id TEXT NOT NULL,
          video_title TEXT NOT NULL,
          video_url TEXT NOT NULL,
          video_thumbnail TEXT,
          caption TEXT NOT NULL,
          status TEXT NOT NULL,
          publish_window TEXT NOT NULL,
          scheduled_at TIMESTAMPTZ,
          queued_at TIMESTAMPTZ NOT NULL,
          video_payload JSONB NOT NULL DEFAULT '{}'::JSONB,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `);

      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_scheduled_posts_status_scheduled_at
        ON scheduled_posts (status, scheduled_at);
      `);

      await client.query(`
        CREATE TABLE IF NOT EXISTS post_targets (
          id TEXT PRIMARY KEY,
          post_id TEXT NOT NULL REFERENCES scheduled_posts(id) ON DELETE CASCADE,
          account_key TEXT NOT NULL,
          platform TEXT NOT NULL,
          account_label TEXT,
          status TEXT NOT NULL,
          last_error TEXT,
          published_at TIMESTAMPTZ,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `);

      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_post_targets_post_id
        ON post_targets (post_id);
      `);
    }).catch((error) => {
      schemaPromise = null;
      throw error;
    });
  }

  return schemaPromise;
}

function mapPostRows(rows: Array<Record<string, unknown>>): ScheduledPostRecord[] {
  const posts = new Map<string, ScheduledPostRecord>();

  rows.forEach((row) => {
    const postId = String(row.id);
    let post = posts.get(postId);

    if (!post) {
      post = {
        id: postId,
        videoId: String(row.video_id),
        videoTitle: String(row.video_title),
        videoUrl: String(row.video_url),
        videoThumbnail: row.video_thumbnail ? String(row.video_thumbnail) : null,
        caption: String(row.caption),
        status: row.status as ScheduledPostStatus,
        publishWindow: row.publish_window as "now" | "schedule",
        scheduledAt: row.scheduled_at
          ? new Date(row.scheduled_at as string | Date).toISOString()
          : null,
        queuedAt: new Date(row.queued_at as string | Date).toISOString(),
        createdAt: new Date(row.created_at as string | Date).toISOString(),
        targets: [],
      };
      posts.set(postId, post);
    }

    if (row.target_id) {
      post.targets.push({
        id: String(row.target_id),
        accountKey: String(row.account_key),
        platform: row.platform as Exclude<Platform, "douyin">,
        accountLabel: row.account_label ? String(row.account_label) : null,
        status: row.target_status as PostTargetStatus,
        lastError: row.last_error ? String(row.last_error) : null,
        publishedAt: row.published_at
          ? new Date(row.published_at as string | Date).toISOString()
          : null,
      });
    }
  });

  return Array.from(posts.values());
}

export async function createQueuedPost(
  input: QueuePostInput,
): Promise<ScheduledPostRecord> {
  await ensurePostingStorage();

  const postId = randomUUID();
  const status: ScheduledPostStatus =
    input.publishWindow === "schedule" ? "scheduled" : "queued";
  const targetStatus: PostTargetStatus =
    input.publishWindow === "schedule" ? "scheduled" : "queued";
  const queuedAt = new Date().toISOString();

  await withClient(async (client) => {
    await client.query("BEGIN");

    try {
      await client.query(
        `
          INSERT INTO scheduled_posts (
            id,
            video_id,
            video_title,
            video_url,
            video_thumbnail,
            caption,
            status,
            publish_window,
            scheduled_at,
            queued_at,
            video_payload
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::JSONB)
        `,
        [
          postId,
          input.video.id,
          input.video.title,
          input.video.preparedLocalUrl || input.video.url,
          input.video.thumbnail || null,
          input.caption,
          status,
          input.publishWindow,
          input.scheduledAt || null,
          queuedAt,
          JSON.stringify(input.video),
        ],
      );

      for (const target of input.accountTargets) {
        await client.query(
          `
            INSERT INTO post_targets (
              id,
              post_id,
              account_key,
              platform,
              account_label,
              status
            )
            VALUES ($1, $2, $3, $4, $5, $6)
          `,
          [
            randomUUID(),
            postId,
            target.accountKey,
            target.platform,
            target.accountLabel || null,
            targetStatus,
          ],
        );
      }

      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  });

  const [post] = await listScheduledPosts({ limit: 1, postId });
  if (!post) {
    throw new Error("Queued post was not found after creation");
  }

  return post;
}

export async function listScheduledPosts(params?: {
  limit?: number;
  postId?: string;
}): Promise<ScheduledPostRecord[]> {
  await ensurePostingStorage();

  return withClient(async (client) => {
    const values: Array<string | number> = [];
    const conditions: string[] = [];

    if (params?.postId) {
      values.push(params.postId);
      conditions.push(`scheduled_posts.id = $${values.length}`);
    }

    values.push(params?.limit ?? 50);
    const limitParam = values.length;
    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const result = await client.query(
      `
        SELECT
          scheduled_posts.id,
          scheduled_posts.video_id,
          scheduled_posts.video_title,
          scheduled_posts.video_url,
          scheduled_posts.video_thumbnail,
          scheduled_posts.caption,
          scheduled_posts.status,
          scheduled_posts.publish_window,
          scheduled_posts.scheduled_at,
          scheduled_posts.queued_at,
          scheduled_posts.created_at,
          post_targets.id AS target_id,
          post_targets.account_key,
          post_targets.platform,
          post_targets.account_label,
          post_targets.status AS target_status,
          post_targets.last_error,
          post_targets.published_at
        FROM scheduled_posts
        LEFT JOIN post_targets ON post_targets.post_id = scheduled_posts.id
        ${whereClause}
        ORDER BY scheduled_posts.created_at DESC, post_targets.created_at ASC
        LIMIT $${limitParam}
      `,
      values,
    );

    return mapPostRows(result.rows);
  });
}

export async function markTargetPublishing(params: {
  postId: string;
  targetId: string;
}): Promise<void> {
  await ensurePostingStorage();

  await withClient((client) =>
    client.query(
      `
        UPDATE post_targets
        SET status = 'publishing', updated_at = NOW()
        WHERE id = $1 AND post_id = $2
      `,
      [params.targetId, params.postId],
    ),
  );

  await syncPostStatus(params.postId);
}

export async function markTargetPublished(params: {
  postId: string;
  targetId: string;
}): Promise<void> {
  await ensurePostingStorage();

  await withClient((client) =>
    client.query(
      `
        UPDATE post_targets
        SET
          status = 'published',
          published_at = NOW(),
          last_error = NULL,
          updated_at = NOW()
        WHERE id = $1 AND post_id = $2
      `,
      [params.targetId, params.postId],
    ),
  );

  await syncPostStatus(params.postId);
}

export async function markTargetFailed(params: {
  postId: string;
  targetId: string;
  error: string;
}): Promise<void> {
  await ensurePostingStorage();

  await withClient((client) =>
    client.query(
      `
        UPDATE post_targets
        SET
          status = 'failed',
          last_error = $3,
          updated_at = NOW()
        WHERE id = $1 AND post_id = $2
      `,
      [params.targetId, params.postId, params.error],
    ),
  );

  await syncPostStatus(params.postId);
}

export async function syncPostStatus(postId: string): Promise<void> {
  await ensurePostingStorage();

  await withClient(async (client) => {
    const result = await client.query(
      `
        SELECT status, COUNT(*)::INT AS count
        FROM post_targets
        WHERE post_id = $1
        GROUP BY status
      `,
      [postId],
    );

    const counts = new Map<string, number>(
      result.rows.map((row) => [String(row.status), Number(row.count)]),
    );
    const total = Array.from(counts.values()).reduce((sum, count) => sum + count, 0);

    let nextStatus: ScheduledPostStatus = "queued";

    if (total === 0) {
      nextStatus = "failed";
    } else if ((counts.get("published") || 0) === total) {
      nextStatus = "published";
    } else if ((counts.get("failed") || 0) === total) {
      nextStatus = "failed";
    } else if (counts.has("publishing")) {
      nextStatus = "publishing";
    } else if (counts.has("scheduled")) {
      nextStatus = "scheduled";
    } else if (counts.has("queued")) {
      nextStatus = "queued";
    } else if (counts.has("failed")) {
      nextStatus = "failed";
    }

    await client.query(
      `
        UPDATE scheduled_posts
        SET status = $2, updated_at = NOW()
        WHERE id = $1
      `,
      [postId, nextStatus],
    );
  });
}
