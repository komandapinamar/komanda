import OrderProductCard from "@/features/shop/order/components/OrderProductCard";
import OrderShell from "@/features/shop/order/components/OrderShell";
import { getCategories, getMenuItems } from "@/features/shop/menu/services/menu.service";
import type { MenuItem } from "@/types/types";

export const dynamic = "force-dynamic";

export default async function Order() {
  const [categories, items] = await Promise.all([getCategories(), getMenuItems()]);

  const itemsByCategory = new Map<string, MenuItem[]>();

  for (const item of items) {
    const categoryId = item.category?.documentId;
    if (!categoryId) {
      continue;
    }

    const categoryItems = itemsByCategory.get(categoryId) ?? [];
    categoryItems.push(item);
    itemsByCategory.set(categoryId, categoryItems);
  }

  const sections = categories.map((category) => ({
    id: category.documentId,
    title: category.name,
    items: itemsByCategory.get(category.documentId) ?? [],
  }));

  return (
    <OrderShell>
      <main className="space-y-6 p-4 bg-[var(--color-accent-primary)] min-h-[100dvh]">
        <header className="space-y-2 text-[var(--color-accent-secondary)]">
          {/*
           /////////////
          <p className="text-sm font-medium uppercase tracking-[0.2em]">
            Chiken Stop
          </p>

           */}

          <h1 className="text-3xl font-black sm:text-4xl">Nuestro menu</h1>
          <p className="max-w-2xl text-sm opacity-80 sm:text-base">
            Elegi una categoria y agregá productos al carrito desde cada seccion.
          </p>
        </header>

        <nav className="sticky top-0 z-10 border-y border-[var(--color-accent-secondary)] bg-[var(--color-accent-primary)]/95 py-3 backdrop-blur">
          <div className="flex gap-3 overflow-x-auto pb-1">
            {sections.map((section) => (
              <a
                key={section.id}
                href={`#${section.id}`}
                className="shrink-0 rounded-full border border-[var(--color-accent-secondary)] px-4 py-2 text-sm font-semibold text-[var(--color-accent-secondary)] transition-colors hover:bg-[var(--color-accent-secondary)] hover:text-[var(--color-accent-primary)]"
              >
                {section.title}
              </a>
            ))}
          </div>
        </nav>

        <div className="space-y-10">
          {sections.map((section) => (
            <section
              key={section.id}
              id={section.id}
              className="scroll-mt-24 space-y-4"
            >
              <div className="space-y-1 text-[var(--color-accent-secondary)]">
                <h2 className="text-2xl font-black sm:text-3xl">
                  {section.title}
                </h2>
                <p className="text-sm opacity-75">
                  {section.items.length} producto
                  {section.items.length === 1 ? "" : "s"}
                </p>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {section.items.length > 0 ? (
                  section.items.map((item: MenuItem) => (
                    <OrderProductCard key={item.documentId} item={item} />
                  ))
                ) : (
                  <div className="rounded-sm border border-dashed border-[var(--color-accent-secondary)]/50 p-4 text-sm text-[var(--color-accent-secondary)]/75">
                    Esta categoria todavia no tiene productos visibles.
                  </div>
                )}
              </div>
            </section>
          ))}
        </div>
      </main>
    </OrderShell>
  );
}
