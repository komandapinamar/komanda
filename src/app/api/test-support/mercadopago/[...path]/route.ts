import { createHash, randomUUID } from "node:crypto";

type RouteContext = { params: Promise<{ path: string[] }> };

const globalForE2e = globalThis as typeof globalThis & {
  __komandaMercadoPagoCodes?: Map<string, string>;
};
const oauthCodes =
  globalForE2e.__komandaMercadoPagoCodes ?? new Map<string, string>();
globalForE2e.__komandaMercadoPagoCodes = oauthCodes;

function enabled() {
  return (
    process.env.KOMANDA_TEST_MODE === "1" &&
    process.env.NODE_ENV !== "production"
  );
}

function unavailable() {
  return Response.json({ code: "NOT_FOUND" }, { status: 404 });
}

export async function GET(request: Request, route: RouteContext) {
  if (!enabled()) return unavailable();
  const { path } = await route.params;
  const resource = path.join("/");
  if (resource === "authorization") {
    const state = new URL(request.url).searchParams.get("state");
    const redirectUri = process.env.MERCADOPAGO_REDIRECT_URI;
    if (!state || !redirectUri) {
      return Response.json({ code: "INVALID_OAUTH_REQUEST" }, { status: 422 });
    }
    const callback = new URL(redirectUri);
    const code = `e2e-${randomUUID()}`;
    oauthCodes.set(
      code,
      `e2e-seller-${createHash("sha256")
        .update(state)
        .digest("hex")
        .slice(0, 16)}`,
    );
    callback.searchParams.set("code", code);
    callback.searchParams.set("state", state);
    return Response.redirect(callback, 302);
  }
  if (resource === "users/me") {
    return Response.json({ id: "e2e-seller-account" });
  }
  return unavailable();
}

export async function POST(request: Request, route: RouteContext) {
  if (!enabled()) return unavailable();
  const { path } = await route.params;
  const resource = path.join("/");
  if (resource === "oauth/token") {
    const form = await request.formData();
    const code = String(form.get("code") ?? "");
    const userId = oauthCodes.get(code);
    if (!userId) {
      return Response.json({ code: "INVALID_GRANT" }, { status: 400 });
    }
    oauthCodes.delete(code);
    return Response.json({
      access_token: `e2e-access-${randomUUID()}`,
      refresh_token: `e2e-refresh-${randomUUID()}`,
      expires_in: 3600,
      user_id: userId,
      scope: "offline_access read write",
    });
  }
  if (resource === "checkout/preferences") {
    const origin = new URL(request.url).origin;
    const preferenceId = `e2e-preference-${randomUUID()}`;
    return Response.json({
      id: preferenceId,
      init_point: `${origin}/checkout/pay/success?payment_id=${preferenceId}`,
      sandbox_init_point: `${origin}/checkout/pay/success?payment_id=${preferenceId}`,
    });
  }
  return unavailable();
}

export async function DELETE(_request: Request, route: RouteContext) {
  if (!enabled()) return unavailable();
  const { path } = await route.params;
  return path.join("/") === "oauth/token"
    ? new Response(null, { status: 204 })
    : unavailable();
}
