"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { coreSessionService } from "@/features/identity/web/authenticated-session";
import { SESSION_COOKIE_NAME, sessionCookieOptions } from "@/features/identity/web/session-cookie";

export async function logoutAdmin() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (token) await coreSessionService().revoke(token).catch(() => undefined);
  cookieStore.set(SESSION_COOKIE_NAME, "", { ...sessionCookieOptions(), maxAge: 0 });
  redirect("/admin");
}
