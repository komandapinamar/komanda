import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { getPublicCatalog } from "@/features/shop/menu/services/menu.service";

export const dynamic = "force-dynamic";

export default async function Home() {
  const tenantSlug =
    (await headers()).get("x-komanda-tenant-slug");
  if (!tenantSlug) notFound();
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
          className="rounded-full border-4 border-black bg-[var(--color-accent-primary)] px-12 py-5 text-3xl font-black uppercase tracking-wider text-[var(--color-accent-secondary)] shadow-[0_10px_0_0_black]"
        >
          Ver menú
        </Link>
      </section>
    </main>
  );
}
