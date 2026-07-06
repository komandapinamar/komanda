import bcrypt from "bcrypt";
import { z } from "zod";
import { NextResponse } from "next/server";
import {
  InvalidCredentialsError,
  SessionService,
} from "@/features/identity/application/session.service";
import { DatabaseSessionRepository } from "@/features/identity/infrastructure/session.repository";
import {
  SESSION_COOKIE_NAME,
  sessionCookieOptions,
} from "@/features/identity/web/session-cookie";
import { correlationIdFromRequest } from "@/lib/observability/request-context";
import { problemResponse } from "@/lib/http/problem";

const loginSchema = z
  .object({ email: z.email().max(320), password: z.string().min(8).max(128) })
  .strict();

export async function POST(request: Request) {
  const correlationId = correlationIdFromRequest(request);
  try {
    const credentials = loginSchema.parse(await request.json());
    const session = await new SessionService(
      new DatabaseSessionRepository(),
      bcrypt.compare,
    ).create({
      ...credentials,
      metadata: {
        userAgent: request.headers.get("user-agent")?.slice(0, 200) ?? null,
      },
    });
    const response = new NextResponse(null, {
      status: 204,
      headers: { "X-Correlation-Id": correlationId },
    });
    response.cookies.set(
      SESSION_COOKIE_NAME,
      session.token,
      sessionCookieOptions(),
    );
    return response;
  } catch (error) {
    return problemResponse({
      status: error instanceof InvalidCredentialsError ? 401 : 422,
      title:
        error instanceof InvalidCredentialsError
          ? "Unauthorized"
          : "Validation failed",
      code:
        error instanceof InvalidCredentialsError
          ? "INVALID_CREDENTIALS"
          : "VALIDATION_FAILED",
      correlationId,
    });
  }
}
