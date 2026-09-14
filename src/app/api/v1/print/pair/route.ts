import { PrintPairingService } from "@/features/printing/application/print-pairing.service";
import { printingErrorResponse } from "@/features/printing/web/printing-http";
import { correlationIdFromRequest } from "@/lib/observability/request-context";
export const runtime = "nodejs";
export async function POST(request: Request) {
  const correlationId = correlationIdFromRequest(request);
  try { return Response.json(await new PrintPairingService().claim(await request.json())); }
  catch (error) { return printingErrorResponse(error, correlationId); }
}
