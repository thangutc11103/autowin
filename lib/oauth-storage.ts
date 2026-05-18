import { randomUUID } from "crypto";
import { Pool, type PoolClient } from "pg";

export interface OAuthAccount {
  platform: "tiktok" | "facebook" | "instagram" | "youtube";
  accessToken: string;
  refreshToken?: string;
  expiresAt?: string;
  scope?: string;
  handle?: string;
  label?: string;
  displayName?: string;
  profilePicture?: string;
  connectedAt: string;
}

export interface StoredOAuthAccount extends OAuthAccount {
  key: string;
}

export interface OAuthAccountPage {
  id: string;
  accountKey: string;
  platform: "facebook" | "instagram";
  pageId: string;
  pageName: string;
  pageAccessToken?: string;
  instagramBusinessAccountId?: string;
  instagramUsername?: string;
  isDefault: boolean;
  syncedAt: string;
}

export interface OAuthDebugEvent {
  id: string;
  type: "account_added" | "oauth_error" | "oauth_callback";
  provider?: string;
  platform?: OAuthAccount["platform"];
  message: string;
  createdAt: string;
  details?: Record<string, string | number | boolean | null | undefined>;
}

export interface OAuthStateRecord {
  state: string;
  provider: string;
  createdAt: string;
  expiresAt: string;
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
      console.error("[OAUTH_DATABASE] Unexpected pool error:", error.message);
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

async function ensureOAuthStorage(): Promise<void> {
  if (!schemaPromise) {
    schemaPromise = withClient(async (client) => {
      await client.query(`
        CREATE TABLE IF NOT EXISTS oauth_accounts (
          key TEXT PRIMARY KEY,
          platform TEXT NOT NULL,
          access_token TEXT NOT NULL,
          refresh_token TEXT,
          expires_at TIMESTAMPTZ,
          scope TEXT,
          handle TEXT,
          label TEXT,
          display_name TEXT,
          profile_picture TEXT,
          connected_at TIMESTAMPTZ NOT NULL,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `);

      await client.query(`
        ALTER TABLE oauth_accounts
        ADD COLUMN IF NOT EXISTS label TEXT;
      `);

      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_oauth_accounts_platform
        ON oauth_accounts (platform);
      `);

      await client.query(`
        CREATE TABLE IF NOT EXISTS oauth_debug_events (
          id TEXT PRIMARY KEY,
          type TEXT NOT NULL,
          provider TEXT,
          platform TEXT,
          message TEXT NOT NULL,
          details JSONB NOT NULL DEFAULT '{}'::JSONB,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `);

      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_oauth_debug_events_created_at
        ON oauth_debug_events (created_at DESC);
      `);

      await client.query(`
        CREATE TABLE IF NOT EXISTS oauth_states (
          state TEXT PRIMARY KEY,
          provider TEXT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          expires_at TIMESTAMPTZ NOT NULL
        );
      `);

      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_oauth_states_expires_at
        ON oauth_states (expires_at);
      `);

      await client.query(`
        CREATE TABLE IF NOT EXISTS oauth_account_pages (
          id TEXT PRIMARY KEY,
          account_key TEXT NOT NULL REFERENCES oauth_accounts(key) ON DELETE CASCADE,
          platform TEXT NOT NULL,
          page_id TEXT NOT NULL,
          page_name TEXT NOT NULL,
          page_access_token TEXT,
          instagram_business_account_id TEXT,
          instagram_username TEXT,
          is_default BOOLEAN NOT NULL DEFAULT FALSE,
          synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          UNIQUE (account_key, platform, page_id)
        );
      `);

      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_oauth_account_pages_account_key
        ON oauth_account_pages (account_key);
      `);
    }).catch((error) => {
      schemaPromise = null;
      throw error;
    });
  }

  return schemaPromise;
}

function mapPageRow(row: {
  id: string;
  account_key: string;
  platform: "facebook" | "instagram";
  page_id: string;
  page_name: string;
  page_access_token?: string | null;
  instagram_business_account_id?: string | null;
  instagram_username?: string | null;
  is_default: boolean;
  synced_at: Date | string;
}): OAuthAccountPage {
  return {
    id: row.id,
    accountKey: row.account_key,
    platform: row.platform,
    pageId: row.page_id,
    pageName: row.page_name,
    pageAccessToken: row.page_access_token || undefined,
    instagramBusinessAccountId: row.instagram_business_account_id || undefined,
    instagramUsername: row.instagram_username || undefined,
    isDefault: row.is_default,
    syncedAt: new Date(row.synced_at).toISOString(),
  };
}

function getAccountKey(account: OAuthAccount): string {
  return `${account.platform}-${account.handle || randomUUID()}`;
}

function mapAccountRow(row: {
  key: string;
  platform: OAuthAccount["platform"];
  access_token: string;
  refresh_token?: string | null;
  expires_at?: Date | string | null;
  scope?: string | null;
  handle?: string | null;
  label?: string | null;
  display_name?: string | null;
  profile_picture?: string | null;
  connected_at: Date | string;
}): StoredOAuthAccount {
  return {
    key: row.key,
    platform: row.platform,
    accessToken: row.access_token,
    refreshToken: row.refresh_token || undefined,
    expiresAt: row.expires_at
      ? new Date(row.expires_at).toISOString()
      : undefined,
    scope: row.scope || undefined,
    handle: row.handle || undefined,
    label: row.label || undefined,
    displayName: row.display_name || undefined,
    profilePicture: row.profile_picture || undefined,
    connectedAt: new Date(row.connected_at).toISOString(),
  };
}

function mapDebugEventRow(row: {
  id: string;
  type: OAuthDebugEvent["type"];
  provider?: string | null;
  platform?: OAuthAccount["platform"] | null;
  message: string;
  details?: Record<string, string | number | boolean | null | undefined> | null;
  created_at: Date | string;
}): OAuthDebugEvent {
  return {
    id: row.id,
    type: row.type,
    provider: row.provider || undefined,
    platform: row.platform || undefined,
    message: row.message,
    details: row.details || undefined,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

export class OAuthStorage {
  async addAccount(account: OAuthAccount): Promise<string> {
    await ensureOAuthStorage();

    const key = getAccountKey(account);

    await withClient((client) =>
      client.query(
        `
          INSERT INTO oauth_accounts (
            key,
            platform,
            access_token,
            refresh_token,
            expires_at,
            scope,
            handle,
            label,
            display_name,
            profile_picture,
            connected_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
          ON CONFLICT (key)
          DO UPDATE SET
            access_token = EXCLUDED.access_token,
            refresh_token = EXCLUDED.refresh_token,
            expires_at = EXCLUDED.expires_at,
            scope = EXCLUDED.scope,
            handle = EXCLUDED.handle,
            label = COALESCE(oauth_accounts.label, EXCLUDED.label),
            display_name = EXCLUDED.display_name,
            profile_picture = EXCLUDED.profile_picture,
            connected_at = EXCLUDED.connected_at,
            updated_at = NOW()
        `,
        [
          key,
          account.platform,
          account.accessToken,
          account.refreshToken ?? null,
          account.expiresAt ?? null,
          account.scope ?? null,
          account.handle ?? null,
          account.label ?? null,
          account.displayName ?? null,
          account.profilePicture ?? null,
          account.connectedAt,
        ],
      ),
    );

    await this.addDebugEvent({
      type: "account_added",
      platform: account.platform,
      message: `Added ${account.platform} OAuth account`,
      details: {
        key,
        handle: account.handle,
        label: account.label,
        displayName: account.displayName,
        hasRefreshToken: Boolean(account.refreshToken),
        expiresAt: account.expiresAt,
        scope: account.scope,
      },
    });

    return key;
  }

  async getAccounts(platform?: string): Promise<OAuthAccount[]> {
    const accounts = await this.getStoredAccounts(platform);
    return accounts.map((storedAccount) => ({
      platform: storedAccount.platform,
      accessToken: storedAccount.accessToken,
      refreshToken: storedAccount.refreshToken,
      expiresAt: storedAccount.expiresAt,
      scope: storedAccount.scope,
      handle: storedAccount.handle,
      label: storedAccount.label,
      displayName: storedAccount.displayName,
      profilePicture: storedAccount.profilePicture,
      connectedAt: storedAccount.connectedAt,
    }));
  }

  async getStoredAccounts(platform?: string): Promise<StoredOAuthAccount[]> {
    await ensureOAuthStorage();

    return withClient(async (client) => {
      const result = await client.query(
        `
          SELECT
            key,
            platform,
            access_token,
            refresh_token,
            expires_at,
            scope,
            handle,
            label,
            display_name,
            profile_picture,
            connected_at
          FROM oauth_accounts
          WHERE ($1::TEXT IS NULL OR platform = $1)
          ORDER BY connected_at DESC
        `,
        [platform ?? null],
      );

      return result.rows.map(mapAccountRow);
    });
  }

  async getStoredAccount(key: string): Promise<StoredOAuthAccount | null> {
    await ensureOAuthStorage();

    return withClient(async (client) => {
      const result = await client.query(
        `
          SELECT
            key,
            platform,
            access_token,
            refresh_token,
            expires_at,
            scope,
            handle,
            label,
            display_name,
            profile_picture,
            connected_at
          FROM oauth_accounts
          WHERE key = $1
          LIMIT 1
        `,
        [key],
      );

      return result.rows[0] ? mapAccountRow(result.rows[0]) : null;
    });
  }

  async removeAccount(key: string): Promise<void> {
    await ensureOAuthStorage();

    await withClient((client) =>
      client.query("DELETE FROM oauth_accounts WHERE key = $1", [key]),
    );
  }

  async updateAccountLabel(key: string, label: string | null): Promise<void> {
    await ensureOAuthStorage();

    await withClient((client) =>
      client.query(
        `
          UPDATE oauth_accounts
          SET label = $2, updated_at = NOW()
          WHERE key = $1
        `,
        [key, label],
      ),
    );
  }

  async upsertAccountPages(pages: OAuthAccountPage[]): Promise<void> {
    if (pages.length === 0) return;

    await ensureOAuthStorage();

    await withClient(async (client) => {
      await client.query("BEGIN");

      try {
        for (const page of pages) {
          await client.query(
            `
              INSERT INTO oauth_account_pages (
                id,
                account_key,
                platform,
                page_id,
                page_name,
                page_access_token,
                instagram_business_account_id,
                instagram_username,
                is_default,
                synced_at
              )
              VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
              ON CONFLICT (account_key, platform, page_id)
              DO UPDATE SET
                page_name = EXCLUDED.page_name,
                page_access_token = EXCLUDED.page_access_token,
                instagram_business_account_id = EXCLUDED.instagram_business_account_id,
                instagram_username = EXCLUDED.instagram_username,
                synced_at = NOW()
            `,
            [
              page.id,
              page.accountKey,
              page.platform,
              page.pageId,
              page.pageName,
              page.pageAccessToken ?? null,
              page.instagramBusinessAccountId ?? null,
              page.instagramUsername ?? null,
              page.isDefault,
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

  async getAccountPages(accountKey?: string): Promise<OAuthAccountPage[]> {
    await ensureOAuthStorage();

    return withClient(async (client) => {
      const result = await client.query(
        `
          SELECT
            id,
            account_key,
            platform,
            page_id,
            page_name,
            page_access_token,
            instagram_business_account_id,
            instagram_username,
            is_default,
            synced_at
          FROM oauth_account_pages
          WHERE ($1::TEXT IS NULL OR account_key = $1)
          ORDER BY platform ASC, is_default DESC, page_name ASC
        `,
        [accountKey ?? null],
      );

      return result.rows.map(mapPageRow);
    });
  }

  async setDefaultAccountPage(params: {
    accountKey: string;
    pageRecordId: string;
  }): Promise<void> {
    await ensureOAuthStorage();

    await withClient(async (client) => {
      await client.query("BEGIN");

      try {
        const pageResult = await client.query(
          `
            SELECT platform
            FROM oauth_account_pages
            WHERE id = $1 AND account_key = $2
            LIMIT 1
          `,
          [params.pageRecordId, params.accountKey],
        );
        const platform = pageResult.rows[0]?.platform;

        if (!platform) {
          throw new Error("Page was not found for this account");
        }

        await client.query(
          `
            UPDATE oauth_account_pages
            SET is_default = FALSE
            WHERE account_key = $1 AND platform = $2
          `,
          [params.accountKey, platform],
        );
        await client.query(
          `
            UPDATE oauth_account_pages
            SET is_default = TRUE
            WHERE id = $1 AND account_key = $2
          `,
          [params.pageRecordId, params.accountKey],
        );

        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    });
  }

  async addDebugEvent(
    event: Omit<OAuthDebugEvent, "id" | "createdAt">,
  ): Promise<OAuthDebugEvent> {
    await ensureOAuthStorage();

    const id = randomUUID();
    const createdAt = new Date().toISOString();

    await withClient((client) =>
      client.query(
        `
          INSERT INTO oauth_debug_events (
            id,
            type,
            provider,
            platform,
            message,
            details,
            created_at
          )
          VALUES ($1, $2, $3, $4, $5, $6::JSONB, $7)
        `,
        [
          id,
          event.type,
          event.provider ?? null,
          event.platform ?? null,
          event.message,
          JSON.stringify(event.details || {}),
          createdAt,
        ],
      ),
    );

    return {
      ...event,
      id,
      createdAt,
    };
  }

  async getDebugEvents(): Promise<OAuthDebugEvent[]> {
    await ensureOAuthStorage();

    return withClient(async (client) => {
      const result = await client.query(`
        SELECT
          id,
          type,
          provider,
          platform,
          message,
          details,
          created_at
        FROM oauth_debug_events
        ORDER BY created_at DESC
        LIMIT 50
      `);

      return result.rows.map(mapDebugEventRow);
    });
  }

  async saveOAuthState(params: {
    state: string;
    provider: string;
    ttlSeconds?: number;
  }): Promise<void> {
    await ensureOAuthStorage();

    const ttlSeconds = params.ttlSeconds ?? 10 * 60;

    await withClient((client) =>
      client.query(
        `
          INSERT INTO oauth_states (state, provider, expires_at)
          VALUES ($1, $2, NOW() + ($3::INT * INTERVAL '1 second'))
          ON CONFLICT (state)
          DO UPDATE SET
            provider = EXCLUDED.provider,
            expires_at = EXCLUDED.expires_at,
            created_at = NOW()
        `,
        [params.state, params.provider, ttlSeconds],
      ),
    );
  }

  async consumeOAuthState(params: {
    state: string;
    provider: string;
  }): Promise<boolean> {
    await ensureOAuthStorage();

    return withClient(async (client) => {
      await client.query("DELETE FROM oauth_states WHERE expires_at < NOW()");

      const result = await client.query(
        `
          DELETE FROM oauth_states
          WHERE state = $1
            AND provider = $2
            AND expires_at >= NOW()
          RETURNING state
        `,
        [params.state, params.provider],
      );

      return (result.rowCount || 0) > 0;
    });
  }
}

export const oauthStorage = new OAuthStorage();
