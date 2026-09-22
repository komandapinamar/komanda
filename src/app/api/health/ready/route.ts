import { collectReadiness } from "@/lib/observability/health";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const readiness = await collectReadiness();
  return Response.json(readiness, {
    status: readiness.status === "down" ? 503 : 200,
    headers: { "Cache-Control": "no-store" },
  });
}
