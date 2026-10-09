import { z, ZodError } from "zod";
import { PasswordRecoveryService } from "@/features/identity/application/password-recovery.service";
import { correlationIdFromRequest } from "@/lib/observability/request-context";
import { problemResponse } from "@/lib/http/problem";
import { emitMetric } from "@/lib/observability/metrics";

const schema = z.object({ email: z.email().max(320) }).strict();

export async function POST(request: Request) {
  const correlationId = correlationIdFromRequest(request);
  try {
    const { email } = schema.parse(await request.json());
    try {
      await new PasswordRecoveryService().request(email);
    } catch {
      emitMetric("identity.password_reset.delivery_failed", { result: "failed" });
    }
    return Response.json({ message: "Si existe una cuenta activa, recibirás un correo con instrucciones." }, {
      headers: { "Cache-Control": "no-store", "X-Correlation-Id": correlationId },
    });
  } catch (error) {
    if (error instanceof ZodError) return problemResponse({ status: 422, title: "Validation failed", code: "VALIDATION_FAILED", correlationId });
    return problemResponse({ status: 500, title: "Internal error", code: "INTERNAL_ERROR", correlationId });
  }
}
