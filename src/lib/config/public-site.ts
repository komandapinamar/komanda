const FALLBACK_PUBLIC_SITE_URL = "https://komanda.app";

function normalizeOrigin(value: string): string {
  const withProtocol = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  return withProtocol.replace(/\/+$/, "");
}

/**
 * Canonical public origin of the application, shared by Mercado Pago
 * back_urls/webhooks, email links and problem type URIs.
 *
 * `NEXT_PUBLIC_SITE_URL` is the single source of truth. In production the app
 * may live on a dedicated host (e.g. `app.komanda.app`) while the storefront
 * root is a different domain, so an explicit `KOMANDA_PUBLIC_BASE_URL` still
 * overrides it.
 */
export function publicBaseUrl(): string {
  const explicit = process.env.KOMANDA_PUBLIC_BASE_URL?.trim();
  if (explicit) return normalizeOrigin(explicit);

  const site = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (site) return normalizeOrigin(site);

  return FALLBACK_PUBLIC_SITE_URL;
}

/**
 * Root domain used to compose storefront URLs as `<slug>.<rootDomain>`.
 *
 * The menu slug is a subdomain label, so we need the bare host of the public
 * site URL — never the full origin or a path. This is the adjustment that
 * keeps the slug working when everything is unified into a single URL.
 */
export function storefrontRootDomain(): string {
  const site = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (site) {
    try {
      return new URL(normalizeOrigin(site)).hostname.toLowerCase();
    } catch {
      // Fall through to the legacy override / default below.
    }
  }

  const legacy = process.env.STOREFRONT_ROOT_DOMAIN?.trim().toLowerCase();
  if (legacy) return legacy;

  return "localhost";
}
