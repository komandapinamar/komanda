"use server";

import { cookies } from "next/headers";
import {
  ADMIN_SESSION_COOKIE_NAME,
  createAdminSessionToken,
} from "@/features/admin-panel/lib/admin-session";
import {
  authenticateAdmin,
  getAdminSessionCookieOptions,
} from "@/features/admin-panel/server/auth.service";

export type LoginActionState = {
  success: boolean;
  message: string | null;
};

function getStringField(formData: FormData, field: string) {
  const value = formData.get(field);
  return typeof value === "string" ? value : "";
}

export async function login(
  _previousState: LoginActionState,
  formData: FormData,
): Promise<LoginActionState> {
  const username = getStringField(formData, "username").trim();
  const password = getStringField(formData, "password");

  if (!username || !password) {
    return {
      success: false,
      message: "Username and password are required.",
    };
  }

  try {
    const admin = await authenticateAdmin(username, password);

    if (!admin) {
      return {
        success: false,
        message: "Invalid username or password.",
      };
    }

    const token = await createAdminSessionToken(admin.username);
    const cookieStore = await cookies();

    cookieStore.set({
      name: ADMIN_SESSION_COOKIE_NAME,
      value: token,
      ...getAdminSessionCookieOptions(),
    });

    return {
      success: true,
      message: "Login successful.",
    };
  } catch (error) {
    console.error("Error logging in admin:", error);

    return {
      success: false,
      message: "Could not log in right now.",
    };
  }
}
