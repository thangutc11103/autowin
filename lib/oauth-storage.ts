import { randomUUID } from "crypto";
import { Pool, type PoolClient } from "pg";
import { ensureTenant } from "@/lib/database/tenant-storage";
import { decryptSecret, encryptSecret } from "@/lib/security/encryption";
import { DEFAULT_TENANT_ID, normalizeTenantId } from "@/lib/tenant-context";

export interface OAuthAccount {
  tenantId?: string;
  userId?: string;
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
  tenantId?: string;
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
  tenantId?: string;
  type: "account_added" | "oauth_error" | "oauth_callback";
  provider?: string;
  platform?: OAuthAccount["platform"];
  message: string;
  createdAt: string;
  details?: Record<string, string | number | boolean | null | undefined>;
}

export interface OAuthStateRecord {
  state: string;
  tenantId: string;
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
          tenant_id TEXT NOT NULL DEFAULT 'default',
          user_id TEXT,
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
        ALTER TABLE oauth_accounts
        ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'default';
      `);

      await client.query(`
        ALTER TABLE oauth_accounts
        ADD COLUMN IF NOT EXISTS user_id TEXT;
      `);

      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_oauth_accounts_platform
        ON oauth_accounts (platform);
      `);

      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_oauth_accounts_tenant_platform
        ON oauth_accounts (tenant_id, platform);
      `);

      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_oauth_accounts_tenant_user_platform
        ON oauth_accounts (tenant_id, user_id, platform);
      `);

      await client.query(`
        CREATE TABLE IF NOT EXISTS oauth_debug_events (
          id TEXT PRIMARY KEY,
          tenant_id TEXT NOT NULL DEFAULT 'default',
          type TEXT NOT NULL,
          provider TEXT,
          platform TEXT,
          message TEXT NOT NULL,
          details JSONB NOT NULL DEFAULT '{}'::JSONB,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `);

      await client.query(`
        ALTER TABLE oauth_debug_events
        ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'default';
      `);

      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_oauth_debug_events_created_at
        ON oauth_debug_events (created_at DESC);
      `);

      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_oauth_debug_events_tenant_created_at
        ON oauth_debug_events (tenant_id, created_at DESC);
      `);

      await client.query(`
        CREATE TABLE IF NOT EXISTS oauth_states (
          state TEXT PRIMARY KEY,
          tenant_id TEXT NOT NULL DEFAULT 'default',
          user_id TEXT,
          provider TEXT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          expires_at TIMESTAMPTZ NOT NULL
        );
      `);

      await client.query(`
        ALTER TABLE oauth_states
        ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'default';
      `);

      await client.query(`
        ALTER TABLE oauth_states
        ADD COLUMN IF NOT EXISTS user_id TEXT;
      `);

      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_oauth_states_expires_at
        ON oauth_states (expires_at);
      `);

      await client.query(`
        CREATE TABLE IF NOT EXISTS oauth_account_pages (
          id TEXT PRIMARY KEY,
          tenant_id TEXT NOT NULL DEFAULT 'default',
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
        ALTER TABLE oauth_account_pages
        ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'default';
      `);

      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_oauth_account_pages_account_key
        ON oauth_account_pages (account_key);
      `);

      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_oauth_account_pages_tenant_account
        ON oauth_account_pages (tenant_id, account_key);
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
  tenant_id?: string | null;
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
    tenantId: row.tenant_id || DEFAULT_TENANT_ID,
    accountKey: row.account_key,
    platform: row.platform,
    pageId: row.page_id,
    pageName: row.page_name,
    pageAccessToken: decryptSecret(row.page_access_token),
    instagramBusinessAccountId: row.instagram_business_account_id || undefined,
    instagramUsername: row.instagram_username || undefined,
    isDefault: row.is_default,
    syncedAt: new Date(row.synced_at).toISOString(),
  };
}

function getAccountKey(account: OAuthAccount, tenantId: string): string {
  return `${tenantId}-${account.platform}-${account.handle || randomUUID()}`;
}

function mapAccountRow(row: {
  key: string;
  tenant_id?: string | null;
  user_id?: string | null;
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
    tenantId: row.tenant_id || DEFAULT_TENANT_ID,
    userId: row.user_id || undefined,
    platform: row.platform,
    accessToken: decryptSecret(row.access_token) || "",
    refreshToken: decryptSecret(row.refresh_token),
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
  tenant_id?: string | null;
  type: OAuthDebugEvent["type"];
  provider?: string | null;
  platform?: OAuthAccount["platform"] | null;
  message: string;
  details?: Record<string, string | number | boolean | null | undefined> | null;
  created_at: Date | string;
}): OAuthDebugEvent {
  return {
    id: row.id,
    tenantId: row.tenant_id || DEFAULT_TENANT_ID,
    type: row.type,
    provider: row.provider || undefined,
    platform: row.platform || undefined,
    message: row.message,
    details: row.details || undefined,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

export class OAuthStorage {
  async addAccount(account: OAuthAccount, tenantId?: string): Promise<string> {
    const scopedTenantId = normalizeTenantId(tenantId || account.tenantId);
    await ensureTenant(scopedTenantId);
    await ensureOAuthStorage();

    const key = getAccountKey(account, scopedTenantId);

    await withClient((client) =>
      client.query(
        `
          INSERT INTO oauth_accounts (
            key,
            tenant_id,
            user_id,
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
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
          ON CONFLICT (key)
          DO UPDATE SET
            tenant_id = EXCLUDED.tenant_id,
            user_id = EXCLUDED.user_id,
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
          scopedTenantId,
          account.userId ?? null,
          account.platform,
          encryptSecret(account.accessToken),
          encryptSecret(account.refreshToken),
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
    }, scopedTenantId);

    return key;
  }

  async getAccounts(params?: { tenantId?: string; userId?: string | null; platform?: string }): Promise<OAuthAccount[]> {
    const accounts = await this.getStoredAccounts(params);
    return accounts.map((storedAccount) => ({
      tenantId: storedAccount.tenantId,
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

  async getStoredAccounts(params?: { tenantId?: string; userId?: string | null; platform?: string }): Promise<StoredOAuthAccount[]> {
    const tenantId = normalizeTenantId(params?.tenantId);
    await ensureOAuthStorage();

    return withClient(async (client) => {
      const result = await client.query(
        `
          SELECT
            key,
            tenant_id,
            user_id,
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
          WHERE tenant_id = $1
            AND ($2::TEXT IS NULL OR platform = $2)
            AND ($3::TEXT IS NULL OR user_id = $3)
          ORDER BY connected_at DESC
        `,
        [tenantId, params?.platform ?? null, params?.userId ?? null],
      );

      return result.rows.map(mapAccountRow);
    });
  }

  async getStoredAccount(key: string, tenantId?: string): Promise<StoredOAuthAccount | null> {
    const scopedTenantId = normalizeTenantId(tenantId);
    await ensureOAuthStorage();

    return withClient(async (client) => {
      const result = await client.query(
        `
          SELECT
            key,
            tenant_id,
            user_id,
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
          WHERE key = $1 AND tenant_id = $2
          LIMIT 1
        `,
        [key, scopedTenantId],
      );

      return result.rows[0] ? mapAccountRow(result.rows[0]) : null;
    });
  }

  async removeAccount(key: string, tenantId?: string): Promise<void> {
    const scopedTenantId = normalizeTenantId(tenantId);
    await ensureOAuthStorage();

    await withClient((client) =>
      client.query("DELETE FROM oauth_accounts WHERE key = $1 AND tenant_id = $2", [
        key,
        scopedTenantId,
      ]),
    );
  }

  async updateAccountLabel(key: string, label: string | null, tenantId?: string): Promise<void> {
    const scopedTenantId = normalizeTenantId(tenantId);
    await ensureOAuthStorage();

    await withClient((client) =>
      client.query(
        `
          UPDATE oauth_accounts
          SET label = $2, updated_at = NOW()
          WHERE key = $1 AND tenant_id = $3
        `,
        [key, label, scopedTenantId],
      ),
    );
  }

  async upsertAccountPages(pages: OAuthAccountPage[], tenantId?: string): Promise<void> {
    if (pages.length === 0) return;

    const scopedTenantId = normalizeTenantId(tenantId || pages[0]?.tenantId);
    await ensureTenant(scopedTenantId);
    await ensureOAuthStorage();

    await withClient(async (client) => {
      await client.query("BEGIN");

      try {
        for (const page of pages) {
          await client.query(
            `
              INSERT INTO oauth_account_pages (
                id,
                tenant_id,
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
              VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
              ON CONFLICT (account_key, platform, page_id)
              DO UPDATE SET
                tenant_id = EXCLUDED.tenant_id,
                page_name = EXCLUDED.page_name,
                page_access_token = EXCLUDED.page_access_token,
                instagram_business_account_id = EXCLUDED.instagram_business_account_id,
                instagram_username = EXCLUDED.instagram_username,
                synced_at = NOW()
            `,
            [
              page.id,
              scopedTenantId,
              page.accountKey,
              page.platform,
              page.pageId,
              page.pageName,
              encryptSecret(page.pageAccessToken),
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

  async getAccountPages(
    params?: string | { tenantId?: string; accountKey?: string },
  ): Promise<OAuthAccountPage[]> {
    const query =
      typeof params === "string" ? { accountKey: params } : params || {};
    const tenantId = normalizeTenantId(query.tenantId);
    await ensureOAuthStorage();

    return withClient(async (client) => {
      const result = await client.query(
        `
          SELECT
            id,
            tenant_id,
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
          WHERE tenant_id = $1
            AND ($2::TEXT IS NULL OR account_key = $2)
          ORDER BY platform ASC, is_default DESC, page_name ASC
        `,
        [tenantId, query.accountKey ?? null],
      );

      return result.rows.map(mapPageRow);
    });
  }

  async setDefaultAccountPage(params: {
    accountKey: string;
    pageRecordId: string;
    tenantId?: string;
  }): Promise<void> {
    const tenantId = normalizeTenantId(params.tenantId);
    await ensureOAuthStorage();

    await withClient(async (client) => {
      await client.query("BEGIN");

      try {
        const pageResult = await client.query(
          `
            SELECT platform
            FROM oauth_account_pages
            WHERE id = $1 AND account_key = $2 AND tenant_id = $3
            LIMIT 1
          `,
          [params.pageRecordId, params.accountKey, tenantId],
        );
        const platform = pageResult.rows[0]?.platform;

        if (!platform) {
          throw new Error("Page was not found for this account");
        }

        await client.query(
          `
            UPDATE oauth_account_pages
            SET is_default = FALSE
            WHERE account_key = $1 AND platform = $2 AND tenant_id = $3
          `,
          [params.accountKey, platform, tenantId],
        );
        await client.query(
          `
            UPDATE oauth_account_pages
            SET is_default = TRUE
            WHERE id = $1 AND account_key = $2 AND tenant_id = $3
          `,
          [params.pageRecordId, params.accountKey, tenantId],
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
    tenantId?: string,
  ): Promise<OAuthDebugEvent> {
    const scopedTenantId = normalizeTenantId(tenantId || event.tenantId);
    await ensureOAuthStorage();

    const id = randomUUID();
    const createdAt = new Date().toISOString();

    await withClient((client) =>
      client.query(
        `
          INSERT INTO oauth_debug_events (
            id,
            tenant_id,
            type,
            provider,
            platform,
            message,
            details,
            created_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7::JSONB, $8)
        `,
        [
          id,
          scopedTenantId,
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
      tenantId: scopedTenantId,
      id,
      createdAt,
    };
  }

  async getDebugEvents(tenantId?: string): Promise<OAuthDebugEvent[]> {
    const scopedTenantId = normalizeTenantId(tenantId);
    await ensureOAuthStorage();

    return withClient(async (client) => {
      const result = await client.query(
        `
        SELECT
          id,
          tenant_id,
          type,
          provider,
          platform,
          message,
          details,
          created_at
        FROM oauth_debug_events
        WHERE tenant_id = $1
        ORDER BY created_at DESC
        LIMIT 50
      `,
        [scopedTenantId],
      );

      return result.rows.map(mapDebugEventRow);
    });
  }

  async saveOAuthState(params: {
    state: string;
    provider: string;
    tenantId?: string;
    userId?: string | null;
    ttlSeconds?: number;
  }): Promise<void> {
    const tenantId = normalizeTenantId(params.tenantId);
    await ensureTenant(tenantId);
    await ensureOAuthStorage();

    const ttlSeconds = params.ttlSeconds ?? 10 * 60;

    await withClient((client) =>
      client.query(
        `
          INSERT INTO oauth_states (state, tenant_id, user_id, provider, expires_at)
          VALUES ($1, $2, $3, $4, NOW() + ($5::INT * INTERVAL '1 second'))
          ON CONFLICT (state)
          DO UPDATE SET
            tenant_id = EXCLUDED.tenant_id,
            user_id = EXCLUDED.user_id,
            provider = EXCLUDED.provider,
            expires_at = EXCLUDED.expires_at,
            created_at = NOW()
        `,
        [params.state, tenantId, params.userId ?? null, params.provider, ttlSeconds],
      ),
    );
  }

  async consumeOAuthState(params: {
    state: string;
    provider: string;
  }): Promise<{ valid: boolean; tenantId?: string; userId?: string }> {
    await ensureOAuthStorage();

    return withClient(async (client) => {
      await client.query("DELETE FROM oauth_states WHERE expires_at < NOW()");

      const result = await client.query(
        `
          DELETE FROM oauth_states
          WHERE state = $1
            AND provider = $2
            AND expires_at >= NOW()
          RETURNING state, tenant_id, user_id
        `,
        [params.state, params.provider],
      );

      const row = result.rows[0];
      return {
        valid: (result.rowCount || 0) > 0,
        tenantId: row?.tenant_id || undefined,
        userId: row?.user_id || undefined,
      };
    });
  }
}

export const oauthStorage = new OAuthStorage();
