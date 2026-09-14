import { coreSessionService, sessionTokenFromRequest } from "@/features/identity/web/authenticated-session";
import { InvalidSessionError } from "@/features/identity/application/session.service";
import { correlationIdFromRequest } from "@/lib/observability/request-context";
import { problemResponse } from "@/lib/http/problem";

export async function GET(request: Request) {
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
    const tenants = await coreSessionService().getAuthorizedMobileContext(token);
    return Response.json(
      {
        tenants,
        data: tenants,
      },
      { headers: { "X-Correlation-Id": correlationId } },
    );
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
