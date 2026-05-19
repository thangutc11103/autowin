import { Pool } from "pg";

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

export async function checkDatabaseConnection(): Promise<{
  ok: boolean;
  host?: string;
  latencyMs?: number;
  error?: string;
}> {
  const startedAt = Date.now();
  let pool: Pool | null = null;

  try {
    const connectionString = getConnectionString();
    const url = new URL(connectionString);

    pool = new Pool({
      connectionString,
      ssl: shouldUseSsl(connectionString)
        ? { rejectUnauthorized: true }
        : undefined,
      max: 1,
      idleTimeoutMillis: 1000,
      connectionTimeoutMillis: 5000,
    });

    await pool.query("SELECT 1");

    return {
      ok: true,
      host: url.hostname,
      latencyMs: Date.now() - startedAt,
    };
  } catch (error) {
    return {
      ok: false,
      latencyMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    if (pool) {
      await pool.end().catch(() => undefined);
    }
  }
}
