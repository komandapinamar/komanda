"use client";

import { useState } from "react";
import type { AdminDashboardOrder } from "@/types/types";
import AdminOrdersLive from "./AdminOrdersLive";

const dateFormatter = new Intl.DateTimeFormat("es-AR", {
  dateStyle: "short",
  timeStyle: "short",
});

function formatDate(value: string | null) {
  if (!value) return "-";
  return dateFormatter.format(new Date(value));
}

function sourceBadge(source: string | null) {
  if (source === "admin_direct") {
    return { label: "Caja Mostrador", bg: "border-white/12 bg-white/[0.04] text-[#d4d4dc]" };
  }
  if (source === "mercadopago_webhook") {
    return { label: "Cobro Digital MP", bg: "border-amber-400/30 bg-amber-500/15 text-amber-300" };
  }
  return { label: source ?? "Mostrador", bg: "border-white/12 bg-white/[0.04] text-[#c2c2cc]" };
}

export function ExpressOrdersLive({
  tenantId,
  initialOrders,
}: {
  tenantId: string;
  initialOrders: AdminDashboardOrder[];
}) {
  const [orders, setOrders] = useState<AdminDashboardOrder[]>(initialOrders);

  const totalRevenue = orders
    .filter((o) => o.paymentStatus === "paid")
    .reduce((acc, curr) => acc + Number(curr.total || 0), 0);

  const digitalCount = orders.filter((o) => (o.source as string) === "mercadopago_webhook").length;

  return (
    <section className="space-y-6" aria-label="Transacciones de Salón y Kiosk">
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="liquid-glass-card rounded-3xl p-6">
          <p className="text-xs font-medium uppercase tracking-widest text-[#c2c2cc]">Total Facturado</p>
          <p className="mt-2.5 text-3xl font-medium tracking-tight text-[#f4f3f1] tabular-nums">
            ${totalRevenue.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
          </p>
        </div>
        <div className="liquid-glass-card rounded-3xl p-6">
          <p className="text-xs font-medium uppercase tracking-widest text-[#c2c2cc]">Tickets Emitidos</p>
          <p className="mt-2.5 text-3xl font-medium tracking-tight text-[#f4f3f1] tabular-nums">{orders.length}</p>
        </div>
        <div className="liquid-glass-card rounded-3xl p-6">
          <p className="text-xs font-medium uppercase tracking-widest text-[#c2c2cc]">Cobros Digitales</p>
          <p className="mt-2.5 text-3xl font-medium tracking-tight text-emerald-400 tabular-nums">{digitalCount}</p>
        </div>
      </div>

      <AdminOrdersLive tenantId={tenantId} initialOrders={initialOrders} onOrdersChange={setOrders} />

      <div className="liquid-glass-card rounded-3xl p-6 sm:p-7 space-y-5">
        <div className="flex items-center justify-between border-b border-white/[0.08] pb-4">
          <h2 className="text-xl font-medium tracking-tight text-[#f4f3f1]">Transacciones Recientes</h2>
          <span className="text-xs text-[#c2c2cc] tabular-nums">{orders.length} comprobantes</span>
        </div>

        {orders.length === 0 ? (
          <div className="rounded-2xl border border-white/12 bg-[#101013]/90 p-10 text-center text-sm text-[#c2c2cc]">
            No hay transacciones registradas en este turno.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-white/12 bg-[#101013]/90">
            <table className="w-full text-left text-xs text-[#d4d4dc]">
              <thead className="border-b border-white/[0.08] bg-white/[0.03] text-[11px] uppercase tracking-wider text-[#c2c2cc]">
                <tr>
                  <th className="px-5 py-3.5 font-medium">Comprobante</th>
                  <th className="px-5 py-3.5 font-medium">Origen</th>
                  <th className="px-5 py-3.5 font-medium">Artículos</th>
                  <th className="px-5 py-3.5 font-medium">Total</th>
                  <th className="px-5 py-3.5 font-medium">Pago</th>
                  <th className="px-5 py-3.5 font-medium">Fecha y Hora</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.08]">
                {orders.map((order) => {
                  const badge = sourceBadge(order.source);
                  const totalUnits = order.lines.reduce((acc, l) => acc + l.quantity, 0);
                  return (
                    <tr key={order.id} className="transition hover:bg-white/[0.03]">
                      <td className="px-5 py-3.5 font-medium text-[#f4f3f1]">
                        #{order.purchaseNumber ?? order.id.slice(0, 8)}
                      </td>
                      <td className="px-5 py-3.5">
                        <span className={`inline-block rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${badge.bg}`}>
                          {badge.label}
                        </span>
                      </td>
                      <td className="px-5 py-3.5">
                        <span className="text-[#f4f3f1]">{totalUnits} un.</span>
                        <span className="ml-1.5 text-xs text-[#c2c2cc]">({order.lines.length} líneas)</span>
                      </td>
                      <td className="px-5 py-3.5 font-medium text-[#f4f3f1] tabular-nums">
                        ${Number(order.total).toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-5 py-3.5">
                        <span className={`inline-block rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${
                          order.paymentStatus === "paid"
                            ? "border-emerald-400/30 bg-emerald-500/15 text-emerald-300"
                            : "border-amber-400/30 bg-amber-500/15 text-amber-300"
                        }`}>
                          {order.paymentStatus === "paid" ? "Cobrado" : "Pendiente"}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-xs text-[#c2c2cc]">
                        {formatDate(order.createdAt)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
