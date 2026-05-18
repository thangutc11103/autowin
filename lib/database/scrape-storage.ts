import { randomUUID } from "crypto";
import { Pool, type PoolClient } from "pg";
import type { CrawlJobData } from "@/types/job";
import type { ScrapeResult } from "@/types/scrape";
import type { Platform, Video } from "@/types/video";

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
      console.error("[DATABASE] Unexpected pool error:", error.message);
    });
  }

  return pool;
}

function getJobId(jobData: CrawlJobData, jobId?: string): string {
  return jobId || jobData.jobId || randomUUID();
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

export async function ensureScrapeStorage(): Promise<void> {
  if (!schemaPromise) {
    schemaPromise = withClient(async (client) => {
      await client.query(`
        CREATE TABLE IF NOT EXISTS scrape_runs (
          job_id TEXT PRIMARY KEY,
          batch_id TEXT,
          platform TEXT NOT NULL,
          job_type TEXT NOT NULL,
          source_value TEXT NOT NULL,
          target_url TEXT NOT NULL,
          requested_limit INTEGER,
          total_count INTEGER NOT NULL DEFAULT 0,
          status TEXT NOT NULL,
          error_message TEXT,
          scraped_at TIMESTAMPTZ NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `);

      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_scrape_runs_batch_id
        ON scrape_runs (batch_id);
      `);

      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_scrape_runs_platform_scraped_at
        ON scrape_runs (platform, scraped_at);
      `);

      await client.query(`
        CREATE TABLE IF NOT EXISTS scraped_videos (
          id BIGSERIAL PRIMARY KEY,
          job_id TEXT NOT NULL REFERENCES scrape_runs(job_id) ON DELETE CASCADE,
          batch_id TEXT,
          platform TEXT NOT NULL,
          job_type TEXT NOT NULL,
          source_value TEXT NOT NULL,
          video_id TEXT NOT NULL,
          title TEXT NOT NULL,
          author TEXT,
          video_url TEXT NOT NULL,
          thumbnail_url TEXT,
          crawled_at TIMESTAMPTZ NOT NULL,
          scraped_at TIMESTAMPTZ NOT NULL,
          raw_payload JSONB NOT NULL DEFAULT '{}'::JSONB,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          UNIQUE (job_id, video_url)
        );
      `);

      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_scraped_videos_batch_id
        ON scraped_videos (batch_id);
      `);

      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_scraped_videos_platform
        ON scraped_videos (platform);
      `);
    }).catch((error) => {
      schemaPromise = null;
      throw error;
    });
  }

  return schemaPromise;
}

export async function saveSuccessfulScrape(params: {
  jobData: CrawlJobData;
  jobId?: string;
  result: ScrapeResult;
}): Promise<{ jobId: string; savedVideos: number }> {
  await ensureScrapeStorage();

  const jobId = getJobId(params.jobData, params.jobId);
  const requestedLimit = params.jobData.limit ?? null;

  await withClient(async (client) => {
    await client.query("BEGIN");

    try {
      await client.query(
        `
          INSERT INTO scrape_runs (
            job_id,
            batch_id,
            platform,
            job_type,
            source_value,
            target_url,
            requested_limit,
            total_count,
            status,
            error_message,
            scraped_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'completed', NULL, $9)
          ON CONFLICT (job_id)
          DO UPDATE SET
            batch_id = EXCLUDED.batch_id,
            platform = EXCLUDED.platform,
            job_type = EXCLUDED.job_type,
            source_value = EXCLUDED.source_value,
            target_url = EXCLUDED.target_url,
            requested_limit = EXCLUDED.requested_limit,
            total_count = EXCLUDED.total_count,
            status = EXCLUDED.status,
            error_message = EXCLUDED.error_message,
            scraped_at = EXCLUDED.scraped_at
        `,
        [
          jobId,
          params.jobData.batchId ?? null,
          params.jobData.platform,
          params.jobData.type,
          params.jobData.value,
          params.jobData.targetUrl,
          requestedLimit,
          params.result.totalCount,
          params.result.scrapedAt,
        ],
      );

      await client.query("DELETE FROM scraped_videos WHERE job_id = $1", [
        jobId,
      ]);

      if (params.result.videos.length > 0) {
        const placeholders: string[] = [];
        const values: Array<string | number | null | Record<string, unknown>> =
          [];

        params.result.videos.forEach((video, index) => {
          const offset = index * 11;
          placeholders.push(
            `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8}, $${offset + 9}, $${offset + 10}, $${offset + 11})`,
          );

          values.push(
            jobId,
            params.jobData.batchId ?? null,
            params.jobData.platform,
            params.jobData.type,
            params.jobData.value,
            video.externalId,
            video.title,
            video.author ?? null,
            video.url,
            video.thumbnail ?? null,
            {
              crawledAt: video.crawledAt,
              scrapedAt: params.result.scrapedAt,
              ...video.rawPayload,
            },
          );
        });

        await client.query(
          `
            INSERT INTO scraped_videos (
              job_id,
              batch_id,
              platform,
              job_type,
              source_value,
              video_id,
              title,
              author,
              video_url,
              thumbnail_url,
              raw_payload,
              crawled_at,
              scraped_at
            )
            SELECT
              entry.job_id,
              entry.batch_id,
              entry.platform,
              entry.job_type,
              entry.source_value,
              entry.video_id,
              entry.title,
              entry.author,
              entry.video_url,
              entry.thumbnail_url,
              entry.raw_payload::JSONB,
              (entry.raw_payload::JSONB->>'crawledAt')::TIMESTAMPTZ,
              (entry.raw_payload::JSONB->>'scrapedAt')::TIMESTAMPTZ
            FROM (
              VALUES ${placeholders.join(", ")}
            ) AS entry (
              job_id,
              batch_id,
              platform,
              job_type,
              source_value,
              video_id,
              title,
              author,
              video_url,
              thumbnail_url,
              raw_payload
            )
          `,
          values,
        );
      }

      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  });

  return {
    jobId,
    savedVideos: params.result.videos.length,
  };
}

export async function saveFailedScrape(params: {
  jobData: CrawlJobData;
  jobId?: string;
  errorMessage: string;
}): Promise<string> {
  await ensureScrapeStorage();

  const jobId = getJobId(params.jobData, params.jobId);

  await withClient((client) =>
    client.query(
      `
        INSERT INTO scrape_runs (
          job_id,
          batch_id,
          platform,
          job_type,
          source_value,
          target_url,
          requested_limit,
          total_count,
          status,
          error_message,
          scraped_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, 0, 'failed', $8, NOW())
        ON CONFLICT (job_id)
        DO UPDATE SET
          batch_id = EXCLUDED.batch_id,
          platform = EXCLUDED.platform,
          job_type = EXCLUDED.job_type,
          source_value = EXCLUDED.source_value,
          target_url = EXCLUDED.target_url,
          requested_limit = EXCLUDED.requested_limit,
          total_count = EXCLUDED.total_count,
          status = EXCLUDED.status,
          error_message = EXCLUDED.error_message,
          scraped_at = EXCLUDED.scraped_at
      `,
      [
        jobId,
        params.jobData.batchId ?? null,
        params.jobData.platform,
        params.jobData.type,
        params.jobData.value,
        params.jobData.targetUrl,
        params.jobData.limit ?? null,
        params.errorMessage,
      ],
    ),
  );

  return jobId;
}

export async function closeScrapeStorage(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
    schemaPromise = null;
  }
}

function getStringPayloadValue(
  payload: Record<string, unknown> | null,
  key: string,
): string | null {
  const value = payload?.[key];

  return typeof value === "string" && value.length > 0 ? value : null;
}

function mapVideoRow(row: {
  id: string | number;
  title: string;
  author?: string | null;
  platform: string;
  video_url: string;
  thumbnail_url?: string | null;
  raw_payload?: Record<string, unknown> | null;
}): Video {
  const rawPayload = (row.raw_payload || {}) as Record<string, unknown>;

  return {
    id: String(row.id),
    title: row.title,
    thumbnail: row.thumbnail_url || "",
    platform: row.platform as Platform,
    url: row.video_url,
    description: row.author ? `By ${row.author}` : undefined,
    rawPayload,
    mediaVideoUrl: getStringPayloadValue(rawPayload, "mediaVideoUrl"),
    mediaAudioUrl: getStringPayloadValue(rawPayload, "mediaAudioUrl"),
  };
}

export async function getScrapedVideoById(id: string): Promise<Video | null> {
  await ensureScrapeStorage();

  return withClient(async (client) => {
    const result = await client.query(
      `
        SELECT
          id,
          title,
          author,
          platform,
          video_url,
          thumbnail_url,
          raw_payload
        FROM scraped_videos
        WHERE id = $1
        LIMIT 1
      `,
      [id],
    );

    const row = result.rows[0];
    return row ? mapVideoRow(row) : null;
  });
}

export async function updateScrapedVideoMediaById(params: {
  id: string;
  title?: string | null;
  thumbnailUrl?: string | null;
  rawPayload: Record<string, unknown>;
}): Promise<Video | null> {
  await ensureScrapeStorage();

  return withClient(async (client) => {
    const result = await client.query(
      `
        UPDATE scraped_videos
        SET
          title = COALESCE(NULLIF($2, ''), title),
          thumbnail_url = COALESCE(NULLIF($3, ''), thumbnail_url),
          raw_payload = raw_payload || $4::JSONB
        WHERE id = $1
        RETURNING
          id,
          title,
          author,
          platform,
          video_url,
          thumbnail_url,
          raw_payload
      `,
      [
        params.id,
        params.title ?? null,
        params.thumbnailUrl ?? null,
        JSON.stringify(params.rawPayload),
      ],
    );

    const row = result.rows[0];
    return row ? mapVideoRow(row) : null;
  });
}

export async function updateScrapedVideoMediaByJobUrl(params: {
  jobId: string;
  videoUrl: string;
  title?: string | null;
  thumbnailUrl?: string | null;
  rawPayload: Record<string, unknown>;
}): Promise<Video | null> {
  await ensureScrapeStorage();

  return withClient(async (client) => {
    const result = await client.query(
      `
        UPDATE scraped_videos
        SET
          title = COALESCE(NULLIF($3, ''), title),
          thumbnail_url = COALESCE(NULLIF($4, ''), thumbnail_url),
          raw_payload = raw_payload || $5::JSONB
        WHERE job_id = $1 AND video_url = $2
        RETURNING
          id,
          title,
          author,
          platform,
          video_url,
          thumbnail_url,
          raw_payload
      `,
      [
        params.jobId,
        params.videoUrl,
        params.title ?? null,
        params.thumbnailUrl ?? null,
        JSON.stringify(params.rawPayload),
      ],
    );

    const row = result.rows[0];
    return row ? mapVideoRow(row) : null;
  });
}

export async function clearScrapeHistory(params: {
  platform?: string | null;
  olderThanDays?: 7 | 30 | null;
}): Promise<{ deletedRuns: number; deletedVideos: number }> {
  await ensureScrapeStorage();

  return withClient(async (client) => {
    const conditions: string[] = [];
    const values: Array<string | number> = [];

    if (params.platform) {
      values.push(params.platform);
      conditions.push(`scrape_runs.platform = $${values.length}`);
    }

    if (params.olderThanDays) {
      values.push(params.olderThanDays);
      conditions.push(
        `scrape_runs.scraped_at < NOW() - ($${values.length}::INT * INTERVAL '1 day')`,
      );
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    await client.query("BEGIN");

    try {
      const countResult = await client.query(
        `
          SELECT
            COUNT(DISTINCT scrape_runs.job_id)::INT AS run_count,
            COUNT(scraped_videos.id)::INT AS video_count
          FROM scrape_runs
          LEFT JOIN scraped_videos ON scraped_videos.job_id = scrape_runs.job_id
          ${whereClause}
        `,
        values,
      );

      const deleteResult = await client.query(
        `
          DELETE FROM scrape_runs
          ${whereClause}
        `,
        values,
      );

      await client.query("COMMIT");

      return {
        deletedRuns:
          Number(countResult.rows[0]?.run_count) || deleteResult.rowCount || 0,
        deletedVideos: Number(countResult.rows[0]?.video_count) || 0,
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  });
}

export function getConfiguredDatabaseHost(): string | null {
  try {
    return new URL(getConnectionString()).hostname;
  } catch {
    return null;
  }
}
