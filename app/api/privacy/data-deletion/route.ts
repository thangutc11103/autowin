import { createHmac, randomUUID } from "crypto";
import { getPublicAppUrl } from "@/lib/app-url";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getConfirmationCode(userId?: string | null): string {
  const secret =
    process.env.DATA_DELETION_SECRET ||
    process.env.ENCRYPTION_KEY ||
    process.env.ADMIN_PASSWORD;

  if (!secret) {
    return `delete-${randomUUID()}`;
  }

  return `delete-${createHmac("sha256", secret)
    .update(userId || randomUUID())
    .digest("hex")
    .slice(0, 24)}`;
}

async function parseMetaPayload(request: Request): Promise<{
  userId?: string | null;
  rawPayload: Record<string, unknown>;
}> {
  const contentType = request.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    const body = (await request.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    return {
      userId:
        typeof body.user_id === "string"
          ? body.user_id
          : typeof body.userId === "string"
            ? body.userId
            : null,
      rawPayload: body,
    };
  }

  const formData = await request.formData().catch(() => null);
  const signedRequest = formData?.get("signed_request");
  const userId = formData?.get("user_id");

  return {
    userId: typeof userId === "string" ? userId : null,
    rawPayload: {
      signed_request:
        typeof signedRequest === "string" ? signedRequest.slice(0, 24) : undefined,
      user_id: typeof userId === "string" ? userId : undefined,
    },
  };
}

export async function POST(request: Request) {
  const { userId, rawPayload } = await parseMetaPayload(request);
  const confirmationCode = getConfirmationCode(userId);
  const statusUrl = `${getPublicAppUrl()}/privacy/data-deletion?code=${encodeURIComponent(
    confirmationCode,
  )}`;

  console.log("[DATA_DELETION] Request received", {
    userId: userId || "unknown",
    rawPayload,
    confirmationCode,
  });

  return Response.json({
    url: statusUrl,
    confirmation_code: confirmationCode,
  });
}

export async function GET() {
  return Response.json({
    ok: true,
    message: "Use POST to submit a data deletion request.",
  });
}
