"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type CatalogItem = {
  id: string;
  name: string;
  price: string;
  status: string;
  categoryId: string | null;
};

type CatalogCategory = {
  id: string;
  name: string;
};

type AdminDirectOrderFormProps = {
  tenantId: string;
  initialItems: CatalogItem[];
  initialCategories: CatalogCategory[];
};

export function AdminDirectOrderForm({
  tenantId,
  initialItems,
  initialCategories,
}: AdminDirectOrderFormProps) {
  const router = useRouter();
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [customerName, setCustomerName] = useState("");
  const [discountCode, setDiscountCode] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeItems = initialItems.filter(
    (item) => item.status === "active",
  );

  const selectedCount = Object.values(quantities).reduce(
    (sum, q) => sum + (q > 0 ? 1 : 0),
    0,
  );

  const handleQuantityChange = (itemId: string, value: number) => {
    setQuantities((prev) => {
      const next = { ...prev };
      if (value <= 0) {
        delete next[itemId];
      } else {
        next[itemId] = Math.min(value, 50);
      }
      return next;
    });
  };

  const handleSubmit = async () => {
    if (selectedCount === 0) {
      setError("Seleccioná al menos un producto.");
      return;
    }

    setSubmitting(true);
    setError(null);

    const items = Object.entries(quantities)
      .filter(([, qty]) => qty > 0)
      .map(([resourceId, quantity]) => ({
        kind: "item" as const,
        resourceId,
        quantity,
      }));

    try {
      const response = await fetch(
        `/api/v1/tenants/${tenantId}/orders/from-items`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "idempotency-key": crypto.randomUUID(),
          },
          body: JSON.stringify({
            items,
            customer: { name: customerName.trim() || "NN" },
            notes: notes.trim() || undefined,
            discountCode: discountCode.trim() || undefined,
          }),
        },
      );

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(
          body?.title ?? body?.detail ?? "Error al crear el pedido.",
        );
      }

      const order = (await response.json()) as { purchaseNumber?: string; id?: string; pickupPin?: string };
      const ref = order.purchaseNumber || order.id || "1";
      router.replace(
        `/admin/${tenantId}/orders?created=${encodeURIComponent(ref)}`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al crear el pedido.");
    } finally {
      setSubmitting(false);
    }
  };

  const inputClass =
    "w-full rounded-2xl border border-white/12 bg-[#101013]/90 px-3.5 py-2.5 text-sm text-[#f4f3f1] placeholder:text-[#9b9ba4] outline-none transition focus:border-white/30 focus:ring-2 focus:ring-white/15";

  return (
    <div className="space-y-6">
      {error ? (
        <div className="rounded-2xl border border-red-400/30 bg-red-500/10 p-4 text-xs text-red-300">
          {error}
        </div>
      ) : null}

      <section className="liquid-prism-ring liquid-glass-card rounded-3xl p-6 sm:p-7 space-y-5">
        <div className="border-b border-white/[0.08] pb-4">
          <h2 className="text-xl font-medium tracking-tight text-[#f4f3f1]">Productos</h2>
          <p className="mt-0.5 text-xs text-[#c2c2cc]">
            Agregá las cantidades de cada producto activo del catálogo.
          </p>
        </div>
        {activeItems.length === 0 ? (
          <p className="text-sm text-[#c2c2cc]">
            No hay productos activos en el catálogo.
          </p>
        ) : (
          <div className="space-y-5">
            {initialCategories.map((category) => {
              const catItems = activeItems.filter(
                (item) => item.categoryId === category.id,
              );
              if (catItems.length === 0) return null;
              return (
                <div key={category.id} className="space-y-2.5">
                  <h3 className="text-xs font-medium uppercase tracking-widest text-[#c2c2cc]">
                    {category.name}
                  </h3>
                  <div className="grid gap-2.5 sm:grid-cols-2">
                    {catItems.map((item) => (
                      <div
                        key={item.id}
                        className="flex items-center justify-between rounded-2xl border border-white/12 bg-[#101013]/90 px-4 py-3"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-[#f4f3f1]">
                            {item.name}
                          </p>
                          <p className="text-xs text-[#c2c2cc] tabular-nums">
                            ${item.price}
                          </p>
                        </div>
                        <div className="ml-3 flex items-center gap-2">
                          <button
                            type="button"
                            disabled={(quantities[item.id] ?? 0) <= 0}
                            onClick={() =>
                              handleQuantityChange(
                                item.id,
                                (quantities[item.id] ?? 0) - 1,
                              )
                            }
                            className="flex size-8 items-center justify-center rounded-full border border-white/15 bg-white/[0.05] text-sm text-[#f4f3f1] transition hover:bg-white/[0.12] disabled:opacity-30"
                          >
                            -
                          </button>
                          <span className="w-6 text-center text-sm font-medium text-[#f4f3f1] tabular-nums">
                            {quantities[item.id] ?? 0}
                          </span>
                          <button
                            type="button"
                            disabled={(quantities[item.id] ?? 0) >= 50}
                            onClick={() =>
                              handleQuantityChange(
                                item.id,
                                (quantities[item.id] ?? 0) + 1,
                              )
                            }
                            className="flex size-8 items-center justify-center rounded-full border border-white/15 bg-white/[0.05] text-sm text-[#f4f3f1] transition hover:bg-white/[0.12] disabled:opacity-30"
                          >
                            +
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="liquid-glass-card rounded-3xl p-6 sm:p-7 space-y-5">
        <div className="border-b border-white/[0.08] pb-4">
          <h2 className="text-xl font-medium tracking-tight text-[#f4f3f1]">Datos del cliente</h2>
          <p className="mt-0.5 text-xs text-[#c2c2cc]">
            Información de identificación, cupón opcional y notas para cocina.
          </p>
        </div>
        <div className="space-y-4">
          <div>
            <label
              htmlFor="customerName"
              className="mb-1.5 block text-xs font-medium text-[#c2c2cc]"
            >
              Nombre del cliente (opcional, por defecto: NN)
            </label>
            <input
              id="customerName"
              type="text"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="Ej: Juan Pérez o NN"
              className={inputClass}
            />
          </div>
          <div>
            <label
              htmlFor="discountCode"
              className="mb-1.5 block text-xs font-medium text-[#c2c2cc]"
            >
              Código de descuento (opcional)
            </label>
            <input
              id="discountCode"
              type="text"
              value={discountCode}
              onChange={(e) => setDiscountCode(e.target.value.toUpperCase())}
              placeholder="Ej: PROMO10"
              className={`${inputClass} uppercase`}
            />
          </div>
          <div>
            <label
              htmlFor="notes"
              className="mb-1.5 block text-xs font-medium text-[#c2c2cc]"
            >
              Notas del pedido
            </label>
            <textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ej: sin sal, bien cocido..."
              rows={3}
              className={inputClass}
            />
          </div>
        </div>
      </section>

      <div className="flex items-center justify-between rounded-2xl border border-border-component-detail-container bg-background-secondary-default px-6 py-4 shadow-card">
        <p className="text-body-medium text-text-secondary">
          {selectedCount > 0
            ? `${selectedCount} producto${selectedCount !== 1 ? "s" : ""} seleccionado${selectedCount !== 1 ? "s" : ""}`
            : "Ningún producto seleccionado"}
        </p>
        <button
          type="button"
          disabled={submitting || selectedCount === 0}
          onClick={handleSubmit}
          className="bg-button-primary button-press-motion inline-flex h-9 cursor-pointer items-center justify-center rounded-2lg px-5 text-body-medium text-text-white shadow-xs disabled:cursor-not-allowed disabled:opacity-45"
        >
          {submitting ? "Creando pedido..." : "Crear pedido directo"}
        </button>
      </div>
    </div>
  );
}
