import { NextResponse } from "next/server";
import type { Platform } from "@/types/video";
import {
  getPublishFeatureKey,
  requireAccountPermission,
  requireFeature,
} from "@/lib/auth/access-control";
import { oauthStorage } from "@/lib/oauth-storage";
import type { QueuePostTargetInput } from "@/lib/database/posting-storage";

export async function validatePublishingTargets(params: {
  request: Request;
  tenantId: string;
  accountTargets: QueuePostTargetInput[];
}): Promise<Response | null> {
  if (!Array.isArray(params.accountTargets) || params.accountTargets.length === 0) {
    return NextResponse.json(
      { error: "Select at least one publishing account" },
      { status: 400 },
    );
  }

  for (const target of params.accountTargets) {
    const publishPermissionError = await requireFeature({
      request: params.request,
      tenantId: params.tenantId,
      featureKey: getPublishFeatureKey(target.platform),
    });
    if (publishPermissionError) return publishPermissionError;

    const accountPermissionError = await requireAccountPermission({
      request: params.request,
      tenantId: params.tenantId,
      accountKey: target.accountKey,
      action: "post",
    });
    if (accountPermissionError) return accountPermissionError;

    const account = await oauthStorage.getStoredAccount(target.accountKey, params.tenantId);
    if (!account) {
      return NextResponse.json(
        { error: "Selected publishing account was not found" },
        { status: 400 },
      );
    }

    if (target.platform === "facebook" || target.platform === "instagram") {
      const pageError = await hydratePageTarget(params.tenantId, target);
      if (pageError) return pageError;
    }
  }

  return null;
}

async function hydratePageTarget(
  tenantId: string,
  target: QueuePostTargetInput,
): Promise<Response | null> {
  if (!target.pageRecordId) {
    return NextResponse.json(
      { error: "Select a Page target for Facebook or Instagram" },
      { status: 400 },
    );
  }

  const pages = await oauthStorage.getAccountPages({
    tenantId,
    accountKey: target.accountKey,
  });
  const selectedPage = pages.find(
    (page) =>
      page.id === target.pageRecordId &&
      page.platform === (target.platform as Extract<Platform, "facebook" | "instagram">),
  );

  if (!selectedPage) {
    return NextResponse.json(
      { error: "Selected Page target was not found for this account" },
      { status: 400 },
    );
  }

  target.accountLabel ||= selectedPage.pageName;
  target.pageName ||= selectedPage.pageName;
  return null;
}
