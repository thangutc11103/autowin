import { checkDatabaseConnection } from "@/lib/database/health";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const result = await checkDatabaseConnection();

  return Response.json(result, {
    status: result.ok ? 200 : 503,
  });
}
