export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({
    ok: true,
    service: "find-app",
    timestamp: new Date().toISOString(),
  });
}
