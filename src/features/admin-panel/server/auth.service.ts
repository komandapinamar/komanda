import "server-only";

import bcrypt from "bcrypt";
import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { adminUsers } from "@/db/schema";
import {
  ADMIN_SESSION_COOKIE_NAME,
  ADMIN_SESSION_MAX_AGE_SECONDS,
  verifyAdminSessionToken,
} from "@/features/admin-panel/lib/admin-session";

export {
  createAdminSessionToken,
} from "@/features/admin-panel/lib/admin-session";

type AuthenticatedAdmin = {
  username: string;
};

export async function authenticateAdmin(
  username: string,
  password: string,
): Promise<AuthenticatedAdmin | null> {
  const normalizedUsername = username.trim();

  if (!normalizedUsername || !password) {
    return null;
  }

  const admin = await db.query.adminUsers.findFirst({
    where: eq(adminUsers.username, normalizedUsername),
  });

  if (!admin) {
    return null;
  }

  const isPasswordValid = await bcrypt.compare(password, admin.passwordHash);

  if (!isPasswordValid) {
    return null;
  }

  return {
    username: admin.username,
  };
}

export function getAdminSessionCookieOptions() {
  return {
    httpOnly: true,
    maxAge: ADMIN_SESSION_MAX_AGE_SECONDS,
    path: "/",
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
  };
}

export async function getAuthenticatedAdminSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_SESSION_COOKIE_NAME)?.value;

  if (!token) {
    return null;
  }

  return verifyAdminSessionToken(token);
}
