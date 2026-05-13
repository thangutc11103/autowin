// API này đọc từ bảng scraped_videos, lọc theo:
//  . batchId
//  . platform
//  . limit
// Ví dụ request:
// GET /api/videos?batchId=batch-xxx&platform=tiktok

import { NextRequest, NextResponse } from "next/server";
import { Pool } from "pg";
import type { Platform, Video } from "@/types/video";

export const runtime = "nodejs";

const VALID_PLATFORMS: Platform[] = [
  "tiktok",
  "douyin",
  "youtube",
  "facebook",
  "instagram",
];

let pool: Pool | null = null;

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
  }

  return pool;
}

function isValidPlatform(value: string | null): value is Platform {
  return value !== null && VALID_PLATFORMS.includes(value as Platform);
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    const batchId = searchParams.get("batchId");
    const platform = searchParams.get("platform");
    const limitParam = searchParams.get("limit");

    const limit = Math.min(Number(limitParam || 50), 100);

    if (platform && !isValidPlatform(platform)) {
      return NextResponse.json(
        { error: `Invalid platform: ${platform}` },
        { status: 400 },
      );
    }

    const conditions: string[] = [];
    const values: Array<string | number> = [];

    if (batchId) {
      values.push(batchId);
      conditions.push(`batch_id = $${values.length}`);
    }

    if (platform) {
      values.push(platform);
      conditions.push(`platform = $${values.length}`);
    }

    values.push(limit);
    const limitIndex = values.length;

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const query = `
      SELECT
        id,
        title,
        author,
        views,
        platform,
        video_url,
        thumbnail_url,
        uploaded_at,
        created_at
      FROM scraped_videos
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT $${limitIndex};
    `;

    const result = await getPool().query(query, values);

    const videos: Video[] = result.rows.map((row) => ({
      id: String(row.id),
      title: row.title,
      thumbnail: row.thumbnail_url || "",
      views: Number(row.views || 0),
      platform: row.platform as Platform,
      url: row.video_url,
      uploadedAt:
        row.uploaded_at?.toISOString?.() ||
        row.created_at?.toISOString?.() ||
        new Date().toISOString(),
      description: row.author ? `By ${row.author}` : undefined,
    }));

    return NextResponse.json({
      videos,
      total: videos.length,
    });
  } catch (error) {
    console.error("[API /videos] Error:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to fetch videos",
      },
      { status: 500 },
    );
  }
}
