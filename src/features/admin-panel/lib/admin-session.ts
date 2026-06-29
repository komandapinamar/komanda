import { SignJWT, jwtVerify } from "jose";

export const ADMIN_SESSION_COOKIE_NAME = "admin_session";
export const ADMIN_SESSION_MAX_AGE_SECONDS = 60 * 60 * 8;
export const ADMIN_BYPASS_HEADER_NAME = "x-komanda-admin-session";

export type AdminSession = {
  username: string;
  role: "admin";
};

function getAdminJwtSecret() {
  const secret = process.env.ADMIN_JWT_SECRET?.trim();

  if (!secret) {
    throw new Error("Missing ADMIN_JWT_SECRET environment variable.");
  }

  return new TextEncoder().encode(secret);
}

export async function createAdminSessionToken(username: string) {
  return new SignJWT({
    role: "admin",
    username,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(username)
    .setIssuedAt()
    .setExpirationTime(`${ADMIN_SESSION_MAX_AGE_SECONDS}s`)
    .sign(getAdminJwtSecret());
}

export async function verifyAdminSessionToken(
  token: string,
): Promise<AdminSession | null> {
  try {
    const { payload } = await jwtVerify(token, getAdminJwtSecret(), {
      algorithms: ["HS256"],
    });

    if (payload.role !== "admin" || typeof payload.username !== "string") {
      return null;
    }

    return {
      username: payload.username,
      role: "admin",
    };
  } catch {
    return null;
  }
}
