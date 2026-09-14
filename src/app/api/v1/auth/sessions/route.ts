import bcrypt from "bcrypt";
import { z, ZodError } from "zod";
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
  .object({
    email: z.string().trim().email().max(320),
    password: z.string().min(8).max(128),
  })
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
    if (error instanceof ZodError) {
      return problemResponse({
        status: 422,
        title: "Validation failed",
        code: "VALIDATION_FAILED",
        detail: error.issues[0]?.message ?? "Formato de credenciales inválido",
        correlationId,
      });
    }

    if (error instanceof InvalidCredentialsError) {
      return problemResponse({
        status: 401,
        title: "Credenciales incorrectas",
        code: "INVALID_CREDENTIALS",
        detail: "El correo electrónico o la contraseña ingresada no son correctos.",
        correlationId,
      });
    }

    return problemResponse({
      status: 500,
      title: "Error al iniciar sesión",
      code: "INTERNAL_ERROR",
      detail: error instanceof Error ? error.message : "Error inesperado",
      correlationId,
    });
  }
}
