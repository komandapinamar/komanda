"use client";

import { useCart } from "@/features/shop/cart/context/cart.context";
import { useRouter } from "next/navigation";
import CartItem from "./item/CartItem";
import DiscountCouponInput from "./DiscountCouponInput";

const ticketEdgePoints = Array.from(
  { length: 51 },
  (_, index) => `${index * 2}% ${index % 2 ? "0" : "8px"}`,
);
const ticketClipPath = `polygon(${[
  ...ticketEdgePoints,
  "100% 100%",
  "0 100%",
].join(", ")})`;

export default function CartPanel() {
  const {
    beginCheckout,
    items,
    itemCount,
    subtotal,
    discountTotal,
    total,
    appliedDiscount,
    applyDiscount,
    removeDiscount,
    syncError,
    syncStatus,
    tenantSlug,
  } = useCart();
  const router = useRouter();

  const handleCheckout = async () => {
    const cart = await beginCheckout();
    if (!cart) return;
    router.push("/checkout/pay");
  };

  const syncErrorMessage =
    "No se pudo validar el carrito con backend. Vas a poder revisar el estado en checkout, pero no confirmar hasta que exista un carrito oficial.";

  return (
    <div
      data-testid="cart-ticket"
      className="relative flex h-full min-h-0 flex-col border-x border-b border-white/12 bg-[#18181c]/95 font-mono text-[#f4f3f1] shadow-[0_24px_60px_-12px_rgba(0,0,0,0.75)] backdrop-blur-2xl"
      style={{ clipPath: ticketClipPath }}
    >
      {/* Physical Ticket Header */}
      <div className="mx-5 border-b-2 border-dashed border-white/15 pb-4 pt-7 text-center">
        <p className="font-sans text-2xl font-medium tracking-tight text-[#f4f3f1]">
          Komanda
        </p>
        {tenantSlug ? (
          <p className="mt-1 break-words text-[11px] uppercase tracking-widest text-[#c2c2cc]">
            @{tenantSlug}
          </p>
        ) : null}
      </div>

      {/* Physical Ticket Items Body */}
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 font-sans">
        {items.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/15 bg-white/[0.02] p-5 text-center text-sm text-[#c2c2cc]">
            Agrega productos desde el menu para empezar tu pedido.
          </div>
        ) : (
          items.map((cartLine) => (
            <article
              key={cartLine.lineId ?? cartLine.item.documentId}
              className="space-y-3 border-b border-dashed border-white/15 py-4 first:pt-0 last:border-0"
            >
              <CartItem cartLine={cartLine} />
            </article>
          ))
        )}
      </div>

      {/* Physical Ticket Perforated Footer */}
      <div className="mx-5 space-y-3.5 border-t-2 border-dashed border-white/15 pb-6 pt-4">
        <div className="flex justify-between text-xs uppercase tracking-wider text-[#c2c2cc] tabular-nums">
          <span>Líneas: {items.length}</span>
          <span>Unidades: {itemCount}</span>
        </div>

        {items.some(
          (cartLine) => (cartLine.item.selectedOptions ?? []).length > 0,
        ) ? (
          <div className="flex justify-between text-xs uppercase tracking-wider text-[#c2c2cc] tabular-nums">
            <span>Adicionales</span>
            <span>
              x{" "}
              {
                items.filter(
                  (cartLine) =>
                    (cartLine.item.selectedOptions ?? []).length > 0,
                ).length
              }
            </span>
          </div>
        ) : null}

        {items.length > 0 ? (
          <div className="border-b border-dashed border-white/15 pb-3.5 font-sans">
            <DiscountCouponInput
              appliedDiscount={appliedDiscount}
              discountTotal={discountTotal}
              onApply={applyDiscount}
              onRemove={removeDiscount}
              disabled={syncStatus === "syncing"}
              appearance="default"
            />
          </div>
        ) : null}

        {discountTotal > 0 ? (
          <div className="space-y-1.5 font-sans tabular-nums">
            <div className="flex items-center justify-between text-xs text-[#c2c2cc]">
              <span>Subtotal original</span>
              <span className="line-through opacity-60">
                ${subtotal.toLocaleString("es-AR")}
              </span>
            </div>
            <div className="flex items-center justify-between text-xs font-medium text-emerald-400">
              <span>Descuento aplicado</span>
              <span>-${discountTotal.toLocaleString("es-AR")}</span>
            </div>
            <div className="flex items-center justify-between pt-1 text-base font-medium text-[#f4f3f1]">
              <span>Total final</span>
              <span className="text-xl font-semibold text-emerald-400">
                ${total.toLocaleString("es-AR")}
              </span>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-3 font-sans text-xl font-semibold tracking-tight text-[#f4f3f1] tabular-nums">
            <span>Total</span>
            <span>${total.toLocaleString("es-AR")}</span>
          </div>
        )}

        {syncError ? (
          <p className="rounded-xl border border-red-400/25 bg-red-500/10 px-3 py-2 font-sans text-xs text-red-200">
            {syncErrorMessage}
          </p>
        ) : null}

        <button
          type="button"
          onClick={handleCheckout}
          disabled={items.length === 0 || syncStatus === "syncing"}
          className="inline-flex h-11 w-full items-center justify-center rounded-full bg-[#f4f3f1] px-5 font-sans text-sm font-medium text-[#141416] transition duration-200 hover:bg-white active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"
        >
          {syncStatus === "syncing"
            ? "Preparando checkout..."
            : "Continuar al pago →"}
        </button>
      </div>
    </div>
  );
}
