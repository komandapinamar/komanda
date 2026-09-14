import { ZodError } from "zod";
import { DatabaseProvisioningRepository } from "@/features/provisioning/infrastructure/provisioning.repository";
import { ProvisionTenantService } from "@/features/provisioning/application/provision-tenant.service";
import { verificationDeliveryFromEnvironment } from "@/features/identity/infrastructure/verification-delivery.port";
import {
  komandaBusinessServiceAuthFromEnvironment,
  ServiceAuthenticationError,
} from "@/features/identity/application/service-auth.service";
import {
  correlationIdFromRequest,
  safeLogFields,
} from "@/lib/observability/request-context";
import { problemResponse } from "@/lib/http/problem";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const correlationId = correlationIdFromRequest(request);
  try {
    const authority = komandaBusinessServiceAuthFromEnvironment().authenticate(
      request,
    );
    const idempotencyKey = request.headers.get("idempotency-key")?.trim();
    if (!idempotencyKey) {
      return problemResponse({
        status: 422,
        title: "Validation failed",
        code: "IDEMPOTENCY_KEY_REQUIRED",
        correlationId,
      });
    }
    const result = await new ProvisionTenantService(
      new DatabaseProvisioningRepository(),
      verificationDeliveryFromEnvironment(),
    ).execute({
      request: await request.json(),
      idempotencyKey,
      serviceId: authority.serviceId,
      correlationId,
    });
    return Response.json(result, {
      status: 201,
      headers: { "X-Correlation-Id": correlationId },
    });
  } catch (error) {
    if (error instanceof ServiceAuthenticationError) {
      return problemResponse({
        status: 401,
        title: "Unauthorized",
        code: "SERVICE_AUTHENTICATION_FAILED",
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
    const databaseError = error as {
      code?: unknown;
      constraint?: unknown;
      name?: unknown;
    };
    console.error(
      JSON.stringify(
        safeLogFields(
          { correlationId, operation: "tenant.provision" },
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
    return problemResponse({
      status: 409,
      title: "Provisioning conflict",
      code: "PROVISIONING_CONFLICT",
      correlationId,
    });
  }
}
