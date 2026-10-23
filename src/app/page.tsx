import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { getPublicCatalog } from "@/features/shop/menu/services/menu.service";
import { PublicTenantService, PublicTenantNotFoundError } from "@/features/tenancy/application/public-tenant.service";
import { buildStorefrontUrl } from "@/features/tenancy/utils/storefront-url";
import { PublicDirectoryView } from "@/features/directory/web/PublicDirectoryView";

export const dynamic = "force-dynamic";

export default async function Home() {
  const requestHeaders = await headers();
  const tenantSlug = requestHeaders.get("x-komanda-tenant-slug");

  if (!tenantSlug) {
    const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
    const protocol = requestHeaders.get("x-forwarded-proto") ?? "http";
    const service = new PublicTenantService();
    const rawTenants = await service.listActiveDirectory();
    const directoryTenants = rawTenants.map((t) => ({
      ...t,
      storefrontUrl: buildStorefrontUrl(t.slug, { host, protocol }),
    }));

    return <PublicDirectoryView tenants={directoryTenants} />;
  }

  let catalog;
  try {
    catalog = await getPublicCatalog(tenantSlug);
  } catch (error) {
    if (error instanceof PublicTenantNotFoundError) {
      notFound();
    }
    throw error;
  }

  if (catalog.orderingAvailable !== false && catalog.categories.length > 0) {
    redirect("/order");
  }

  return (
    <main className="flex min-h-screen flex-col items-center bg-[var(--color-accent-tertiary)] text-center text-[var(--color-accent-primary)]">
      <section className="flex w-full max-w-6xl flex-grow flex-col items-center justify-center px-6 py-24">
        <p className="mb-5 text-lg font-black uppercase tracking-[0.3em]">
          {catalog.tenant.slug}
        </p>
        <h1 className="mb-8 text-6xl font-black uppercase leading-[0.85] tracking-tighter md:text-8xl">
          {catalog.tenant.name}
        </h1>
        <p className="mb-12 max-w-2xl text-xl font-bold">
          {catalog.orderingAvailable === false ? (
            <span className="inline-block rounded-lg bg-black/10 px-4 py-2 text-sm font-semibold text-black">
              Pedidos online no disponibles temporalmente. Consultá nuestra carta.
            </span>
          ) : (
            "El menú todavía se está preparando."
          )}
        </p>
      </section>
    </main>
  );
}
