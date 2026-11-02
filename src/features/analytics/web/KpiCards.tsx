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
      <div className="liquid-glass-card rounded-3xl p-5 sm:p-6">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium uppercase tracking-widest text-[#c2c2cc]">
            Facturación Total
          </span>
        </div>
        <p className="mt-3 text-2xl font-medium tracking-tight text-[#f4f3f1] tabular-nums sm:text-3xl">
          {formatCurrency(financial.totalRevenue)}
        </p>
        <p className="mt-1.5 text-xs text-[#c2c2cc]">
          Subtotal: {formatCurrency(financial.subtotal)}
          {Number(financial.totalDiscounts) > 0 && (
            <span className="text-emerald-400"> (Desc: -{formatCurrency(financial.totalDiscounts)})</span>
          )}
        </p>
      </div>

      {/* Tiempo Promedio en Carta */}
      <div className="liquid-glass-card rounded-3xl p-5 sm:p-6">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium uppercase tracking-widest text-[#c2c2cc]">
            Tiempo en Carta
          </span>
        </div>
        <p className="mt-3 text-2xl font-medium tracking-tight text-[#f4f3f1] tabular-nums sm:text-3xl">
          {formatSeconds(dwell.avgDwellSeconds)}
        </p>
        <p className="mt-1.5 text-xs text-[#c2c2cc]">
          En {dwell.totalSessions.toLocaleString("es-AR")} visitas a la carta ({dwell.orderPlacedSessions} con compra)
        </p>
      </div>

      {/* Ticket Promedio */}
      <div className="liquid-glass-card rounded-3xl p-5 sm:p-6">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium uppercase tracking-widest text-[#c2c2cc]">
            Ticket Promedio
          </span>
        </div>
        <p className="mt-3 text-2xl font-medium tracking-tight text-[#f4f3f1] tabular-nums sm:text-3xl">
          {formatCurrency(financial.avgOrderValue)}
        </p>
        <p className="mt-1.5 text-xs text-[#c2c2cc]">
          En base a {financial.paidOrdersCount} pedidos pagados
        </p>
      </div>

      {/* Conversion & Rebote */}
      <div className="liquid-glass-card rounded-3xl p-5 sm:p-6">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium uppercase tracking-widest text-[#c2c2cc]">
            Conversión & Rebote
          </span>
        </div>
        <div className="mt-3 flex items-baseline gap-3">
          <p className="text-2xl font-medium tracking-tight text-emerald-400 tabular-nums sm:text-3xl">
            {dwell.conversionRate}%
          </p>
          <span className="text-xs text-[#9b9ba4]">conv. compra</span>
        </div>
        <p className="mt-1.5 text-xs text-[#c2c2cc]">
          Rebote (&lt;5s): <span className="text-[#f4f3f1]">{dwell.bounceRate}%</span> ({dwell.bounceSessions} sesiones)
        </p>
      </div>
    </div>
  );
}
