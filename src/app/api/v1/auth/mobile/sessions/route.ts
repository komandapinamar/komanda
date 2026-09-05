import bcrypt from "bcrypt";
import { z } from "zod";
import {
  InvalidCredentialsError,
  InvalidSessionError,
  SessionService,
} from "@/features/identity/application/session.service";
import { DatabaseSessionRepository } from "@/features/identity/infrastructure/session.repository";
import {
  coreSessionService,
  sessionTokenFromRequest,
} from "@/features/identity/web/authenticated-session";
import { correlationIdFromRequest } from "@/lib/observability/request-context";
import { problemResponse } from "@/lib/http/problem";

const mobileLoginSchema = z
  .object({ email: z.email().max(320), password: z.string().min(8).max(128) })
  .strict();

export async function POST(request: Request) {
  const correlationId = correlationIdFromRequest(request);
  try {
    const credentials = mobileLoginSchema.parse(await request.json());
    const session = await new SessionService(
      new DatabaseSessionRepository(),
      bcrypt.compare,
    ).create({
      ...credentials,
      metadata: {
        client: "android",
        userAgent: request.headers.get("user-agent")?.slice(0, 200) ?? null,
      },
    });
    return Response.json(
      {
        token: session.token,
        expiresAt: session.expiresAt.toISOString(),
      },
      {
        status: 200,
        headers: { "X-Correlation-Id": correlationId },
      },
    );
  } catch (error) {
    if (error instanceof InvalidCredentialsError) {
      return problemResponse({
        status: 401,
        title: "Unauthorized",
        code: "INVALID_CREDENTIALS",
        correlationId,
      });
    }
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

export async function DELETE(request: Request) {
  const correlationId = correlationIdFromRequest(request);
  const token = await sessionTokenFromRequest(request);
  if (!token) {
    return problemResponse({
      status: 401,
      title: "Unauthorized",
      code: "INVALID_SESSION",
      correlationId,
    });
  }
  try {
    await coreSessionService().revoke(token);
    return new Response(null, {
      status: 204,
      headers: { "X-Correlation-Id": correlationId },
    });
  } catch (error) {
    if (error instanceof InvalidSessionError) {
      return problemResponse({
        status: 401,
        title: "Unauthorized",
        code: "INVALID_SESSION",
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
