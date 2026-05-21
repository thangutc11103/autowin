const localhostPattern = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/i;

function trimTrailingSlash(value: string): string {
  return value.trim().replace(/\/$/, "");
}

export function normalizePublicUrl(rawUrl: string): string {
  let url = trimTrailingSlash(rawUrl);

  if (!url) {
    return "";
  }

  if (!/^https?:\/\//i.test(url)) {
    url = `https://${url}`;
  }

  if (process.env.NODE_ENV === "production" && localhostPattern.test(url)) {
    throw new Error(
      "Production public app URL cannot use localhost. Set NEXT_PUBLIC_APP_URL to your Railway public URL.",
    );
  }

  if (
    process.env.NODE_ENV === "production" &&
    url.startsWith("http://") &&
    !localhostPattern.test(url)
  ) {
    return url.replace(/^http:\/\//i, "https://");
  }

  return url;
}

function getRailwayPublicUrl(): string {
  return (
    process.env.RAILWAY_PUBLIC_DOMAIN?.trim() ||
    process.env.RAILWAY_STATIC_URL?.trim() ||
    process.env.RAILWAY_PUBLIC_URL?.trim() ||
    ""
  );
}

export function getPublicAppUrl(): string {
  const configuredUrl =
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.NEXT_PUBLIC_API_URL?.trim() ||
    process.env.APP_URL?.trim() ||
    process.env.PUBLIC_APP_URL?.trim() ||
    getRailwayPublicUrl();

  if (configuredUrl) {
    return normalizePublicUrl(configuredUrl);
  }

  throw new Error(
    "Missing public app URL. Set NEXT_PUBLIC_APP_URL to your Railway public URL.",
  );
}

export function getOAuthSuccessRedirectUrl(): string {
  const configuredUrl = process.env.OAUTH_SUCCESS_REDIRECT_URL?.trim();

  if (configuredUrl) {
    return normalizePublicUrl(configuredUrl);
  }

  return `${getPublicAppUrl()}/accounts`;
}

export function getFacebookPublicBaseUrl(): string {
  const configuredUrl = process.env.FACEBOOK_PUBLIC_BASE_URL?.trim();

  if (configuredUrl) {
    return normalizePublicUrl(configuredUrl);
  }

  return getPublicAppUrl();
}
