import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { oauthStorage, type OAuthAccountPage } from "@/lib/oauth-storage";
import { getTenantIdFromRequest } from "@/lib/tenant-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface MetaPageResponse {
  data?: Array<{
    id: string;
    name?: string;
    access_token?: string;
    instagram_business_account?: {
      id: string;
      username?: string;
      name?: string;
    };
  }>;
  error?: {
    message?: string;
  };
}

function maskPage(page: OAuthAccountPage) {
  return {
    id: page.id,
    accountKey: page.accountKey,
    platform: page.platform,
    pageId: page.pageId,
    pageName: page.pageName,
    instagramBusinessAccountId: page.instagramBusinessAccountId,
    instagramUsername: page.instagramUsername,
    isDefault: page.isDefault,
    syncedAt: page.syncedAt,
    hasPageAccessToken: Boolean(page.pageAccessToken),
  };
}

async function fetchMetaPages(userAccessToken: string): Promise<OAuthAccountPage[]> {
  const url = new URL("https://graph.facebook.com/v18.0/me/accounts");
  url.searchParams.set(
    "fields",
    "id,name,access_token,instagram_business_account{id,username,name}",
  );
  url.searchParams.set("access_token", userAccessToken);

  const response = await fetch(url);
  const data = (await response.json()) as MetaPageResponse;

  if (!response.ok) {
    throw new Error(data.error?.message || "Failed to fetch Meta pages");
  }

  return (data.data || []).flatMap((page) => {
    const facebookPage: OAuthAccountPage = {
      id: randomUUID(),
      accountKey: "",
      platform: "facebook",
      pageId: page.id,
      pageName: page.name || page.id,
      pageAccessToken: page.access_token,
      isDefault: false,
      syncedAt: new Date().toISOString(),
    };
    const pages = [facebookPage];

    if (page.instagram_business_account?.id) {
      pages.push({
        id: randomUUID(),
        accountKey: "",
        platform: "instagram",
        pageId: page.id,
        pageName: page.name || page.id,
        pageAccessToken: page.access_token,
        instagramBusinessAccountId: page.instagram_business_account.id,
        instagramUsername:
          page.instagram_business_account.username ||
          page.instagram_business_account.name,
        isDefault: false,
        syncedAt: new Date().toISOString(),
      });
    }

    return pages;
  });
}

export async function GET(request: Request) {
  const tenantId = getTenantIdFromRequest(request);
  const { searchParams } = new URL(request.url);
  const accountKey = searchParams.get("accountKey") || undefined;
  const pages = await oauthStorage.getAccountPages({ tenantId, accountKey });

  return NextResponse.json({ pages: pages.map(maskPage) });
}

export async function POST(request: Request) {
  const tenantId = getTenantIdFromRequest(request);
  const body = (await request.json().catch(() => ({}))) as {
    accountKey?: string;
  };

  if (!body.accountKey) {
    return NextResponse.json({ error: "Missing account key" }, { status: 400 });
  }

  const account = await oauthStorage.getStoredAccount(body.accountKey, tenantId);

  if (!account) {
    return NextResponse.json({ error: "Account not found" }, { status: 404 });
  }

  if (account.platform !== "facebook" && account.platform !== "instagram") {
    return NextResponse.json(
      { error: "Page sync is only available for Meta accounts" },
      { status: 400 },
    );
  }

  const pages = (await fetchMetaPages(account.accessToken))
    .filter((page) =>
      account.platform === "instagram"
        ? page.platform === "instagram"
        : page.platform === "facebook",
    )
    .map((page) => ({
      ...page,
      tenantId,
      accountKey: body.accountKey!,
    }));

  await oauthStorage.upsertAccountPages(pages, tenantId);
  const savedPages = await oauthStorage.getAccountPages({
    tenantId,
    accountKey: body.accountKey,
  });

  return NextResponse.json({
    success: true,
    pages: savedPages.map(maskPage),
  });
}

export async function PATCH(request: Request) {
  const tenantId = getTenantIdFromRequest(request);
  const body = (await request.json().catch(() => ({}))) as {
    accountKey?: string;
    pageRecordId?: string;
  };

  if (!body.accountKey || !body.pageRecordId) {
    return NextResponse.json(
      { error: "Missing account key or page id" },
      { status: 400 },
    );
  }

  await oauthStorage.setDefaultAccountPage({
    accountKey: body.accountKey,
    pageRecordId: body.pageRecordId,
    tenantId,
  });

  const pages = await oauthStorage.getAccountPages({
    tenantId,
    accountKey: body.accountKey,
  });
  return NextResponse.json({ success: true, pages: pages.map(maskPage) });
}
