import { storefrontRootDomain } from "@/lib/config/public-site";

export function buildStorefrontUrl(
  slug: string,
  options?: { host?: string | null; protocol?: string | null },
): string {
  const rootDomain = storefrontRootDomain();
  const rawHost = options?.host?.split(",")[0]?.trim() || "";
  const [hostWithoutPort, port] = rawHost.split(":");
  const portSuffix = port ? `:${port}` : "";

  const isLocal =
    rootDomain === "localhost" ||
    hostWithoutPort === "localhost" ||
    hostWithoutPort === "127.0.0.1";

  if (isLocal) {
    const proto = options?.protocol?.replace(/:$/, "") || "http";
    return `${proto}://${slug}.localhost${portSuffix}`;
  }

  const proto = options?.protocol?.replace(/:$/, "") || "https";
  return `${proto}://${slug}.${rootDomain}`;
}

export function buildPublicDirectoryUrl(options?: {
  host?: string | null;
  protocol?: string | null;
  tenantSlug?: string | null;
}): string {
  const rawHost =
    options?.host?.split(",")[0]?.trim() ||
    (typeof window !== "undefined" ? window.location.host : "");
  const rawProto =
    options?.protocol ||
    (typeof window !== "undefined" ? window.location.protocol : "");
  if (!rawHost) return "/";

  const [hostWithoutPort, port] = rawHost.split(":");
  const portSuffix = port ? `:${port}` : "";
  const proto = rawProto.replace(/:$/, "") || "http";

  if (
    hostWithoutPort === "localhost" ||
    hostWithoutPort === "127.0.0.1" ||
    hostWithoutPort.endsWith(".localhost")
  ) {
    return `${proto}://localhost${portSuffix}/`;
  }

  if (
    options?.tenantSlug &&
    hostWithoutPort.startsWith(`${options.tenantSlug}.`)
  ) {
    const rootHost = hostWithoutPort.slice(options.tenantSlug.length + 1);
    return `${proto}://${rootHost}${portSuffix}/`;
  }

  const parts = hostWithoutPort.split(".");
  if (parts.length >= 3) {
    return `${proto}://${parts.slice(1).join(".")}${portSuffix}/`;
  }

  return "/";
}
