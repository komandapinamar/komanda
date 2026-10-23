import { z, ZodError } from "zod";
import { InvalidPasswordResetTokenError, PasswordRecoveryService } from "@/features/identity/application/password-recovery.service";
import { correlationIdFromRequest } from "@/lib/observability/request-context";
import { problemResponse } from "@/lib/http/problem";

const schema = z.object({
  token: z.string().min(32).max(512),
  password: z.string().min(8).max(128),
}).strict();

export async function POST(request: Request) {
  const correlationId = correlationIdFromRequest(request);
  try {
    const { token, password } = schema.parse(await request.json());
    await new PasswordRecoveryService().reset(token, password);
    return Response.json({ success: true }, { headers: { "Cache-Control": "no-store", "X-Correlation-Id": correlationId } });
  } catch (error) {
    if (error instanceof ZodError) return problemResponse({ status: 422, title: "Validation failed", code: "VALIDATION_FAILED", correlationId });
    if (error instanceof InvalidPasswordResetTokenError) return problemResponse({ status: 422, title: "Invalid reset link", code: "INVALID_RESET_TOKEN", correlationId });
    return problemResponse({ status: 500, title: "Internal error", code: "INTERNAL_ERROR", correlationId });
  }
}
