import { readPressureSnapshot } from "@/lib/observability/pressure";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const pressure = await readPressureSnapshot();
  return Response.json(pressure, {
    status: 200,
    headers: { "Cache-Control": "no-store" },
  });
}
