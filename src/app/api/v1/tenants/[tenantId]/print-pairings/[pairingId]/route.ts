import { administrativeTenantContext } from "@/features/identity/web/tenant-authority";
import { PrintPairingService } from "@/features/printing/application/print-pairing.service";
import { printingErrorResponse } from "@/features/printing/web/printing-http";
import { correlationIdFromRequest } from "@/lib/observability/request-context";
type Context = { params: Promise<{ tenantId: string; pairingId: string }> };
export const runtime = "nodejs";
export async function GET(request: Request, route: Context) {
  const correlationId = correlationIdFromRequest(request);
  try { const { tenantId, pairingId } = await route.params; const context = await administrativeTenantContext(request, tenantId, correlationId); return Response.json(await new PrintPairingService().status(context, pairingId)); }
  catch (error) { return printingErrorResponse(error, correlationId); }
}
