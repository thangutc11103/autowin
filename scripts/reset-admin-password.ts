import { hashPassword } from "@/lib/auth/session-auth";
import { Pool } from "pg";

type CliArgs = {
  email?: string;
  id?: string;
  password?: string;
};

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {};

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    const next = argv[index + 1];

    if (current === "--email" && next) {
      args.email = next.trim().toLowerCase();
      index += 1;
      continue;
    }

    if (current === "--id" && next) {
      args.id = next.trim();
      index += 1;
      continue;
    }

    if (current === "--password" && next) {
      args.password = next;
      index += 1;
      continue;
    }
  }

  return args;
}

function usage(): string {
  return [
    "Usage:",
    "  npm run reset-admin-password -- --email admin@example.com --password \"NewPass123!\"",
    "  npm run reset-admin-password -- --id admin --password \"NewPass123!\"",
  ].join("\n");
}

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

async function run() {
  const args = parseArgs(process.argv.slice(2));

  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    console.log(usage());
    process.exit(0);
  }

  if (!args.password || args.password.length < 8 || (!args.email && !args.id)) {
    console.error(usage());
    process.exit(1);
  }

  const connectionString = getConnectionString();
  const pool = new Pool({
    connectionString,
    ssl: shouldUseSsl(connectionString)
      ? { rejectUnauthorized: true }
      : undefined,
    max: 1,
  });

  const passwordHash = hashPassword(args.password);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const lookup = args.email
      ? await client.query(
          `SELECT id, email FROM users WHERE LOWER(email) = $1 LIMIT 1`,
          [args.email],
        )
      : await client.query(`SELECT id, email FROM users WHERE id = $1 LIMIT 1`, [
          args.id,
        ]);

    if (lookup.rowCount === 0) {
      throw new Error("User not found");
    }

    const userId = String(lookup.rows[0].id);
    const userEmail = lookup.rows[0].email ? String(lookup.rows[0].email) : null;

    await client.query(
      `UPDATE users SET password_hash = $2, updated_at = NOW() WHERE id = $1`,
      [userId, passwordHash],
    );

    const revokeResult = await client.query(
      `UPDATE user_sessions SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL`,
      [userId],
    );

    await client.query("COMMIT");

    console.log(
      `Password reset successful for user=${userId}${userEmail ? ` email=${userEmail}` : ""}. Revoked ${revokeResult.rowCount || 0} session(s).`,
    );
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Reset failed: ${message}`);
  process.exit(1);
});
