import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  InvalidSessionError,
  SessionService,
} from "@/features/identity/application/session.service";
import { DatabaseSessionRepository } from "@/features/identity/infrastructure/session.repository";
import {
  bearerToken,
  SESSION_COOKIE_NAME,
  sessionCookieOptions,
} from "@/features/identity/web/session-cookie";
import { correlationIdFromRequest } from "@/lib/observability/request-context";
import { problemResponse } from "@/lib/http/problem";

export async function DELETE(request: Request) {
  const correlationId = correlationIdFromRequest(request);
  const cookieStore = await cookies();
  const token =
    bearerToken(request) ?? cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!token) {
    return problemResponse({
      status: 401,
      title: "Unauthorized",
      code: "INVALID_SESSION",
      correlationId,
    });
  }
  try {
    await new SessionService(
      new DatabaseSessionRepository(),
      async () => false,
    ).revoke(token);
    const response = new NextResponse(null, {
      status: 204,
      headers: { "X-Correlation-Id": correlationId },
    });
    response.cookies.set(SESSION_COOKIE_NAME, "", {
      ...sessionCookieOptions(),
      maxAge: 0,
    });
    return response;
  } catch (error) {
    return problemResponse({
      status: error instanceof InvalidSessionError ? 401 : 500,
      title:
        error instanceof InvalidSessionError
          ? "Unauthorized"
          : "Internal Server Error",
      code:
        error instanceof InvalidSessionError
          ? "INVALID_SESSION"
          : "INTERNAL_ERROR",
      correlationId,
    });
  }
}
