import { randomUUID } from "crypto";
import { Pool, type PoolClient } from "pg";
import type { CrawlJobData } from "@/types/job";
import type { ScrapeResult } from "@/types/scrape";

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
        ? { rejectUnauthorized: false }
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
          views BIGINT,
          video_url TEXT NOT NULL,
          thumbnail_url TEXT,
          uploaded_at TIMESTAMPTZ,
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

      await client.query("DELETE FROM scraped_videos WHERE job_id = $1", [jobId]);

      if (params.result.videos.length > 0) {
        const placeholders: string[] = [];
        const values: Array<string | number | null | Record<string, unknown>> = [];

        params.result.videos.forEach((video, index) => {
          const offset = index * 13;
          placeholders.push(
            `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8}, $${offset + 9}, $${offset + 10}, $${offset + 11}, $${offset + 12}, $${offset + 13})`,
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
            video.views ?? null,
            video.url,
            video.thumbnail ?? null,
            video.uploadedAt ?? null,
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
              views,
              video_url,
              thumbnail_url,
              uploaded_at,
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
              entry.views,
              entry.video_url,
              entry.thumbnail_url,
              entry.uploaded_at,
              entry.raw_payload,
              (entry.raw_payload->>'crawledAt')::TIMESTAMPTZ,
              (entry.raw_payload->>'scrapedAt')::TIMESTAMPTZ
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
              views,
              video_url,
              thumbnail_url,
              uploaded_at,
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

export function getConfiguredDatabaseHost(): string | null {
  try {
    return new URL(getConnectionString()).hostname;
  } catch {
    return null;
  }
}
