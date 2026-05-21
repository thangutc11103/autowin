import { randomBytes, scryptSync, timingSafeEqual, createHash } from "crypto";
import { Pool, type PoolClient } from "pg";
import { normalizeTenantId } from "@/lib/tenant-context";
import { ensureAccessControlStorage } from "@/lib/auth/access-control";

export const SESSION_COOKIE_NAME = "autowin_session";
export const DEVICE_COOKIE_NAME = "autowin_device";

const SESSION_TTL_DAYS = Number(process.env.SESSION_TTL_DAYS || 14);

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

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `scrypt:v1:${salt}:${hash}`;
}

export function verifyPassword(
  password: string,
  storedHash: string | null,
): boolean {
  if (!storedHash) return false;
  const [algorithm, version, salt, expected] = storedHash.split(":");
  if (algorithm !== "scrypt" || version !== "v1" || !salt || !expected) {
    return false;
  }

  const actual = Buffer.from(scryptSync(password, salt, 64).toString("hex"));
  const expectedBuffer = Buffer.from(expected);
  return (
    actual.length === expectedBuffer.length &&
    timingSafeEqual(actual, expectedBuffer)
  );
}

export async function ensureSessionStorage(): Promise<void> {
  await ensureAccessControlStorage();

  await withClient(async (client) => {
    await client.query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS password_hash TEXT;
    `);

    await client.query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS user_sessions (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL DEFAULT 'default',
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        device_id TEXT NOT NULL,
        session_token_hash TEXT NOT NULL UNIQUE,
        ip_address TEXT,
        user_agent TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        expires_at TIMESTAMPTZ NOT NULL,
        revoked_at TIMESTAMPTZ
      );
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_user_sessions_active_user
      ON user_sessions (tenant_id, user_id, revoked_at, expires_at);
    `);
  });
}

function getIpAddress(request: Request): string | null {
  const forwarded = request.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || request.headers.get("x-real-ip");
}

function getSessionExpiry(): Date {
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + SESSION_TTL_DAYS);
  return expiresAt;
}

export interface CurrentUser {
  id: string;
  email?: string | null;
  displayName?: string | null;
  tenantId: string;
  role: string;
  status: string;
  sessionId: string;
  deviceId: string;
}

export async function loginWithPassword(params: {
  request: Request;
  login: string;
  password: string;
  deviceId?: string | null;
  tenantId?: string;
}): Promise<{ user: CurrentUser; sessionToken: string; deviceId: string }> {
  const tenantId = normalizeTenantId(params.tenantId);
  const login = params.login.trim().toLowerCase();
  const deviceId = params.deviceId?.trim() || randomBytes(24).toString("hex");

  await ensureSessionStorage();

  return withClient(async (client) => {
    await client.query("BEGIN");

    try {
      let userResult = await client.query(
        `
          SELECT users.id, users.email, users.display_name, users.status,
                 users.password_hash, tenant_members.role
          FROM users
          INNER JOIN tenant_members
            ON tenant_members.user_id = users.id
            AND tenant_members.tenant_id = $2
          WHERE LOWER(users.email) = $1 OR LOWER(users.id) = $1
          LIMIT 1
        `,
        [login, tenantId],
      );

      if (
        userResult.rowCount === 0 &&
        process.env.ADMIN_USERNAME &&
        process.env.ADMIN_PASSWORD &&
        login === process.env.ADMIN_USERNAME.toLowerCase() &&
        params.password === process.env.ADMIN_PASSWORD
      ) {
        await client.query(
          `
            INSERT INTO users (id, email, display_name, status, password_hash)
            VALUES ($1, $2, $3, 'active', $4)
            ON CONFLICT (id)
            DO UPDATE SET
              password_hash = COALESCE(users.password_hash, EXCLUDED.password_hash),
              status = 'active',
              updated_at = NOW()
          `,
          [
            login,
            login.includes("@") ? login : null,
            "Owner",
            hashPassword(params.password),
          ],
        );
        await client.query(
          `
            INSERT INTO tenant_members (tenant_id, user_id, role)
            VALUES ($1, $2, 'owner')
            ON CONFLICT (tenant_id, user_id)
            DO UPDATE SET role = 'owner', updated_at = NOW()
          `,
          [tenantId, login],
        );

        userResult = await client.query(
          `
            SELECT users.id, users.email, users.display_name, users.status,
                   users.password_hash, tenant_members.role
            FROM users
            INNER JOIN tenant_members
              ON tenant_members.user_id = users.id
              AND tenant_members.tenant_id = $2
            WHERE users.id = $1
            LIMIT 1
          `,
          [login, tenantId],
        );
      }

      const user = userResult.rows[0];
      if (
        !user ||
        user.status !== "active" ||
        !verifyPassword(params.password, user.password_hash)
      ) {
        await client.query("ROLLBACK");
        throw new Error("Invalid username or password");
      }

      const activeSessions = await client.query(
        `
          SELECT id, device_id
          FROM user_sessions
          WHERE tenant_id = $1
            AND user_id = $2
            AND revoked_at IS NULL
            AND expires_at > NOW()
        `,
        [tenantId, user.id],
      );

      // Revoke all other active sessions from different devices
      for (const session of activeSessions.rows) {
        if (String(session.device_id) !== deviceId) {
          await client.query(
            `
              UPDATE user_sessions
              SET revoked_at = NOW()
              WHERE id = $1
            `,
            [session.id],
          );
        }
      }

      await client.query(
        `
          UPDATE user_sessions
          SET revoked_at = NOW()
          WHERE tenant_id = $1
            AND user_id = $2
            AND device_id = $3
            AND revoked_at IS NULL
        `,
        [tenantId, user.id, deviceId],
      );

      const sessionToken = randomBytes(48).toString("base64url");
      const sessionId = randomBytes(16).toString("hex");
      const expiresAt = getSessionExpiry();
      await client.query(
        `
          INSERT INTO user_sessions (
            id, tenant_id, user_id, device_id, session_token_hash,
            ip_address, user_agent, expires_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        `,
        [
          sessionId,
          tenantId,
          user.id,
          deviceId,
          hashToken(sessionToken),
          getIpAddress(params.request),
          params.request.headers.get("user-agent"),
          expiresAt,
        ],
      );

      await client.query(
        "UPDATE users SET last_login_at = NOW(), updated_at = NOW() WHERE id = $1",
        [user.id],
      );

      await client.query("COMMIT");

      return {
        sessionToken,
        deviceId,
        user: {
          id: String(user.id),
          email: user.email,
          displayName: user.display_name,
          tenantId,
          role: String(user.role),
          status: String(user.status),
          sessionId,
          deviceId,
        },
      };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    }
  });
}

export async function getCurrentUser(
  request: Request,
): Promise<CurrentUser | null> {
  const sessionToken = request.headers
    .get("cookie")
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${SESSION_COOKIE_NAME}=`))
    ?.slice(SESSION_COOKIE_NAME.length + 1);

  if (!sessionToken) {
    return null;
  }

  await ensureSessionStorage();
  const tokenHash = hashToken(sessionToken);

  return withClient(async (client) => {
    const result = await client.query(
      `
        SELECT user_sessions.id AS session_id,
               user_sessions.tenant_id,
               user_sessions.device_id,
               users.id AS user_id,
               users.email,
               users.display_name,
               users.status,
               tenant_members.role
        FROM user_sessions
        INNER JOIN users ON users.id = user_sessions.user_id
        INNER JOIN tenant_members
          ON tenant_members.user_id = users.id
          AND tenant_members.tenant_id = user_sessions.tenant_id
        WHERE user_sessions.session_token_hash = $1
          AND user_sessions.revoked_at IS NULL
          AND user_sessions.expires_at > NOW()
        LIMIT 1
      `,
      [tokenHash],
    );

    const row = result.rows[0];
    if (!row || row.status !== "active") {
      return null;
    }

    await client.query(
      "UPDATE user_sessions SET last_seen_at = NOW() WHERE id = $1",
      [row.session_id],
    );

    return {
      id: String(row.user_id),
      email: row.email,
      displayName: row.display_name,
      tenantId: String(row.tenant_id),
      role: String(row.role),
      status: String(row.status),
      sessionId: String(row.session_id),
      deviceId: String(row.device_id),
    };
  });
}

export async function revokeCurrentSession(request: Request): Promise<void> {
  const user = await getCurrentUser(request);
  if (!user) return;

  await withClient((client) =>
    client.query("UPDATE user_sessions SET revoked_at = NOW() WHERE id = $1", [
      user.sessionId,
    ]),
  );
}

export async function revokeUserSessions(params: {
  tenantId?: string;
  userId: string;
}): Promise<void> {
  await ensureSessionStorage();
  await withClient((client) =>
    client.query(
      `
        UPDATE user_sessions
        SET revoked_at = NOW()
        WHERE tenant_id = $1 AND user_id = $2 AND revoked_at IS NULL
      `,
      [normalizeTenantId(params.tenantId), params.userId],
    ),
  );
}
