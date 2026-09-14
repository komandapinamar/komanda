import { administrativeTenantContext } from "@/features/identity/web/tenant-authority";
import { PrintPairingService } from "@/features/printing/application/print-pairing.service";
import { printingErrorResponse } from "@/features/printing/web/printing-http";
import { correlationIdFromRequest } from "@/lib/observability/request-context";
import { problemResponse } from "@/lib/http/problem";
type Context = { params: Promise<{ tenantId: string }> };
export const runtime = "nodejs";
export async function POST(request: Request, route: Context) {
  const correlationId = correlationIdFromRequest(request);
  const idempotencyKey = request.headers.get("idempotency-key")?.trim();
  if (!idempotencyKey) return problemResponse({ status: 422, title: "Validation failed", code: "IDEMPOTENCY_KEY_REQUIRED", correlationId });
  try { const { tenantId } = await route.params; const context = await administrativeTenantContext(request, tenantId, correlationId); return Response.json(await new PrintPairingService().create(context, await request.json(), idempotencyKey), { status: 201 }); }
  catch (error) { return printingErrorResponse(error, correlationId); }
}
