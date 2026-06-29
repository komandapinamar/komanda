import { NextResponse } from "next/server";
import {
  ADMIN_BYPASS_HEADER_NAME,
  ADMIN_SESSION_COOKIE_NAME,
  verifyAdminSessionToken,
} from "@/features/admin-panel/lib/admin-session";

export async function proxy(request) {
  const token = request.cookies.get(ADMIN_SESSION_COOKIE_NAME)?.value;
  const adminSession = token ? await verifyAdminSessionToken(token) : null;
  const { pathname } = request.nextUrl;

  if (!adminSession && pathname.startsWith("/admin/") && pathname !== "/admin") {
    return NextResponse.redirect(new URL("/admin", request.url));
  }

  if (!adminSession) {
    return NextResponse.next();
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(ADMIN_BYPASS_HEADER_NAME, "1");

  return NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });
}

export const config = {
  matcher: ["/admin/:path*", "/checkout/pay/:path*", "/api/payments/session"],
};
