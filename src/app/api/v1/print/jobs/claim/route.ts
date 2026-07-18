import { PrintJobService } from "@/features/printing/application/print-job.service";
import {
  bearerTokenFromRequest,
  printingErrorResponse,
} from "@/features/printing/web/printing-http";
import { problemResponse } from "@/lib/http/problem";
import {
  correlationIdFromRequest,
  safeLogFields,
} from "@/lib/observability/request-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const correlationId = correlationIdFromRequest(request);
  const token = bearerTokenFromRequest(request);
  if (!token) {
    return problemResponse({
      status: 401,
      title: "Unauthorized",
      code: "UNAUTHORIZED",
      correlationId,
    });
  }

  try {
    const claim = await new PrintJobService().claim(token, correlationId);
    if (!claim) {
      return new Response(null, {
        status: 204,
        headers: { "X-Correlation-Id": correlationId },
      });
    }
    return Response.json(claim, {
      headers: { "X-Correlation-Id": correlationId },
    });
  } catch (error) {
    const databaseError = error as {
      code?: unknown;
      constraint?: unknown;
      name?: unknown;
    };
    console.error(
      JSON.stringify(
        safeLogFields(
          { correlationId, operation: "print.claim" },
          {
            errorType:
              typeof databaseError.name === "string"
                ? databaseError.name
                : "UnknownError",
            databaseCode:
              typeof databaseError.code === "string"
                ? databaseError.code
                : undefined,
            constraint:
              typeof databaseError.constraint === "string"
                ? databaseError.constraint
                : undefined,
            debugMessage:
              process.env.NODE_ENV === "development" && error instanceof Error
                ? error.message
                : undefined,
          },
        ),
      ),
    );
    return printingErrorResponse(error, correlationId);
  }
}
