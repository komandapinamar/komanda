import bcrypt from "bcrypt";
import { z } from "zod";
import { DatabaseSessionRepository } from "@/features/identity/infrastructure/session.repository";
import { correlationIdFromRequest } from "@/lib/observability/request-context";
import { problemResponse } from "@/lib/http/problem";

const verifyStaffSchema = z
  .object({
    email: z.string().email().max(320),
    password: z.string().min(1).max(128),
  })
  .strict();

type RouteContext = { params: Promise<{ tenantId: string }> };

export async function POST(request: Request, route: RouteContext) {
  const correlationId = correlationIdFromRequest(request);
  const { tenantId } = await route.params;

  try {
    const body = verifyStaffSchema.parse(await request.json());
    const repo = new DatabaseSessionRepository();

    const credential = await repo.findCredentialByEmail(body.email.toLowerCase().trim());
    if (!credential || credential.status !== "active") {
      return problemResponse({
        status: 401,
        title: "Unauthorized",
        code: "INVALID_CREDENTIALS",
        correlationId,
      });
    }

    const passwordValid = await bcrypt.compare(body.password, credential.passwordHash);
    if (!passwordValid) {
      return problemResponse({
        status: 401,
        title: "Unauthorized",
        code: "INVALID_CREDENTIALS",
        correlationId,
      });
    }

    // Verify active membership in this specific tenant
    const membership = await repo.findLiveMembership(credential.userId, tenantId);
    if (!membership || membership.status !== "active") {
      return problemResponse({
        status: 403,
        title: "Forbidden",
        code: "FORBIDDEN_NOT_MEMBER",
        detail: "User is not an active member of this business.",
        correlationId,
      });
    }

    if (
      membership.role !== "employee" &&
      membership.role !== "admin" &&
      membership.role !== "owner"
    ) {
      return problemResponse({
        status: 403,
        title: "Forbidden",
        code: "FORBIDDEN_ROLE",
        detail: "User does not have authorization to perform staff actions.",
        correlationId,
      });
    }

    return Response.json(
      {
        authorized: true,
        userId: credential.userId,
        role: membership.role,
      },
      {
        status: 200,
        headers: { "X-Correlation-Id": correlationId },
      },
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return problemResponse({
        status: 422,
        title: "Validation failed",
        code: "VALIDATION_FAILED",
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
