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
  const [applicableTender, setApplicableTender] = useState<"all" | "cash">("all");
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
    setApplicableTender("all");
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
        applicableTender,
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

  const inputClass =
    "w-full rounded-2xl border border-white/12 bg-[#101013]/90 px-3.5 py-2.5 text-sm text-[#f4f3f1] placeholder:text-[#9b9ba4] outline-none transition focus:border-white/30 focus:ring-2 focus:ring-white/15";

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      {/* Header */}
      <div className="flex flex-col justify-between gap-4 border-b border-white/[0.08] pb-6 sm:flex-row sm:items-end">
        <div className="space-y-1">
          <p className="text-xs font-medium uppercase tracking-widest text-[#c2c2cc]">
            Promociones
          </p>
          <h1 className="text-3xl font-medium tracking-tight text-[#f4f3f1]">
            Códigos de Descuento
          </h1>
          <p className="text-sm text-[#c2c2cc]">
            Administrá cupones promocionales, porcentajes, límites de canje y vigencia.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            resetForm();
            setIsModalOpen(true);
          }}
          className="inline-flex h-10 shrink-0 items-center justify-center rounded-full bg-[#f4f3f1] px-5 text-sm font-medium text-[#141416] transition hover:bg-white"
        >
          + Crear Código
        </button>
      </div>

      {actionError ? (
        <div className="rounded-2xl border border-red-400/30 bg-red-500/10 p-4 text-xs text-red-300">
          {actionError}
        </div>
      ) : null}

      <section className="liquid-prism-ring liquid-glass-card rounded-3xl p-6 sm:p-7 space-y-5">
        {/* Filter Tabs */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <button
            type="button"
            onClick={() => setActiveTab("all")}
            className={`rounded-full px-3.5 py-1.5 font-medium transition ${
              activeTab === "all"
                ? "bg-[#f4f3f1] text-[#141416]"
                : "border border-white/12 bg-white/[0.04] text-[#d4d4dc] hover:bg-white/[0.1] hover:text-white"
            }`}
          >
            Todos ({discounts.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("active")}
            className={`rounded-full px-3.5 py-1.5 font-medium transition ${
              activeTab === "active"
                ? "bg-[#f4f3f1] text-[#141416]"
                : "border border-white/12 bg-white/[0.04] text-[#d4d4dc] hover:bg-white/[0.1] hover:text-white"
            }`}
          >
            Activos ({discounts.filter((d) => d.status === "active").length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("paused")}
            className={`rounded-full px-3.5 py-1.5 font-medium transition ${
              activeTab === "paused"
                ? "bg-[#f4f3f1] text-[#141416]"
                : "border border-white/12 bg-white/[0.04] text-[#d4d4dc] hover:bg-white/[0.1] hover:text-white"
            }`}
          >
            Pausados ({discounts.filter((d) => d.status === "paused").length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("expired_exhausted")}
            className={`rounded-full px-3.5 py-1.5 font-medium transition ${
              activeTab === "expired_exhausted"
                ? "bg-[#f4f3f1] text-[#141416]"
                : "border border-white/12 bg-white/[0.04] text-[#d4d4dc] hover:bg-white/[0.1] hover:text-white"
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
        <div className="overflow-hidden rounded-2xl border border-white/12 bg-[#101013]/90">
          {filteredDiscounts.length === 0 ? (
            <div className="p-8 text-center text-xs text-[#c2c2cc]">
              No se encontraron cupones con este filtro.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-[#d4d4dc]">
                <thead className="border-b border-white/[0.08] bg-white/[0.03] text-[11px] uppercase tracking-wider text-[#c2c2cc]">
                  <tr>
                    <th scope="col" className="px-4 py-3.5 font-medium">
                      Código / Nombre
                    </th>
                    <th scope="col" className="px-4 py-3.5 font-medium">
                      Beneficio
                    </th>
                    <th scope="col" className="px-4 py-3.5 font-medium">
                      Compra Mínima
                    </th>
                    <th scope="col" className="px-4 py-3.5 font-medium">
                      Canjes
                    </th>
                    <th scope="col" className="px-4 py-3.5 font-medium">
                      Vigencia
                    </th>
                    <th scope="col" className="px-4 py-3.5 font-medium">
                      Estado
                    </th>
                    <th scope="col" className="px-4 py-3.5 text-right font-medium">
                      Acciones
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.08]">
                  {filteredDiscounts.map((discount) => (
                    <tr key={discount.id} className="transition hover:bg-white/[0.03]">
                      <td className="px-4 py-3.5">
                        <div className="font-mono text-sm font-medium text-[#f4f3f1]">
                          {discount.code}
                        </div>
                        <div className="text-xs text-[#c2c2cc]">{discount.name}</div>
                        {discount.applicableTender === "cash" ? (
                          <span className="mt-1 inline-block rounded-full border border-emerald-400/30 bg-emerald-500/15 px-2.5 py-0.5 text-[11px] font-medium text-emerald-300">
                            Exclusivo Efectivo
                          </span>
                        ) : null}
                      </td>
                      <td className="px-4 py-3.5 font-medium text-emerald-400">
                        {discount.discountType === "percentage"
                          ? `${Number(discount.discountValue)}% OFF`
                          : `$${Number(discount.discountValue).toLocaleString("es-AR")} OFF`}
                      </td>
                      <td className="px-4 py-3.5 text-[#f4f3f1]">
                        {Number(discount.minOrderAmount) > 0
                          ? `$${Number(discount.minOrderAmount).toLocaleString("es-AR")}`
                          : "Sin mínimo"}
                      </td>
                      <td className="px-4 py-3.5 tabular-nums">
                        <span className="text-[#f4f3f1]">{discount.redemptionsCount}</span>
                        <span className="text-[#c2c2cc]">
                          {discount.maxRedemptions ? ` / ${discount.maxRedemptions}` : " (ilimitado)"}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-xs text-[#c2c2cc]">
                        {discount.endsAt
                          ? `Hasta ${new Date(discount.endsAt).toLocaleDateString("es-AR")}`
                          : "Sin vencimiento"}
                      </td>
                      <td className="px-4 py-3.5">
                        <span
                          className={`inline-block rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${getStatusBadgeClass(
                            discount.status,
                          )}`}
                        >
                          {getStatusLabel(discount.status)}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => handleToggleActive(discount)}
                            className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                              discount.isActive
                                ? "border-amber-400/30 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20"
                                : "border-emerald-400/30 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20"
                            }`}
                          >
                            {discount.isActive ? "Pausar" : "Reactivar"}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(discount.id)}
                            className="rounded-full border border-white/15 bg-white/[0.04] px-3 py-1 text-xs font-medium text-[#c2c2cc] transition hover:border-red-400/40 hover:text-red-300"
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
      </section>

      {/* Creation Modal */}
      {isModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
          <div className="liquid-glass-card w-full max-w-lg rounded-3xl p-6 sm:p-7 text-[#f4f3f1] shadow-2xl space-y-5">
            <div className="flex items-center justify-between border-b border-white/[0.08] pb-4">
              <h2 className="text-xl font-medium tracking-tight text-[#f4f3f1]">Crear Código de Descuento</h2>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="text-lg text-[#c2c2cc] hover:text-white"
              >
                ✕
              </button>
            </div>

            {formError ? (
              <div className="rounded-2xl border border-red-400/30 bg-red-500/10 p-3.5 text-xs text-red-300">
                {formError}
              </div>
            ) : null}

            <form onSubmit={handleCreateDiscount} className="space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="code" className="mb-1.5 block text-xs font-medium text-[#c2c2cc]">
                    Código promocional *
                  </label>
                  <input
                    id="code"
                    type="text"
                    required
                    placeholder="VERANO2026"
                    value={code}
                    onChange={(e) => setCode(e.target.value.toUpperCase())}
                    className={`${inputClass} font-mono`}
                  />
                </div>
                <div>
                  <label htmlFor="name" className="mb-1.5 block text-xs font-medium text-[#c2c2cc]">
                    Nombre descriptivo *
                  </label>
                  <input
                    id="name"
                    type="text"
                    required
                    placeholder="Promo Fin de Semana"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className={inputClass}
                  />
                </div>
              </div>

              <div>
                <label htmlFor="desc" className="mb-1.5 block text-xs font-medium text-[#c2c2cc]">
                  Descripción (opcional)
                </label>
                <input
                  id="desc"
                  type="text"
                  placeholder="20% de descuento en pedidos"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className={inputClass}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="type" className="mb-1.5 block text-xs font-medium text-[#c2c2cc]">
                    Tipo de beneficio *
                  </label>
                  <select
                    id="type"
                    value={discountType}
                    onChange={(e) =>
                      setDiscountType(e.target.value as "percentage" | "fixed_amount")
                    }
                    className={inputClass}
                  >
                    <option value="percentage">Porcentaje (%)</option>
                    <option value="fixed_amount">Monto fijo ($)</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="val" className="mb-1.5 block text-xs font-medium text-[#c2c2cc]">
                    Valor del descuento *
                  </label>
                  <input
                    id="val"
                    type="text"
                    required
                    placeholder={discountType === "percentage" ? "15" : "2000"}
                    value={discountValue}
                    onChange={(e) => setDiscountValue(e.target.value)}
                    className={inputClass}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="minOrder" className="mb-1.5 block text-xs font-medium text-[#c2c2cc]">
                    Compra mínima ($)
                  </label>
                  <input
                    id="minOrder"
                    type="text"
                    placeholder="0"
                    value={minOrderAmount}
                    onChange={(e) => setMinOrderAmount(e.target.value)}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label htmlFor="maxRedemptions" className="mb-1.5 block text-xs font-medium text-[#c2c2cc]">
                    Tope global de canjes
                  </label>
                  <input
                    id="maxRedemptions"
                    type="number"
                    min="1"
                    placeholder="Sin límite"
                    value={maxRedemptions}
                    onChange={(e) => setMaxRedemptions(e.target.value)}
                    className={inputClass}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="startsAt" className="mb-1.5 block text-xs font-medium text-[#c2c2cc]">
                    Fecha inicio (opcional)
                  </label>
                  <input
                    id="startsAt"
                    type="date"
                    value={startsAt}
                    onChange={(e) => setStartsAt(e.target.value)}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label htmlFor="endsAt" className="mb-1.5 block text-xs font-medium text-[#c2c2cc]">
                    Fecha expiración (opcional)
                  </label>
                  <input
                    id="endsAt"
                    type="date"
                    value={endsAt}
                    onChange={(e) => setEndsAt(e.target.value)}
                    className={inputClass}
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="applicableTender"
                  className="mb-1.5 block text-xs font-medium text-[#c2c2cc]"
                  title="Incentivá pagos en efectivo para ahorrar comisiones de cobro online"
                >
                  Medio de Pago requerido
                </label>
                <select
                  id="applicableTender"
                  value={applicableTender}
                  onChange={(e) => setApplicableTender(e.target.value as "all" | "cash")}
                  title="Incentivá pagos en efectivo para ahorrar comisiones de cobro online"
                  className={inputClass}
                >
                  <option value="all">Todos los medios</option>
                  <option value="cash">Solo Efectivo</option>
                </select>
                <p className="mt-1.5 text-xs text-[#9b9ba4]">
                  Incentivá pagos en efectivo para ahorrar comisiones de cobro online
                </p>
              </div>

              <div className="flex justify-end gap-2.5 border-t border-white/[0.08] pt-4">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="inline-flex h-10 items-center justify-center rounded-full border border-white/15 bg-white/[0.05] px-4 text-xs font-medium text-[#f4f3f1] transition hover:bg-white/[0.12]"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="inline-flex h-10 items-center justify-center rounded-full bg-[#f4f3f1] px-5 text-xs font-medium text-[#141416] transition hover:bg-white disabled:opacity-50"
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
