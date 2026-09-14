import { PrintJobService } from "@/features/printing/application/print-job.service";
import {
  bearerTokenFromRequest,
  printingErrorResponse,
} from "@/features/printing/web/printing-http";
import { problemResponse } from "@/lib/http/problem";
import { correlationIdFromRequest } from "@/lib/observability/request-context";

type RouteContext = { params: Promise<{ jobId: string }> };

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, route: RouteContext) {
  const correlationId = correlationIdFromRequest(request);
  const token = bearerTokenFromRequest(request);
  const idempotencyKey = request.headers.get("idempotency-key")?.trim();
  if (!token) {
    return problemResponse({
      status: 401,
      title: "Unauthorized",
      code: "UNAUTHORIZED",
      correlationId,
    });
  }
  if (!idempotencyKey) {
    return problemResponse({
      status: 422,
      title: "Validation failed",
      code: "IDEMPOTENCY_KEY_REQUIRED",
      correlationId,
    });
  }

  try {
    const { jobId } = await route.params;
    const result = await new PrintJobService().reportResult({
      token,
      correlationId,
      jobId,
      idempotencyKey,
      body: await request.json(),
    });
    return Response.json(result, {
      headers: { "X-Correlation-Id": correlationId },
    });
  } catch (error) {
    return printingErrorResponse(error, correlationId);
  }
}
