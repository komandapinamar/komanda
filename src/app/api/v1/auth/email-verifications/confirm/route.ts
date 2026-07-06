import { ZodError } from "zod";
import { emailVerificationConfirmSchema } from "@/features/provisioning/domain/provisioning.schemas";
import {
  IdentityVerificationService,
  InvalidVerificationChallengeError,
} from "@/features/identity/application/identity-verification.service";
import { correlationIdFromRequest } from "@/lib/observability/request-context";
import { problemResponse } from "@/lib/http/problem";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const correlationId = correlationIdFromRequest(request);
  try {
    const body = emailVerificationConfirmSchema.parse(await request.json());
    await new IdentityVerificationService().confirm(body.token, correlationId);
    return new Response(null, {
      status: 204,
      headers: { "X-Correlation-Id": correlationId },
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return problemResponse({
        status: 422,
        title: "Validation failed",
        code: "VALIDATION_FAILED",
        correlationId,
      });
    }
    if (error instanceof InvalidVerificationChallengeError) {
      return problemResponse({
        status: 409,
        title: "Verification unavailable",
        code: "VERIFICATION_UNAVAILABLE",
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
}
