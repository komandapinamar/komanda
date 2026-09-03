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
    if (!customerName.trim()) {
      setError("Ingresá el nombre del cliente.");
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
            customer: { name: customerName.trim() },
            notes: notes.trim() || undefined,
          }),
        },
      );

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(
          body?.title ?? "Error al crear el pedido.",
        );
      }

      const order = (await response.json()) as { purchaseNumber: string; id: string };
      router.push(
        `/checkout/pay/success?source=admin_direct&order_id=${order.id}&purchase_number=${order.purchaseNumber}&customer_name=${encodeURIComponent(customerName.trim())}`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al crear el pedido.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {error ? (
        <div className="rounded-sm border border-red-700 bg-red-900/20 p-4 text-sm text-red-400">
          {error}
        </div>
      ) : null}

      <section className="rounded-sm border border-zinc-800 bg-zinc-900 p-6">
        <h2 className="mb-4 text-xl font-semibold">Productos</h2>
        {activeItems.length === 0 ? (
          <p className="text-sm text-zinc-400">
            No hay productos activos en el catálogo.
          </p>
        ) : (
          <div className="space-y-4">
            {initialCategories.map((category) => {
              const catItems = activeItems.filter(
                (item) => item.categoryId === category.id,
              );
              if (catItems.length === 0) return null;
              return (
                <div key={category.id}>
                  <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-amber-400">
                    {category.name}
                  </h3>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {catItems.map((item) => (
                      <div
                        key={item.id}
                        className="flex items-center justify-between rounded-sm border border-zinc-700 bg-zinc-800 px-4 py-3"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">
                            {item.name}
                          </p>
                          <p className="text-xs text-zinc-400">
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
                            className="flex h-8 w-8 items-center justify-center rounded-sm border border-zinc-600 text-sm disabled:opacity-30"
                          >
                            -
                          </button>
                          <span className="w-6 text-center text-sm font-semibold tabular-nums">
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
                            className="flex h-8 w-8 items-center justify-center rounded-sm border border-zinc-600 text-sm disabled:opacity-30"
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

      <section className="rounded-sm border border-zinc-800 bg-zinc-900 p-6">
        <h2 className="mb-4 text-xl font-semibold">Datos del cliente</h2>
        <div className="space-y-4">
          <div>
            <label
              htmlFor="customerName"
              className="mb-1 block text-sm font-medium"
            >
              Nombre del cliente *
            </label>
            <input
              id="customerName"
              type="text"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="Ej: Juan Pérez"
              className="w-full rounded-sm border border-zinc-700 bg-zinc-800 px-4 py-3 text-sm focus:border-amber-400 focus:outline-none"
            />
          </div>
          <div>
            <label
              htmlFor="notes"
              className="mb-1 block text-sm font-medium"
            >
              Notas del pedido
            </label>
            <textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ej: sin sal, bien cocido..."
              rows={3}
              className="w-full rounded-sm border border-zinc-700 bg-zinc-800 px-4 py-3 text-sm focus:border-amber-400 focus:outline-none"
            />
          </div>
        </div>
      </section>

      <div className="flex items-center justify-between rounded-sm border border-zinc-800 bg-zinc-900 p-4">
        <p className="text-sm text-zinc-400">
          {selectedCount > 0
            ? `${selectedCount} producto${selectedCount !== 1 ? "s" : ""} seleccionado${selectedCount !== 1 ? "s" : ""}`
            : "Ningún producto seleccionado"}
        </p>
        <button
          type="button"
          disabled={submitting || selectedCount === 0 || !customerName.trim()}
          onClick={handleSubmit}
          className="rounded-sm bg-amber-400 px-6 py-3 font-semibold text-zinc-950 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? "Creando pedido..." : "Crear pedido directo"}
        </button>
      </div>
    </div>
  );
}
