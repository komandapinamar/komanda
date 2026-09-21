"use client";

import { FormEvent, useState } from "react";
import type {
  DiscountOutput,
  DiscountStatus,
} from "@/features/discounts/domain/discount.schemas";

export function getStatusBadgeClass(status: DiscountStatus): string {
  switch (status) {
    case "active":
      return "bg-emerald-950/60 text-emerald-400 border-emerald-800";
    case "paused":
      return "bg-amber-950/60 text-amber-400 border-amber-800";
    case "scheduled":
      return "bg-sky-950/60 text-sky-400 border-sky-800";
    case "expired":
    case "exhausted":
      return "bg-zinc-800 text-zinc-400 border-zinc-700";
    default:
      return "bg-zinc-800 text-zinc-400 border-zinc-700";
  }
}

export function getStatusLabel(status: DiscountStatus): string {
  switch (status) {
    case "active":
      return "Activo";
    case "paused":
      return "Pausado";
    case "scheduled":
      return "Programado";
    case "expired":
      return "Vencido";
    case "exhausted":
      return "Agotado";
    default:
      return status;
  }
}

type FilterTab = "all" | "active" | "paused" | "expired_exhausted";

export function AdminDiscountsPanel({
  tenantId,
  initialDiscounts,
}: {
  tenantId: string;
  initialDiscounts: DiscountOutput[];
}) {
  const [discounts, setDiscounts] = useState<DiscountOutput[]>(initialDiscounts);
  const [activeTab, setActiveTab] = useState<FilterTab>("all");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // Form state
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [discountType, setDiscountType] = useState<"percentage" | "fixed_amount">("percentage");
  const [discountValue, setDiscountValue] = useState("");
  const [minOrderAmount, setMinOrderAmount] = useState("");
  const [maxRedemptions, setMaxRedemptions] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [scope, setScope] = useState<"global" | "category" | "item">("global");
  const [formError, setFormError] = useState<string | null>(null);

  const resetForm = () => {
    setCode("");
    setName("");
    setDescription("");
    setDiscountType("percentage");
    setDiscountValue("");
    setMinOrderAmount("");
    setMaxRedemptions("");
    setStartsAt("");
    setEndsAt("");
    setScope("global");
    setFormError(null);
  };

  const handleCreateDiscount = async (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setIsSubmitting(true);

    try {
      const payload: Record<string, unknown> = {
        code: code.trim().toUpperCase(),
        name: name.trim(),
        description: description.trim() || null,
        discountType,
        discountValue: discountValue.trim(),
        minOrderAmount: minOrderAmount.trim() || "0",
        scope,
        targetCategoryIds: [],
        targetItemIds: [],
        isActive: true,
      };

      if (maxRedemptions.trim()) {
        payload.maxRedemptions = Number(maxRedemptions.trim());
      }
      if (startsAt) {
        payload.startsAt = new Date(startsAt).toISOString();
      }
      if (endsAt) {
        payload.endsAt = new Date(endsAt).toISOString();
      }

      const res = await fetch(`/api/v1/tenants/${tenantId}/discounts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || body.title || "No se pudo crear el cupón.");
      }

      const createdDiscount: DiscountOutput = await res.json();
      setDiscounts((prev) => [createdDiscount, ...prev]);
      setIsModalOpen(false);
      resetForm();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleActive = async (discount: DiscountOutput) => {
    setActionError(null);
    const nextActive = !discount.isActive;

    // Optimistic update
    setDiscounts((prev) =>
      prev.map((d) =>
        d.id === discount.id
          ? {
              ...d,
              isActive: nextActive,
              status: nextActive ? "active" : "paused",
            }
          : d,
      ),
    );

    try {
      const res = await fetch(`/api/v1/tenants/${tenantId}/discounts/${discount.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "If-Match": String(discount.version),
        },
        body: JSON.stringify({ isActive: nextActive }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || body.title || "Error al actualizar estado.");
      }

      const updatedDiscount: DiscountOutput = await res.json();
      setDiscounts((prev) =>
        prev.map((d) => (d.id === updatedDiscount.id ? updatedDiscount : d)),
      );
    } catch (err) {
      // Revert optimistic update
      setDiscounts((prev) =>
        prev.map((d) => (d.id === discount.id ? discount : d)),
      );
      setActionError(err instanceof Error ? err.message : "Error al actualizar.");
    }
  };

  const handleDelete = async (discountId: string) => {
    if (!window.confirm("¿Seguro que querés archivar este código de descuento?")) {
      return;
    }

    setActionError(null);
    try {
      const res = await fetch(`/api/v1/tenants/${tenantId}/discounts/${discountId}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || body.title || "Error al archivar cupón.");
      }

      setDiscounts((prev) => prev.filter((d) => d.id !== discountId));
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Error al archivar.");
    }
  };

  const filteredDiscounts = discounts.filter((d) => {
    if (activeTab === "active") return d.status === "active";
    if (activeTab === "paused") return d.status === "paused";
    if (activeTab === "expired_exhausted")
      return d.status === "expired" || d.status === "exhausted";
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-100">
            Códigos de Descuento
          </h1>
          <p className="text-sm text-zinc-400 mt-1">
            Administrá cupones promocionales, porcentajes, límites de canje y vigencia.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            resetForm();
            setIsModalOpen(true);
          }}
          className="inline-flex items-center justify-center rounded-sm bg-zinc-100 px-4 py-2 text-sm font-semibold text-zinc-900 transition hover:bg-zinc-200"
        >
          + Crear Código
        </button>
      </div>

      {actionError ? (
        <div className="rounded-sm border border-red-800 bg-red-950/40 p-4 text-sm text-red-400">
          {actionError}
        </div>
      ) : null}

      {/* Filter Tabs */}
      <div className="flex items-center gap-2 border-b border-zinc-800 pb-3 text-sm">
        <button
          type="button"
          onClick={() => setActiveTab("all")}
          className={`rounded-sm px-3 py-1.5 transition ${
            activeTab === "all"
              ? "bg-zinc-800 text-zinc-100 font-medium"
              : "text-zinc-400 hover:text-zinc-200"
          }`}
        >
          Todos ({discounts.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("active")}
          className={`rounded-sm px-3 py-1.5 transition ${
            activeTab === "active"
              ? "bg-zinc-800 text-zinc-100 font-medium"
              : "text-zinc-400 hover:text-zinc-200"
          }`}
        >
          Activos ({discounts.filter((d) => d.status === "active").length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("paused")}
          className={`rounded-sm px-3 py-1.5 transition ${
            activeTab === "paused"
              ? "bg-zinc-800 text-zinc-100 font-medium"
              : "text-zinc-400 hover:text-zinc-200"
          }`}
        >
          Pausados ({discounts.filter((d) => d.status === "paused").length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("expired_exhausted")}
          className={`rounded-sm px-3 py-1.5 transition ${
            activeTab === "expired_exhausted"
              ? "bg-zinc-800 text-zinc-100 font-medium"
              : "text-zinc-400 hover:text-zinc-200"
          }`}
        >
          Vencidos / Agotados (
          {
            discounts.filter(
              (d) => d.status === "expired" || d.status === "exhausted",
            ).length
          }
          )
        </button>
      </div>

      {/* Table */}
      <div className="rounded-sm border border-zinc-800 bg-zinc-900/60 overflow-hidden">
        {filteredDiscounts.length === 0 ? (
          <div className="p-8 text-center text-sm text-zinc-400">
            No se encontraron cupones con este filtro.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-zinc-300">
              <thead className="border-b border-zinc-800 bg-zinc-900/90 text-xs uppercase text-zinc-400">
                <tr>
                  <th scope="col" className="px-4 py-3">
                    Código / Nombre
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Beneficio
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Compra Mínima
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Canjes
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Vigencia
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Estado
                  </th>
                  <th scope="col" className="px-4 py-3 text-right">
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800">
                {filteredDiscounts.map((discount) => (
                  <tr key={discount.id} className="hover:bg-zinc-800/40 transition">
                    <td className="px-4 py-3">
                      <div className="font-mono font-semibold text-zinc-100">
                        {discount.code}
                      </div>
                      <div className="text-xs text-zinc-400">{discount.name}</div>
                    </td>
                    <td className="px-4 py-3 font-medium text-emerald-400">
                      {discount.discountType === "percentage"
                        ? `${Number(discount.discountValue)}% OFF`
                        : `$${Number(discount.discountValue).toLocaleString("es-AR")} OFF`}
                    </td>
                    <td className="px-4 py-3 text-zinc-300">
                      {Number(discount.minOrderAmount) > 0
                        ? `$${Number(discount.minOrderAmount).toLocaleString("es-AR")}`
                        : "Sin mínimo"}
                    </td>
                    <td className="px-4 py-3">
                      <span>{discount.redemptionsCount}</span>
                      <span className="text-zinc-500">
                        {discount.maxRedemptions ? ` / ${discount.maxRedemptions}` : " (ilimitado)"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-zinc-400">
                      {discount.endsAt
                        ? `Hasta ${new Date(discount.endsAt).toLocaleDateString("es-AR")}`
                        : "Sin vencimiento"}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-block rounded-full border px-2.5 py-0.5 text-xs font-semibold ${getStatusBadgeClass(
                          discount.status,
                        )}`}
                      >
                        {getStatusLabel(discount.status)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => handleToggleActive(discount)}
                          className={`rounded-sm border px-2 py-1 text-xs font-medium transition ${
                            discount.isActive
                              ? "border-amber-800/60 text-amber-400 hover:bg-amber-950/40"
                              : "border-emerald-800/60 text-emerald-400 hover:bg-emerald-950/40"
                          }`}
                        >
                          {discount.isActive ? "Pausar" : "Reactivar"}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(discount.id)}
                          className="rounded-sm border border-zinc-700 px-2 py-1 text-xs text-zinc-400 hover:border-red-800 hover:text-red-400 transition"
                        >
                          Archivar
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Creation Modal */}
      {isModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-lg rounded-sm border border-zinc-800 bg-zinc-900 p-6 text-zinc-100 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <h2 className="text-lg font-bold">Crear Código de Descuento</h2>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="text-zinc-400 hover:text-zinc-100 text-lg"
              >
                ✕
              </button>
            </div>

            {formError ? (
              <div className="rounded-sm border border-red-800 bg-red-950/40 p-3 text-xs text-red-400">
                {formError}
              </div>
            ) : null}

            <form onSubmit={handleCreateDiscount} className="space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="code" className="block text-xs font-medium text-zinc-400 mb-1">
                    Código promocional *
                  </label>
                  <input
                    id="code"
                    type="text"
                    required
                    placeholder="VERANO2026"
                    value={code}
                    onChange={(e) => setCode(e.target.value.toUpperCase())}
                    className="w-full rounded-sm border border-zinc-800 bg-zinc-950 px-3 py-2 font-mono text-zinc-100 focus:border-zinc-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label htmlFor="name" className="block text-xs font-medium text-zinc-400 mb-1">
                    Nombre descriptivo *
                  </label>
                  <input
                    id="name"
                    type="text"
                    required
                    placeholder="Promo Fin de Semana"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full rounded-sm border border-zinc-800 bg-zinc-950 px-3 py-2 text-zinc-100 focus:border-zinc-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="desc" className="block text-xs font-medium text-zinc-400 mb-1">
                  Descripción (opcional)
                </label>
                <input
                  id="desc"
                  type="text"
                  placeholder="20% de descuento en pedidos"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full rounded-sm border border-zinc-800 bg-zinc-950 px-3 py-2 text-zinc-100 focus:border-zinc-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="type" className="block text-xs font-medium text-zinc-400 mb-1">
                    Tipo de beneficio *
                  </label>
                  <select
                    id="type"
                    value={discountType}
                    onChange={(e) =>
                      setDiscountType(e.target.value as "percentage" | "fixed_amount")
                    }
                    className="w-full rounded-sm border border-zinc-800 bg-zinc-950 px-3 py-2 text-zinc-100 focus:border-zinc-500 focus:outline-none"
                  >
                    <option value="percentage">Porcentaje (%)</option>
                    <option value="fixed_amount">Monto fijo ($)</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="val" className="block text-xs font-medium text-zinc-400 mb-1">
                    Valor del descuento *
                  </label>
                  <input
                    id="val"
                    type="text"
                    required
                    placeholder={discountType === "percentage" ? "15" : "2000"}
                    value={discountValue}
                    onChange={(e) => setDiscountValue(e.target.value)}
                    className="w-full rounded-sm border border-zinc-800 bg-zinc-950 px-3 py-2 text-zinc-100 focus:border-zinc-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="minOrder" className="block text-xs font-medium text-zinc-400 mb-1">
                    Compra mínima ($)
                  </label>
                  <input
                    id="minOrder"
                    type="text"
                    placeholder="0"
                    value={minOrderAmount}
                    onChange={(e) => setMinOrderAmount(e.target.value)}
                    className="w-full rounded-sm border border-zinc-800 bg-zinc-950 px-3 py-2 text-zinc-100 focus:border-zinc-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label htmlFor="maxRedemptions" className="block text-xs font-medium text-zinc-400 mb-1">
                    Tope global de canjes
                  </label>
                  <input
                    id="maxRedemptions"
                    type="number"
                    min="1"
                    placeholder="Sin límite"
                    value={maxRedemptions}
                    onChange={(e) => setMaxRedemptions(e.target.value)}
                    className="w-full rounded-sm border border-zinc-800 bg-zinc-950 px-3 py-2 text-zinc-100 focus:border-zinc-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="startsAt" className="block text-xs font-medium text-zinc-400 mb-1">
                    Fecha inicio (opcional)
                  </label>
                  <input
                    id="startsAt"
                    type="date"
                    value={startsAt}
                    onChange={(e) => setStartsAt(e.target.value)}
                    className="w-full rounded-sm border border-zinc-800 bg-zinc-950 px-3 py-2 text-zinc-100 focus:border-zinc-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label htmlFor="endsAt" className="block text-xs font-medium text-zinc-400 mb-1">
                    Fecha expiración (opcional)
                  </label>
                  <input
                    id="endsAt"
                    type="date"
                    value={endsAt}
                    onChange={(e) => setEndsAt(e.target.value)}
                    className="w-full rounded-sm border border-zinc-800 bg-zinc-950 px-3 py-2 text-zinc-100 focus:border-zinc-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-zinc-800">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="rounded-sm border border-zinc-700 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800 transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="rounded-sm bg-zinc-100 px-4 py-2 text-sm font-semibold text-zinc-900 hover:bg-zinc-200 transition disabled:opacity-50"
                >
                  {isSubmitting ? "Creando..." : "Crear Cupón"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
