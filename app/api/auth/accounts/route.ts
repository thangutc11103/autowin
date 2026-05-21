import { NextResponse } from "next/server";
import { requireFeature } from "@/lib/auth/access-control";
import { oauthStorage } from "@/lib/oauth-storage";
import { getTenantIdFromRequest } from "@/lib/tenant-context";
import { getCurrentUser } from "@/lib/auth/session-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const META_GRAPH_VERSION = "v21.0";

function maskToken(token?: string) {
  if (!token) return null;
  if (token.length <= 12) return "***";

  return `${token.slice(0, 6)}...${token.slice(-4)}`;
}

function isMetaAccount(platform: string) {
  return platform === "meta" || platform === "facebook" || platform === "instagram";
}

async function revokeMetaPermissions(accessToken: string) {
  const url = new URL(
    `https://graph.facebook.com/${META_GRAPH_VERSION}/me/permissions`,
  );
  url.searchParams.set("access_token", accessToken);

  const response = await fetch(url, { method: "DELETE" });
  const body = await response.text();

  if (!response.ok) {
    throw new Error(
      `Meta revoke failed: ${response.status} ${response.statusText} ${body}`.trim(),
    );
  }
}

export async function GET(request: Request) {
  try {
    const tenantId = getTenantIdFromRequest(request);
    const permissionError = await requireFeature({
      request,
      tenantId,
      featureKey: "manage_accounts",
    });
    if (permissionError) return permissionError;

    const currentUser = await getCurrentUser(request);
    const storedAccounts = await oauthStorage.getStoredAccounts({
      tenantId,
      userId:
        currentUser &&
        currentUser.role !== "owner" &&
        currentUser.role !== "admin"
          ? currentUser.id
          : null,
    });
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
  } catch (error) {
    console.error("[GET /api/auth/accounts]", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to load accounts",
      },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const tenantId = getTenantIdFromRequest(request);
    const permissionError = await requireFeature({
      request,
      tenantId,
      featureKey: "manage_accounts",
    });
    if (permissionError) return permissionError;

    const body = (await request.json()) as {
      key?: string;
      label?: string | null;
    };

    if (!body.key) {
      return NextResponse.json(
        { error: "Missing account key" },
        { status: 400 },
      );
    }

    const label = body.label?.trim() || null;
    await oauthStorage.updateAccountLabel(body.key, label, tenantId);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[PATCH /api/auth/accounts]", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to update account",
      },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const tenantId = getTenantIdFromRequest(request);
    const permissionError = await requireFeature({
      request,
      tenantId,
      featureKey: "manage_accounts",
    });
    if (permissionError) return permissionError;

    const { searchParams } = new URL(request.url);
    const key = searchParams.get("key");

    if (!key) {
      return NextResponse.json(
        { error: "Missing account key" },
        { status: 400 },
      );
    }

    const account = await oauthStorage.getStoredAccount(key, tenantId);
    let revokeWarning: string | undefined;

    if (account && isMetaAccount(account.platform)) {
      try {
        await revokeMetaPermissions(account.accessToken);
        await oauthStorage.addDebugEvent(
          {
            type: "oauth_callback",
            provider: "meta",
            platform: account.platform,
            message: "Meta permissions revoked during account disconnect",
            details: { key },
          },
          tenantId,
        );
      } catch (error) {
        revokeWarning =
          error instanceof Error
            ? error.message.slice(0, 500)
            : "Failed to revoke Meta permissions";
        console.warn("[DELETE /api/auth/accounts] Meta revoke warning", {
          key,
          warning: revokeWarning,
        });
        await oauthStorage.addDebugEvent(
          {
            type: "oauth_error",
            provider: "meta",
            platform: account.platform,
            message: "Meta permission revoke failed during account disconnect",
            details: { key, warning: revokeWarning },
          },
          tenantId,
        );
      }
    }

    await oauthStorage.removeAccount(key, tenantId);

    return NextResponse.json({ success: true, revokeWarning });
  } catch (error) {
    console.error("[DELETE /api/auth/accounts]", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to delete account",
      },
      { status: 500 },
    );
  }
}
