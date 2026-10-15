"use client";

import { useEffect } from "react";
import MenuViewToolbar, { categoryPillClassName, inactiveCategoryPillClassName } from "../../MenuViewToolbar";
import OrderProductCard from "@/features/shop/order/components/OrderProductCard";
import OrderShell from "@/features/shop/order/components/OrderShell";
import MenuAnalyticsTracker from "@/features/shop/analytics/MenuAnalyticsTracker";
import type { Category, MenuItem } from "@/types/types";
import type { TenantPreset } from "@/db/schema/platform";

export interface ClassicMenuViewProps {
  categories: Category[];
  items: MenuItem[];
  tenantSlug?: string;
  orderingAvailable?: boolean;
  preset?: TenantPreset;
  showReelsLink?: boolean;
}

export default function ClassicMenuView({
  categories,
  items,
  tenantSlug,
  orderingAvailable = true,
  preset = "gastronomy",
  showReelsLink = false,
}: ClassicMenuViewProps) {
  const isExpressRetail = preset === "express_retail";

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const targetItemId = params.get("item");
    if (!targetItemId) return;

    let highlightTimer: NodeJS.Timeout | undefined;

    const scrollTimer = setTimeout(() => {
      try {
        const safeId = typeof CSS !== "undefined" && CSS.escape ? CSS.escape(targetItemId) : targetItemId;
        const el = document.querySelector(`[data-item-id="${safeId}"]`);
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "center" });
          el.classList.add("ring-4", "ring-[var(--color-accent-secondary)]", "transition-all", "duration-500");
          highlightTimer = setTimeout(() => {
            el.classList.remove("ring-4", "ring-[var(--color-accent-secondary)]");
          }, 2500);
        }
      } catch {
        // Ignore selector errors
      }
    }, 350);

    return () => {
      clearTimeout(scrollTimer);
      if (highlightTimer) clearTimeout(highlightTimer);
    };
  }, []);

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
    <OrderShell showCart={!isExpressRetail}>
      {tenantSlug ? <MenuAnalyticsTracker tenantSlug={tenantSlug} /> : null}
      <main className={`space-y-6 p-4 bg-[var(--color-accent-primary)] min-h-[100dvh] ${showReelsLink ? "pt-24 md:pt-[calc(4vh+6rem)]" : ""}`}>
        <div className={showReelsLink
          ? "fixed top-4 left-4 right-4 z-40 md:top-[calc(4vh+1rem)] md:left-1/2 md:right-auto md:w-[calc(28rem-2rem)] md:-translate-x-1/2"
          : "sticky top-4 z-10"}>
          <MenuViewToolbar mode={showReelsLink ? "grid" : undefined}>
            <nav aria-label="Categorías de menú" className="flex items-center gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {sections.map((section) => (
                <a
                  key={section.id}
                  href={`#${section.id}`}
                  className={`${categoryPillClassName} ${inactiveCategoryPillClassName}`}
                >
                  {section.title}
                </a>
              ))}
            </nav>
          </MenuViewToolbar>
        </div>
        <header className="space-y-2 text-[var(--color-accent-secondary)]">
          {isExpressRetail ? (
            <div className="flex flex-col gap-2">
              <h2 className="text-xl font-light tracking-tighter sm:text-xl">Komanda</h2>
              <h1 className="text-3xl font-black sm:text-4xl">Vidriera Digital y Precios</h1>
              <p
                data-testid="storefront-express-legend"
                className="max-w-2xl text-sm opacity-80 sm:text-base"
              >
                Consultá precios y disponibilidad de productos. Las compras se realizan de manera presencial en tienda mediante nuestras terminales de autoservicio o caja.
              </p>
            </div>
          ) : (
            <>
              <h2 className="text-xl font-light tracking-tighter sm:text-xl">Komanda</h2>
              <h1 className="text-3xl font-black sm:text-4xl">Nuestro menu</h1>
              <p className="max-w-2xl text-sm opacity-80 sm:text-base">
                Selecciona categorias y agregá productos al carrito.
              </p>
              {!orderingAvailable && (
                <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm font-semibold text-amber-300">
                  Pedidos online no disponibles temporalmente. Podés consultar la carta.
                </div>
              )}
            </>
          )}
        </header>

        <div className="space-y-10">
          {sections.map((section) => (
            <section
              key={section.id}
              id={section.id}
              className={`${showReelsLink ? "scroll-mt-24 md:scroll-mt-[calc(4vh+6rem)]" : "scroll-mt-24"} space-y-4`}
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
                    <OrderProductCard
                      key={item.documentId}
                      item={item}
                      interactive={!isExpressRetail && orderingAvailable}
                    />
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
