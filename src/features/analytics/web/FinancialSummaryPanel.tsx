import type { DashboardAnalyticsData } from "./analytics-types";

function formatCurrency(amount: string | number): string {
  const num = typeof amount === "string" ? Number(amount) : amount;
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(num);
}

export default function FinancialSummaryPanel({
  data,
}: {
  data: DashboardAnalyticsData;
}) {
  const { financial } = data;
  const total = Number(financial.totalRevenue);
  const netEstimated = total > 0 ? total / 1.21 : 0;
  const vatEstimated = total > 0 ? total - netEstimated : 0;

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-zinc-100">
            Resumen Fiscal & Canales de Cobro
          </h2>
          <p className="text-xs text-zinc-400">
            Estructura impositiva y distribución por método de cobro
          </p>
        </div>
        <span className="rounded-full bg-emerald-500/10 px-2.5 py-1 text-[11px] font-medium text-emerald-400">
          ARCA Ready
        </span>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        {/* Desglose Impositivo Estimado */}
        <div className="rounded-lg border border-zinc-800/80 bg-zinc-950/40 p-4 space-y-3">
          <p className="text-xs font-semibold text-zinc-300">
            Estructura de Facturación
          </p>
          <div className="space-y-2 text-xs">
            <div className="flex justify-between text-zinc-400">
              <span>Total Bruto Facturado:</span>
              <span className="font-medium text-zinc-200">
                {formatCurrency(financial.totalRevenue)}
              </span>
            </div>
            <div className="flex justify-between text-zinc-400">
              <span>Neto Gravado Estimado:</span>
              <span className="font-medium text-zinc-200">
                {formatCurrency(netEstimated)}
              </span>
            </div>
            <div className="flex justify-between text-zinc-400">
              <span>IVA Estimado (21%):</span>
              <span className="font-medium text-zinc-200">
                {formatCurrency(vatEstimated)}
              </span>
            </div>
            <div className="flex justify-between text-zinc-400">
              <span>Descuentos Aplicados:</span>
              <span className="font-medium text-amber-400">
                -{formatCurrency(financial.totalDiscounts)}
              </span>
            </div>
          </div>
        </div>

        {/* Desglose por Origen / Canal */}
        <div className="rounded-lg border border-zinc-800/80 bg-zinc-950/40 p-4 space-y-3">
          <p className="text-xs font-semibold text-zinc-300">
            Canales de Ingreso
          </p>
          {financial.revenueBySource.length === 0 ? (
            <p className="text-xs text-zinc-500">Sin órdenes cobradas.</p>
          ) : (
            <div className="space-y-2 text-xs">
              {financial.revenueBySource.map((s) => {
                const label =
                  s.source === "mercadopago_webhook"
                    ? "Mercado Pago (Online)"
                    : s.source === "admin_direct"
                    ? "Caja / Mostrador (Directo)"
                    : s.source;

                return (
                  <div key={s.source} className="flex justify-between items-center text-zinc-400">
                    <span className="flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-emerald-400" />
                      {label} ({s.orders} ped.)
                    </span>
                    <span className="font-bold text-zinc-200">
                      {formatCurrency(s.revenue)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
