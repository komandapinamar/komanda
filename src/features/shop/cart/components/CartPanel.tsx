"use client";

import { useCart } from "@/features/shop/cart/context/cart.context";
import { useRouter } from "next/navigation";
import CartItem from "./item/CartItem";
import DiscountCouponInput from "./DiscountCouponInput";

const ticketEdgePoints = Array.from({ length: 51 }, (_, index) => `${index * 2}% ${index % 2 ? "0" : "8px"}`);
const ticketClipPath = `polygon(${[...ticketEdgePoints, "100% 100%", "0 100%"].join(", ")})`;

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

  const syncErrorMessage = "No se pudo validar el carrito con backend. Vas a poder revisar el estado en checkout, pero no confirmar hasta que exista un carrito oficial.";

  return (
    <div data-testid="cart-ticket" className="relative flex h-full min-h-0 flex-col bg-[#faf7ef] font-mono text-[#29251f] shadow-[0_12px_40px_rgba(0,0,0,0.25)] [--color-accent-primary:#faf7ef] [--color-accent-secondary:#29251f]" style={{ clipPath: ticketClipPath }}>
      <div className="mx-4 border-b-2 border-dashed border-[#29251f]/30 pb-4 pt-7 text-center">
        <p className="text-2xl font-black tracking-tighter" style={{ fontFamily: "var(--font-instrument-sans), sans-serif" }}>KOMANDA</p>
        <p className="mt-1 break-words text-xs uppercase">{tenantSlug}</p>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {items.length === 0 ? (
          <div className="rounded-sm border border-dashed border-[var(--color-accent-secondary)] p-4 text-sm">
            Agrega productos desde el menu para empezar tu pedido.
          </div>
        ) : (
          items.map((cartLine) => (
            <article
              key={cartLine.item.documentId}
              className="space-y-3 border-b border-dashed border-[#29251f]/25 py-4 first:pt-0 last:border-0"
            >
              <CartItem cartLine={cartLine} />
            </article>
          ))
        )}
      </div>

      <div className="mx-4 space-y-3 border-t-2 border-dashed border-[#29251f]/30 pb-7 pt-4">
        <div className="flex justify-between text-xs uppercase opacity-70">
          <span>Líneas: {items.length}</span>
          <span>Unidades: {itemCount}</span>
        </div>
        {items.length > 0 ? (
          <div className="border-b border-[var(--color-accent-secondary)]/30 pb-3">
            <DiscountCouponInput
              appliedDiscount={appliedDiscount}
              discountTotal={discountTotal}
              onApply={applyDiscount}
              onRemove={removeDiscount}
              disabled={syncStatus === "syncing"}
              appearance="ticket"
            />
          </div>
        ) : null}

        {discountTotal > 0 ? (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-sm opacity-80">
              <span>Subtotal original</span>
              <span className="line-through opacity-60">${subtotal.toLocaleString("es-AR")}</span>
            </div>
            <div className="flex items-center justify-between text-sm font-medium text-emerald-700">
              <span>Descuento aplicado</span>
              <span>-${discountTotal.toLocaleString("es-AR")}</span>
            </div>
            <div className="flex items-center justify-between text-lg font-bold">
              <span>Total final</span>
              <span className="text-xl font-extrabold text-emerald-700">
                ${total.toLocaleString("es-AR")}
              </span>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-3 text-xl font-black uppercase tabular-nums">
            <span>Total</span>
            <span>${total.toLocaleString("es-AR")}</span>
          </div>
        )}

        {syncError ? (
          <p className="text-sm text-red-700">
            {syncErrorMessage}
          </p>
        ) : null}

        <button
          type="button"
          onClick={handleCheckout}
          disabled={items.length === 0 || syncStatus === "syncing"}
          className="w-full rounded-sm bg-[#29251f] px-4 py-3 text-sm font-bold uppercase tracking-wide text-[#faf7ef] transition-colors hover:bg-black disabled:cursor-not-allowed disabled:opacity-50"
        >
          {syncStatus === "syncing" ? "Preparando checkout..." : "Continuar al pago →"}
        </button>
      </div>
    </div>
  );
}
