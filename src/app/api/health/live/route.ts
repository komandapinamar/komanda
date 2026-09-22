import { collectLiveness } from "@/lib/observability/health";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const liveness = collectLiveness();
  return Response.json(liveness, {
    status: 200,
    headers: { "Cache-Control": "no-store" },
  });
}
