import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { getPublicCatalog } from "@/features/shop/menu/services/menu.service";
import { PublicTenantService } from "@/features/tenancy/application/public-tenant.service";
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
  } catch {
    notFound();
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
          {catalog.categories.length > 0
            ? `${catalog.categories.length} categorías disponibles para pedir.`
            : "El menú todavía se está preparando."}
        </p>
        <Link
          href="/order"
          className="rounded-full border-4 border-black bg-[var(--color-accent-primary)] px-12 py-5 text-3xl font-black uppercase tracking-tighter text-[var(--color-accent-secondary)] shadow-[0_10px_0_0_black]"
        >
          Ver menú
        </Link>
      </section>
    </main>
  );
}
