import { NextResponse } from "next/server";
import { oauthStorage } from "@/lib/oauth-storage";
import { getTenantIdFromRequest } from "@/lib/tenant-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function maskToken(token?: string) {
  if (!token) return null;
  if (token.length <= 12) return "***";

  return `${token.slice(0, 6)}...${token.slice(-4)}`;
}

export async function GET(request: Request) {
  const tenantId = getTenantIdFromRequest(request);
  const storedAccounts = await oauthStorage.getStoredAccounts({ tenantId });
  const debugEvents = await oauthStorage.getDebugEvents(tenantId);
  const accounts = storedAccounts.map((account) => ({
    key: account.key,
    platform: account.platform,
    handle: account.handle,
    label: account.label,
    displayName: account.displayName,
    profilePicture: account.profilePicture,
    expiresAt: account.expiresAt,
    scope: account.scope,
    connectedAt: account.connectedAt,
    hasAccessToken: Boolean(account.accessToken),
    hasRefreshToken: Boolean(account.refreshToken),
    accessTokenPreview: maskToken(account.accessToken),
    refreshTokenPreview: maskToken(account.refreshToken),
  }));

  return NextResponse.json(
    {
      accounts,
      debugEvents,
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}

export async function PATCH(request: Request) {
  const tenantId = getTenantIdFromRequest(request);
  const body = (await request.json()) as {
    key?: string;
    label?: string | null;
  };

  if (!body.key) {
    return NextResponse.json({ error: "Missing account key" }, { status: 400 });
  }

  const label = body.label?.trim() || null;
  await oauthStorage.updateAccountLabel(body.key, label, tenantId);

  return NextResponse.json({ success: true });
}

export async function DELETE(request: Request) {
  const tenantId = getTenantIdFromRequest(request);
  const { searchParams } = new URL(request.url);
  const key = searchParams.get("key");

  if (!key) {
    return NextResponse.json({ error: "Missing account key" }, { status: 400 });
  }

  await oauthStorage.removeAccount(key, tenantId);

  return NextResponse.json({ success: true });
}
