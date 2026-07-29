import { NextRequest, NextResponse } from "next/server";

const TENANT_HINT_HEADER = "x-komanda-tenant-slug";

function normalizedSlug(value: string | null) {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(normalized) ? normalized : null;
}

function slugFromRequest(request: NextRequest) {
  const pathMatch = request.nextUrl.pathname.match(/^\/storefronts\/([^/]+)/);
  if (pathMatch) return normalizedSlug(pathMatch[1] ?? null);

  const host = (request.headers.get("x-forwarded-host") ?? request.headers.get("host"))
    ?.split(":")[0]
    .toLowerCase();
  const rootDomain = process.env.STOREFRONT_ROOT_DOMAIN?.toLowerCase();
  if (!host || !rootDomain || host === rootDomain || !host.endsWith(`.${rootDomain}`)) {
    return null;
  }
  return normalizedSlug(host.slice(0, -(rootDomain.length + 1)));
}

export function proxy(request: NextRequest) {
  const headers = new Headers(request.headers);
  // A browser-supplied hint is never trusted. Only host/path normalization may
  // attach it; routes still resolve tenant status and authority through Core.
  headers.delete(TENANT_HINT_HEADER);
  const slug = slugFromRequest(request);
  if (slug) headers.set(TENANT_HINT_HEADER, slug);
  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
