import { checkRedisConnection } from "@/lib/redis";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const result = await checkRedisConnection();

  return Response.json(result, {
    status: result.ok ? 200 : 503,
  });
}
