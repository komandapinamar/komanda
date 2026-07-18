import { collectHealth } from "@/lib/observability/health";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const health = await collectHealth();
  return Response.json(health, {
    status: health.status === "down" ? 503 : 200,
    headers: { "Cache-Control": "no-store" },
  });
}
