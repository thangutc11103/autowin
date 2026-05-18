import type { Platform } from "./video";

export interface OAuthToken {
  platform: Platform;
  accessToken: string;
  refreshToken?: string;
  expiresAt?: string;
  tokenType?: string;
  scope?: string;
  handle?: string;
  displayName?: string;
  profilePicture?: string;
}

export interface OAuthSession {
  userId: string;
  tokens: OAuthToken[];
  createdAt: string;
  updatedAt: string;
}

export interface OAuthCallbackParams {
  code?: string;
  state?: string;
  error?: string;
  error_description?: string;
}
