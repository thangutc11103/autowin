/**
 * Shared OAuth provider configuration and token exchange helpers.
 */

import type { OAuthAccount } from "@/lib/oauth-storage";

export type OAuthProvider = "tiktok" | "meta" | "facebook" | "instagram" | "youtube";

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  open_id?: string;
  scope?: string;
  token_type?: string;
}

interface OAuthProviderConfig {
  provider: OAuthProvider;
  label: string;
  stateCookie: string;
  callbackPath: string;
  requiredEnv: string[];
  getAuthUrl: (state: string) => string;
  exchangeCode: (code: string) => Promise<TokenResponse>;
  toAccounts: (tokenData: TokenResponse) => OAuthAccount[];
}

function getAppUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.NEXT_PUBLIC_API_URL?.trim() ||
    "http://localhost:3000"
  ).replace(/\/$/, "");
}

function getRedirectUri(path: string): string {
  return `${getAppUrl()}${path}`;
}

function getPostAuthRedirectUrl(): string {
  return (
    process.env.OAUTH_SUCCESS_REDIRECT_URL?.trim() ||
    "http://localhost:3000/accounts"
  );
}

function getEnv(name: string): string {
  return process.env[name]?.trim() || "";
}

function getEnvList(name: string, fallback: string): string {
  return getEnv(name) || fallback;
}

const defaultTikTokScopes = "user.info.basic,video.publish";

function expiresAt(expiresIn?: number): string | undefined {
  if (!expiresIn) return undefined;
  return new Date(Date.now() + expiresIn * 1000).toISOString();
}

function createOAuthError(provider: string, response: Response, body: string) {
  return new Error(
    `${provider} OAuth error: ${response.status} ${response.statusText} ${body}`.trim(),
  );
}

const metaScopes =
  "instagram_basic,instagram_content_publish,pages_read_engagement,pages_manage_posts";

export const OAUTH_PROVIDERS: Record<OAuthProvider, OAuthProviderConfig> = {
  tiktok: {
    provider: "tiktok",
    label: "TikTok",
    stateCookie: "oauth_state_tiktok",
    callbackPath: "/api/auth/tiktok/callback",
    requiredEnv: ["TIKTOK_CLIENT_KEY", "TIKTOK_CLIENT_SECRET"],
    getAuthUrl(state: string) {
      const params = new URLSearchParams({
        client_key: getEnv("TIKTOK_CLIENT_KEY"),
        response_type: "code",
        scope: getEnvList("TIKTOK_SCOPES", defaultTikTokScopes),
        redirect_uri: getRedirectUri(this.callbackPath),
        state,
      });

      return `https://www.tiktok.com/v2/auth/authorize/?${params.toString()}`;
    },
    async exchangeCode(code: string) {
      const response = await fetch("https://open.tiktokapis.com/v2/oauth/token/", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          client_key: getEnv("TIKTOK_CLIENT_KEY"),
          client_secret: getEnv("TIKTOK_CLIENT_SECRET"),
          code,
          grant_type: "authorization_code",
          redirect_uri: getRedirectUri(this.callbackPath),
        }).toString(),
      });

      if (!response.ok) {
        throw createOAuthError("TikTok", response, await response.text());
      }

      return response.json();
    },
    toAccounts(tokenData) {
      return [
        {
          platform: "tiktok",
          accessToken: tokenData.access_token,
          refreshToken: tokenData.refresh_token,
          expiresAt: expiresAt(tokenData.expires_in),
          scope: tokenData.scope,
          handle: tokenData.open_id,
          connectedAt: new Date().toISOString(),
        },
      ];
    },
  },
  meta: {
    provider: "meta",
    label: "Meta",
    stateCookie: "oauth_state_meta",
    callbackPath: "/api/auth/meta/callback",
    requiredEnv: ["META_APP_ID", "META_APP_SECRET"],
    getAuthUrl(state: string) {
      const params = new URLSearchParams({
        client_id: getEnv("META_APP_ID"),
        redirect_uri: getRedirectUri(this.callbackPath),
        state,
        scope: metaScopes,
        response_type: "code",
      });

      return `https://www.facebook.com/v18.0/dialog/oauth?${params.toString()}`;
    },
    async exchangeCode(code: string) {
      const response = await fetch("https://graph.facebook.com/v18.0/oauth/access_token", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          client_id: getEnv("META_APP_ID"),
          client_secret: getEnv("META_APP_SECRET"),
          grant_type: "authorization_code",
          redirect_uri: getRedirectUri(this.callbackPath),
          code,
        }).toString(),
      });

      if (!response.ok) {
        throw createOAuthError("Meta", response, await response.text());
      }

      return response.json();
    },
    toAccounts(tokenData) {
      const connectedAt = new Date().toISOString();

      return [
        {
          platform: "facebook",
          accessToken: tokenData.access_token,
          scope: tokenData.scope,
          connectedAt,
        },
        {
          platform: "instagram",
          accessToken: tokenData.access_token,
          scope: tokenData.scope,
          connectedAt,
        },
      ];
    },
  },
  facebook: {
    provider: "facebook",
    label: "Facebook",
    stateCookie: "oauth_state_meta",
    callbackPath: "/api/auth/meta/callback",
    requiredEnv: ["META_APP_ID", "META_APP_SECRET"],
    getAuthUrl(state: string) {
      const params = new URLSearchParams({
        client_id: getEnv("META_APP_ID"),
        redirect_uri: getRedirectUri(this.callbackPath),
        state,
        scope: metaScopes,
        response_type: "code",
      });

      return `https://www.facebook.com/v18.0/dialog/oauth?${params.toString()}`;
    },
    async exchangeCode(code: string) {
      const response = await fetch("https://graph.facebook.com/v18.0/oauth/access_token", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          client_id: getEnv("META_APP_ID"),
          client_secret: getEnv("META_APP_SECRET"),
          grant_type: "authorization_code",
          redirect_uri: getRedirectUri(this.callbackPath),
          code,
        }).toString(),
      });

      if (!response.ok) {
        throw createOAuthError("Facebook", response, await response.text());
      }

      return response.json();
    },
    toAccounts(tokenData) {
      return [
        {
          platform: "facebook",
          accessToken: tokenData.access_token,
          scope: tokenData.scope,
          connectedAt: new Date().toISOString(),
        },
      ];
    },
  },
  instagram: {
    provider: "instagram",
    label: "Instagram",
    stateCookie: "oauth_state_meta",
    callbackPath: "/api/auth/meta/callback",
    requiredEnv: ["META_APP_ID", "META_APP_SECRET"],
    getAuthUrl(state: string) {
      const params = new URLSearchParams({
        client_id: getEnv("META_APP_ID"),
        redirect_uri: getRedirectUri(this.callbackPath),
        state,
        scope: metaScopes,
        response_type: "code",
      });

      return `https://www.facebook.com/v18.0/dialog/oauth?${params.toString()}`;
    },
    async exchangeCode(code: string) {
      const response = await fetch("https://graph.facebook.com/v18.0/oauth/access_token", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          client_id: getEnv("META_APP_ID"),
          client_secret: getEnv("META_APP_SECRET"),
          grant_type: "authorization_code",
          redirect_uri: getRedirectUri(this.callbackPath),
          code,
        }).toString(),
      });

      if (!response.ok) {
        throw createOAuthError("Instagram", response, await response.text());
      }

      return response.json();
    },
    toAccounts(tokenData) {
      return [
        {
          platform: "instagram",
          accessToken: tokenData.access_token,
          scope: tokenData.scope,
          connectedAt: new Date().toISOString(),
        },
      ];
    },
  },
  youtube: {
    provider: "youtube",
    label: "YouTube",
    stateCookie: "oauth_state_youtube",
    callbackPath: "/api/auth/youtube/callback",
    requiredEnv: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"],
    getAuthUrl(state: string) {
      const params = new URLSearchParams({
        client_id: getEnv("GOOGLE_CLIENT_ID"),
        redirect_uri: getRedirectUri(this.callbackPath),
        response_type: "code",
        scope:
          "https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/userinfo.profile",
        state,
        access_type: "offline",
        prompt: "consent",
      });

      return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
    },
    async exchangeCode(code: string) {
      const response = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          client_id: getEnv("GOOGLE_CLIENT_ID"),
          client_secret: getEnv("GOOGLE_CLIENT_SECRET"),
          code,
          grant_type: "authorization_code",
          redirect_uri: getRedirectUri(this.callbackPath),
        }).toString(),
      });

      if (!response.ok) {
        throw createOAuthError("Google", response, await response.text());
      }

      return response.json();
    },
    toAccounts(tokenData) {
      return [
        {
          platform: "youtube",
          accessToken: tokenData.access_token,
          refreshToken: tokenData.refresh_token,
          expiresAt: expiresAt(tokenData.expires_in),
          scope: tokenData.scope,
          connectedAt: new Date().toISOString(),
        },
      ];
    },
  },
};

export function getOAuthProvider(provider: string): OAuthProviderConfig | null {
  if (provider in OAUTH_PROVIDERS) {
    return OAUTH_PROVIDERS[provider as OAuthProvider];
  }

  return null;
}

export function getAccountsRedirect(provider: OAuthProvider, result: "success" | "error") {
  const redirectUrl = new URL(getPostAuthRedirectUrl());
  redirectUrl.searchParams.set("oauth", provider);
  redirectUrl.searchParams.set(result, "true");

  return redirectUrl;
}

export function getMissingEnv(config: OAuthProviderConfig): string[] {
  return config.requiredEnv.filter((name) => !getEnv(name));
}

export function shouldUseSecureCookie(): boolean {
  return getAppUrl().startsWith("https://");
}

export function createOAuthState(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);

  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function getTikTokAuthUrl(state: string): string {
  return OAUTH_PROVIDERS.tiktok.getAuthUrl(state);
}

export function getMetaAuthUrl(state: string): string {
  return OAUTH_PROVIDERS.meta.getAuthUrl(state);
}

export function getGoogleAuthUrl(state: string): string {
  return OAUTH_PROVIDERS.youtube.getAuthUrl(state);
}

export function exchangeTikTokCode(code: string): Promise<TokenResponse> {
  return OAUTH_PROVIDERS.tiktok.exchangeCode(code);
}

export function exchangeMetaCode(code: string): Promise<TokenResponse> {
  return OAUTH_PROVIDERS.meta.exchangeCode(code);
}

export function exchangeGoogleCode(code: string): Promise<TokenResponse> {
  return OAUTH_PROVIDERS.youtube.exchangeCode(code);
}
