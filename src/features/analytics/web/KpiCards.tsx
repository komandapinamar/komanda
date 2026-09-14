import type { DashboardAnalyticsData } from "./analytics-types";

function formatSeconds(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const rem = seconds % 60;
  return `${mins}m ${rem > 0 ? `${rem}s` : ""}`;
}

function formatCurrency(amount: string | number): string {
  const num = typeof amount === "string" ? Number(amount) : amount;
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(num);
}

export default function KpiCards({ data }: { data: DashboardAnalyticsData }) {
  const { financial, dwell } = data;

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {/* Facturacion Total */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
            Facturación Total
          </span>
          <span className="rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium text-emerald-400">
            Cobrado
          </span>
        </div>
        <p className="mt-3 text-2xl font-bold tracking-tight text-zinc-100 sm:text-3xl">
          {formatCurrency(financial.totalRevenue)}
        </p>
        <p className="mt-1.5 text-xs text-zinc-400">
          Subtotal: {formatCurrency(financial.subtotal)}
          {Number(financial.totalDiscounts) > 0 && (
            <span className="text-amber-400"> (Desc: -{formatCurrency(financial.totalDiscounts)})</span>
          )}
        </p>
      </div>

      {/* Tiempo Promedio en Carta */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
            Tiempo en Carta
          </span>
          <span className="rounded-full bg-amber-500/10 px-2.5 py-0.5 text-xs font-medium text-amber-400">
            Lectura Activa
          </span>
        </div>
        <p className="mt-3 text-2xl font-bold tracking-tight text-amber-400 sm:text-3xl">
          {formatSeconds(dwell.avgDwellSeconds)}
        </p>
        <p className="mt-1.5 text-xs text-zinc-400">
          En {dwell.totalSessions.toLocaleString("es-AR")} visitas a la carta ({dwell.orderPlacedSessions} con compra)
        </p>
      </div>

      {/* Ticket Promedio */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
            Ticket Promedio
          </span>
          <span className="rounded-full bg-blue-500/10 px-2.5 py-0.5 text-xs font-medium text-blue-400">
            AOV
          </span>
        </div>
        <p className="mt-3 text-2xl font-bold tracking-tight text-zinc-100 sm:text-3xl">
          {formatCurrency(financial.avgOrderValue)}
        </p>
        <p className="mt-1.5 text-xs text-zinc-400">
          En base a {financial.paidOrdersCount} pedidos pagados
        </p>
      </div>

      {/* Conversion & Rebote */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
            Conversión & Rebote
          </span>
          <span className="rounded-full bg-purple-500/10 px-2.5 py-0.5 text-xs font-medium text-purple-400">
            Embudo
          </span>
        </div>
        <div className="mt-3 flex items-baseline gap-3">
          <p className="text-2xl font-bold text-emerald-400 sm:text-3xl">
            {dwell.conversionRate}%
          </p>
          <span className="text-xs text-zinc-500">conv. compra</span>
        </div>
        <p className="mt-1.5 text-xs text-zinc-400">
          Rebote (&lt;5s): <span className="text-zinc-300">{dwell.bounceRate}%</span> ({dwell.bounceSessions} sesiones)
        </p>
      </div>
    </div>
  );
}
