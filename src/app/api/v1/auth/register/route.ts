import { ZodError } from "zod";
import { NextResponse } from "next/server";
import {
  EmailAlreadyTakenError,
  PublicRegistrationService,
  SlugAlreadyTakenError,
} from "@/features/provisioning/application/public-registration.service";
import {
  SESSION_COOKIE_NAME,
  sessionCookieOptions,
} from "@/features/identity/web/session-cookie";
import {
  coreSessionService,
  sessionTokenFromRequest,
} from "@/features/identity/web/authenticated-session";
import { correlationIdFromRequest } from "@/lib/observability/request-context";
import { problemResponse } from "@/lib/http/problem";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const correlationId = correlationIdFromRequest(request);

  try {
    const body = await request.json();
    const sessionToken = await sessionTokenFromRequest(request);
    let authenticatedUser: { id: string; email: string } | undefined;
    if (sessionToken) {
      try {
        const session = await coreSessionService().resolve(sessionToken);
        authenticatedUser = { id: session.userId, email: session.email };
      } catch {
        // An expired cookie must not prevent a guest from registering.
      }
    }
    const service = new PublicRegistrationService();
    const result = await service.register(body, {
      userAgent: request.headers.get("user-agent"),
      correlationId,
      authenticatedUser,
    });

    const redirectUrl = `/admin/${result.tenantId}`;

    const response = NextResponse.json(
      {
        success: true,
        tenantId: result.tenantId,
        slug: result.slug,
        name: result.name,
        preset: result.preset,
        redirectUrl,
      },
      {
        status: 201,
        headers: { "X-Correlation-Id": correlationId },
      },
    );

    response.cookies.set(
      SESSION_COOKIE_NAME,
      result.sessionToken,
      sessionCookieOptions(),
    );

    return response;
  } catch (error) {
    if (error instanceof ZodError) {
      return problemResponse({
        status: 422,
        title: "Validation failed",
        code: "VALIDATION_FAILED",
        correlationId,
        detail: error.issues[0]?.message ?? "Datos inválidos",
      });
    }

    if (error instanceof SlugAlreadyTakenError) {
      return problemResponse({
        status: 409,
        title: "Identificador no disponible",
        code: "SLUG_ALREADY_TAKEN",
        correlationId,
        detail: error.message,
      });
    }

    if (error instanceof EmailAlreadyTakenError) {
      return problemResponse({
        status: 409,
        title: "Email ya registrado",
        code: "EMAIL_ALREADY_TAKEN",
        correlationId,
        detail: error.message,
      });
    }

    return problemResponse({
      status: 500,
      title: "Error al registrar el negocio",
      code: "REGISTRATION_FAILED",
      correlationId,
      detail: error instanceof Error ? error.message : "Error inesperado",
    });
  }
}
