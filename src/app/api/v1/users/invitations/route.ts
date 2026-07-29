import { z, ZodError } from "zod";
import { IdentityVerificationService, InvalidVerificationChallengeError } from "@/features/identity/application/identity-verification.service";
import { correlationIdFromRequest, safeLogFields } from "@/lib/observability/request-context";
import { nonDisclosingNotFound, problemResponse } from "@/lib/http/problem";

const AcceptInvitationSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(8, "Password must be at least 8 characters long").max(100),
});

function logUnexpectedError(
  correlationId: string,
  operation: string,
  error: unknown,
) {
  const databaseError = error as {
    code?: unknown;
    constraint?: unknown;
    name?: unknown;
  };
  console.error(
    JSON.stringify(
      safeLogFields(
        { correlationId, operation },
        {
          errorType: typeof databaseError.name === "string" ? databaseError.name : "UnknownError",
          debugMessage: process.env.NODE_ENV === "development" && error instanceof Error ? error.message : undefined,
        },
      ),
    ),
  );
}

export async function POST(request: Request) {
  const correlationId = correlationIdFromRequest(request);
  try {
    const input = AcceptInvitationSchema.parse(await request.json());
    const service = new IdentityVerificationService();
    
    await service.acceptInvitation(input.token, input.password, correlationId);
    
    return Response.json({ success: true }, { status: 200 });
  } catch (error) {
    if (error instanceof InvalidVerificationChallengeError) {
      return problemResponse({
        status: 400,
        title: "Invalid or expired token",
        code: "INVALID_TOKEN",
        correlationId,
      });
    }
    if (error instanceof ZodError) {
      return problemResponse({
        status: 422,
        title: "Validation failed",
        code: "VALIDATION_FAILED",
        correlationId,
        errors: error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      });
    }
    logUnexpectedError(correlationId, "invitations.accept", error);
    return nonDisclosingNotFound(correlationId);
  }
}
