export const SESSION_COOKIE_NAME = "komanda_session";
export const SESSION_MAX_AGE_SECONDS = 8 * 60 * 60;

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  };
}

export function bearerToken(request: Request) {
  const authorization = request.headers.get("authorization")?.trim();
  return authorization?.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length).trim()
    : null;
}
