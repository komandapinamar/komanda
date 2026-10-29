"use client";

import { useEffect } from "react";
import MenuViewToolbar, {
  categoryPillClassName,
  inactiveCategoryPillClassName,
} from "../../MenuViewToolbar";
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
        const safeId =
          typeof CSS !== "undefined" && CSS.escape
            ? CSS.escape(targetItemId)
            : targetItemId;
        const el = document.querySelector(`[data-item-id="${safeId}"]`);
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "center" });
          el.classList.add(
            "ring-2",
            "ring-[var(--color-accent-secondary)]",
            "transition-all",
            "duration-500",
          );
          highlightTimer = setTimeout(() => {
            el.classList.remove(
              "ring-2",
              "ring-[var(--color-accent-secondary)]",
            );
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
      <main className="min-h-[100dvh] w-full max-w-full space-y-8 overflow-x-clip bg-[#141416] p-4 sm:p-6">
        <div className="sticky top-4 z-30 w-full max-w-full">
          <MenuViewToolbar mode={showReelsLink ? "grid" : undefined}>
            <nav
              aria-label="Categorías de menú"
              className="flex items-center gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            >
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

        <header className="space-y-2 border-b border-white/[0.08] pb-6 text-[#f4f3f1]">
          {isExpressRetail ? (
            <div className="flex flex-col gap-2">
              <h2 className="text-xs font-medium uppercase tracking-widest text-[#9b9ba4]">
                Komanda · {tenantSlug}
              </h2>
              <h1 className="text-3xl font-medium tracking-tight sm:text-4xl">
                Vidriera Digital y Precios
              </h1>
              <p
                data-testid="storefront-express-legend"
                className="max-w-2xl text-sm text-[#9b9ba4] sm:text-base"
              >
                Consultá precios y disponibilidad de productos. Las compras se
                realizan de manera presencial en tienda mediante nuestras
                terminales de autoservicio o caja.
              </p>
            </div>
          ) : (
            <>
              <h2 className="text-xs font-medium uppercase tracking-widest text-[#9b9ba4]">
                Komanda · {tenantSlug}
              </h2>
              <h1 className="text-3xl font-medium tracking-tight sm:text-4xl">
                Nuestro menu
              </h1>
              <p className="max-w-2xl text-sm text-[#9b9ba4] sm:text-base">
                Selecciona categorias y agregá productos al carrito.
              </p>
              {!orderingAvailable && (
                <div className="mt-2 rounded-2xl border border-amber-400/25 bg-amber-500/10 px-4 py-3 text-xs font-medium text-amber-200">
                  Pedidos online no disponibles temporalmente. Podés consultar
                  la carta.
                </div>
              )}
            </>
          )}
        </header>

        <div className="space-y-12">
          {sections.map((section) => (
            <section
              key={section.id}
              id={section.id}
              className={`${
                showReelsLink
                  ? "scroll-mt-24 md:scroll-mt-[calc(4vh+6rem)]"
                  : "scroll-mt-24"
              } space-y-4`}
            >
              <div className="flex items-baseline justify-between border-b border-white/[0.08] pb-2.5 text-[#f4f3f1]">
                <h2 className="text-xl font-medium tracking-tight sm:text-2xl">
                  {section.title}
                </h2>
                <p className="text-xs font-medium text-[#9b9ba4] tabular-nums">
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
                  <div className="liquid-glass-card rounded-2xl p-6 text-sm text-[#9b9ba4]">
                    Esta categoría todavía no tiene productos visibles.
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
