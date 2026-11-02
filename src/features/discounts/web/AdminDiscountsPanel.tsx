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
    "w-full rounded-2lg border border-border-button-default bg-background-tertiary-default px-3.5 py-2 text-body-regular text-text-primary placeholder:text-text-tertiary";

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      {/* Header */}
      <div className="flex flex-col justify-between gap-4 border-b border-separator-border pb-5 sm:flex-row sm:items-end">
        <div className="space-y-1">
          <p className="text-caption-1-semibold uppercase tracking-wider text-text-secondary">
            Promociones
          </p>
          <h1 className="text-title-1-semibold text-text-primary">
            Códigos de Descuento
          </h1>
          <p className="text-body-regular text-text-secondary">
            Administrá cupones promocionales, porcentajes, límites de canje y vigencia.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            resetForm();
            setIsModalOpen(true);
          }}
          className="bg-button-primary button-press-motion inline-flex h-9 shrink-0 cursor-pointer items-center justify-center rounded-2lg px-4 text-body-medium text-text-white shadow-xs"
        >
          + Crear Código
        </button>
      </div>

      {actionError ? (
        <div className="rounded-2lg border border-red-500/30 bg-status-rose-background p-4 text-body-2-medium text-status-rose-text">
          {actionError}
        </div>
      ) : null}

      <section className="space-y-5 rounded-2xl border border-border-component-detail-container bg-background-secondary-default p-6 shadow-card sm:p-7">
        {/* Filter Tabs */}
        <div className="inline-flex flex-wrap items-center gap-1 rounded-2lg bg-background-full p-1 text-body-2-medium">
          <button
            type="button"
            onClick={() => setActiveTab("all")}
            className={`cursor-pointer rounded-md px-3 py-1.5 transition ${
              activeTab === "all"
                ? "bg-segmented-control-selected-background text-text-primary shadow-2xs"
                : "text-text-secondary hover:text-text-primary"
            }`}
          >
            Todos ({discounts.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("active")}
            className={`cursor-pointer rounded-md px-3 py-1.5 transition ${
              activeTab === "active"
                ? "bg-segmented-control-selected-background text-text-primary shadow-2xs"
                : "text-text-secondary hover:text-text-primary"
            }`}
          >
            Activos ({discounts.filter((d) => d.status === "active").length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("paused")}
            className={`cursor-pointer rounded-md px-3 py-1.5 transition ${
              activeTab === "paused"
                ? "bg-segmented-control-selected-background text-text-primary shadow-2xs"
                : "text-text-secondary hover:text-text-primary"
            }`}
          >
            Pausados ({discounts.filter((d) => d.status === "paused").length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("expired_exhausted")}
            className={`cursor-pointer rounded-md px-3 py-1.5 transition ${
              activeTab === "expired_exhausted"
                ? "bg-segmented-control-selected-background text-text-primary shadow-2xs"
                : "text-text-secondary hover:text-text-primary"
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
        <div className="overflow-hidden rounded-2lg border border-border-table bg-background-primary-default/50">
          {filteredDiscounts.length === 0 ? (
            <div className="p-8 text-center text-body-2-regular text-text-secondary">
              No se encontraron cupones con este filtro.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="bui-table">
                <thead>
                  <tr>
                    <th scope="col">
                      Código / Nombre
                    </th>
                    <th scope="col">
                      Beneficio
                    </th>
                    <th scope="col">
                      Compra Mínima
                    </th>
                    <th scope="col">
                      Canjes
                    </th>
                    <th scope="col">
                      Vigencia
                    </th>
                    <th scope="col">
                      Estado
                    </th>
                    <th scope="col" className="text-right">
                      Acciones
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredDiscounts.map((discount) => (
                    <tr key={discount.id} className="hover:bg-background-primary-hover">
                      <td>
                        <div className="font-mono text-body-semibold text-text-primary">
                          {discount.code}
                        </div>
                        <div className="text-caption-1-regular text-text-secondary">{discount.name}</div>
                        {discount.applicableTender === "cash" ? (
                          <span className="mt-1 inline-block rounded-md bg-status-lime-background px-2 py-0.5 text-caption-2-semibold text-status-lime-text">
                            Exclusivo Efectivo
                          </span>
                        ) : null}
                      </td>
                      <td className="font-medium text-status-lime-text">
                        {discount.discountType === "percentage"
                          ? `${Number(discount.discountValue)}% OFF`
                          : `$${Number(discount.discountValue).toLocaleString("es-AR")} OFF`}
                      </td>
                      <td className="text-text-primary">
                        {Number(discount.minOrderAmount) > 0
                          ? `$${Number(discount.minOrderAmount).toLocaleString("es-AR")}`
                          : "Sin mínimo"}
                      </td>
                      <td className="tabular-nums">
                        <span className="text-text-primary">{discount.redemptionsCount}</span>
                        <span className="text-text-secondary">
                          {discount.maxRedemptions ? ` / ${discount.maxRedemptions}` : " (ilimitado)"}
                        </span>
                      </td>
                      <td className="text-caption-1-regular text-text-secondary">
                        {discount.endsAt
                          ? `Hasta ${new Date(discount.endsAt).toLocaleDateString("es-AR")}`
                          : "Sin vencimiento"}
                      </td>
                      <td>
                        <span
                          className={`inline-block rounded-md border px-2 py-0.5 text-caption-1-medium ${getStatusBadgeClass(
                            discount.status,
                          )}`}
                        >
                          {getStatusLabel(discount.status)}
                        </span>
                      </td>
                      <td className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => handleToggleActive(discount)}
                            className="cursor-pointer rounded-lg border border-border-button-default bg-background-primary-default px-2.5 py-1 text-caption-1-semibold text-text-primary transition hover:bg-background-primary-hover"
                          >
                            {discount.isActive ? "Pausar" : "Reactivar"}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(discount.id)}
                            className="cursor-pointer rounded-lg border border-border-button-default bg-background-primary-default px-2.5 py-1 text-caption-1-semibold text-text-secondary transition hover:border-red-500/40 hover:text-status-rose-text"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg space-y-5 rounded-2xl border border-border-component-detail-container bg-background-secondary-default p-6 text-text-primary shadow-xl sm:p-7">
            <div className="flex items-center justify-between border-b border-separator-border pb-4">
              <h2 className="text-title-3-semibold text-text-primary">Crear Código de Descuento</h2>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="inline-flex size-8 cursor-pointer items-center justify-center rounded-full bg-background-tertiary-default text-text-secondary hover:text-text-primary"
              >
                ✕
              </button>
            </div>

            {formError ? (
              <div className="rounded-2lg border border-red-500/30 bg-status-rose-background p-3.5 text-body-2-medium text-status-rose-text">
                {formError}
              </div>
            ) : null}

            <form onSubmit={handleCreateDiscount} className="space-y-4 text-body-regular">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="code" className="mb-1.5 block text-body-2-medium text-text-primary">
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
                  <label htmlFor="name" className="mb-1.5 block text-body-2-medium text-text-primary">
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
                <label htmlFor="desc" className="mb-1.5 block text-body-2-medium text-text-primary">
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
                  <label htmlFor="type" className="mb-1.5 block text-body-2-medium text-text-primary">
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
                  <label htmlFor="val" className="mb-1.5 block text-body-2-medium text-text-primary">
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
                  <label htmlFor="minOrder" className="mb-1.5 block text-body-2-medium text-text-primary">
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
                  <label htmlFor="maxRedemptions" className="mb-1.5 block text-body-2-medium text-text-primary">
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
                  <label htmlFor="startsAt" className="mb-1.5 block text-body-2-medium text-text-primary">
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
                  <label htmlFor="endsAt" className="mb-1.5 block text-body-2-medium text-text-primary">
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
                  className="mb-1.5 block text-body-2-medium text-text-primary"
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
                <p className="mt-1.5 text-caption-1-regular text-text-secondary">
                  Incentivá pagos en efectivo para ahorrar comisiones de cobro online
                </p>
              </div>

              <div className="flex justify-end gap-2.5 border-t border-separator-border pt-4">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="inline-flex h-9 cursor-pointer items-center justify-center rounded-2lg border border-border-button-default bg-background-primary-default px-4 text-body-medium text-text-primary transition hover:bg-background-primary-hover"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="bg-button-primary button-press-motion inline-flex h-9 cursor-pointer items-center justify-center rounded-2lg px-5 text-body-medium text-text-white shadow-xs disabled:opacity-50"
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
