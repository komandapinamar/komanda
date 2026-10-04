"use client";

import { useState } from "react";
import type { AdminDashboardOrder } from "@/types/types";

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
    return { label: "Caja Mostrador", bg: "bg-zinc-800 text-zinc-300 border-zinc-700" };
  }
  if (source === "mercadopago_webhook") {
    return { label: "Cobro Digital MP", bg: "bg-amber-950/60 text-amber-300 border-amber-800/40" };
  }
  return { label: source ?? "Mostrador", bg: "bg-zinc-800 text-zinc-400 border-zinc-700" };
}

export function ExpressOrdersLive({
  tenantId,
  initialOrders,
}: {
  tenantId: string;
  initialOrders: AdminDashboardOrder[];
}) {
  const [orders] = useState<AdminDashboardOrder[]>(initialOrders);

  const totalRevenue = orders
    .filter((o) => o.paymentStatus === "paid")
    .reduce((acc, curr) => acc + Number(curr.total || 0), 0);

  const digitalCount = orders.filter((o) => (o.source as string) === "mercadopago_webhook").length;

  return (
    <section className="space-y-6" aria-label="Transacciones de Salón y Kiosk">
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Total Facturado</p>
          <p className="mt-2 text-3xl font-black text-[var(--color-accent-tertiary)]">
            ${totalRevenue.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
          </p>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Tickets Emitidos</p>
          <p className="mt-2 text-3xl font-bold text-white">{orders.length}</p>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Cobros Digitales</p>
          <p className="mt-2 text-3xl font-bold text-emerald-400">{digitalCount}</p>
        </div>
      </div>

      <div className="rounded-xl border border-zinc-800 bg-zinc-900 overflow-hidden">
        <div className="px-6 py-4 border-b border-zinc-800 flex justify-between items-center">
          <h2 className="text-lg font-bold text-white">Transacciones Recientes</h2>
          <span className="text-xs text-zinc-400">{orders.length} comprobantes</span>
        </div>

        {orders.length === 0 ? (
          <div className="p-12 text-center text-zinc-500">
            No hay transacciones registradas en este turno.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-zinc-300">
              <thead className="bg-zinc-950 text-xs uppercase text-zinc-400 border-b border-zinc-800">
                <tr>
                  <th className="px-6 py-3">Comprobante</th>
                  <th className="px-6 py-3">Origen</th>
                  <th className="px-6 py-3">Artículos</th>
                  <th className="px-6 py-3">Total</th>
                  <th className="px-6 py-3">Pago</th>
                  <th className="px-6 py-3">Fecha y Hora</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800">
                {orders.map((order) => {
                  const badge = sourceBadge(order.source);
                  const totalUnits = order.lines.reduce((acc, l) => acc + l.quantity, 0);
                  return (
                    <tr key={order.id} className="hover:bg-zinc-800/40 transition">
                      <td className="px-6 py-4 font-bold text-white">
                        #{order.purchaseNumber ?? order.id.slice(0, 8)}
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-block border px-2.5 py-1 rounded-full text-xs font-medium ${badge.bg}`}>
                          {badge.label}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-zinc-200">{totalUnits} un.</span>
                        <span className="text-zinc-500 text-xs ml-1.5">({order.lines.length} líneas)</span>
                      </td>
                      <td className="px-6 py-4 font-bold text-[var(--color-accent-tertiary)]">
                        ${Number(order.total).toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${
                          order.paymentStatus === "paid" ? "bg-emerald-950 text-emerald-400 border border-emerald-800/50" : "bg-amber-950 text-amber-300 border border-amber-800/50"
                        }`}>
                          {order.paymentStatus === "paid" ? "Cobrado" : "Pendiente"}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-xs text-zinc-400">
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
