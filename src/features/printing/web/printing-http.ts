import { ZodError } from "zod";
import {
  PrintAgentEntitlementError,
  PrintAgentNotFoundError,
} from "@/features/printing/application/print-agent.service";
import {
  PrintJobConflictError,
  PrintJobNotFoundError,
} from "@/features/printing/application/print-job.service";
import {
  IdempotencyConflictError,
  IdempotencyInProgressError,
} from "@/lib/idempotency/idempotency.service";
import { nonDisclosingNotFound, problemResponse } from "@/lib/http/problem";

export function bearerTokenFromRequest(request: Request) {
  const authorization = request.headers.get("authorization")?.trim();
  return authorization?.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length).trim()
    : null;
}

export function printingErrorResponse(error: unknown, correlationId: string) {
  if (
    error instanceof PrintAgentNotFoundError ||
    error instanceof PrintJobNotFoundError ||
    (error instanceof Error && error.message === "INVALID_SESSION")
  ) {
    return nonDisclosingNotFound(correlationId);
  }

  if (error instanceof ZodError) {
    return problemResponse({
      status: 422,
      title: "Validation failed",
      code: "VALIDATION_FAILED",
      correlationId,
    });
  }

  if (
    error instanceof PrintAgentEntitlementError ||
    error instanceof PrintJobConflictError ||
    error instanceof IdempotencyConflictError ||
    error instanceof IdempotencyInProgressError
  ) {
    return problemResponse({
      status: 409,
      title: "Printing conflict",
      code: "PRINTING_CONFLICT",
      correlationId,
    });
  }

  return problemResponse({
    status: 500,
    title: "Internal Server Error",
    code: "INTERNAL_ERROR",
    correlationId,
  });
}
