export function buildStorefrontUrl(
  slug: string,
  options?: { host?: string | null; protocol?: string | null },
): string {
  const rootDomain = process.env.STOREFRONT_ROOT_DOMAIN?.toLowerCase() || "localhost";
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
