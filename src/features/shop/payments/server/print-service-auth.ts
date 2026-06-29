import "server-only";

type PrintServiceAuthResult =
  | {
      ok: true;
    }
  | {
      ok: false;
      reason: string;
      status: number;
    };

export function verifyPrintServiceRequest(request: Request): PrintServiceAuthResult {
  const expectedToken = process.env.PRINT_SERVICE_TOKEN?.trim();

  if (!expectedToken) {
    return {
      ok: false,
      reason: "PRINT_SERVICE_TOKEN is not configured.",
      status: 503,
    };
  }

  const authorization = request.headers.get("authorization")?.trim();

  if (!authorization?.startsWith("Bearer ")) {
    return {
      ok: false,
      reason: "Missing bearer token.",
      status: 401,
    };
  }

  const providedToken = authorization.slice("Bearer ".length).trim();

  if (!providedToken || providedToken !== expectedToken) {
    return {
      ok: false,
      reason: "Invalid bearer token.",
      status: 401,
    };
  }

  return { ok: true };
}
