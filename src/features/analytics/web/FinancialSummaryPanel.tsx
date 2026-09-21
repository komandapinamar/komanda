import type { DashboardAnalyticsData } from "./analytics-types";

function formatCurrency(amount: string | number): string {
  const num = typeof amount === "string" ? Number(amount) : amount;
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(num);
}

function formatDate(iso: string | null): string {
  if (!iso) return "Sin fecha";
  try {
    const d = new Date(iso);
    return new Intl.DateTimeFormat("es-AR", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(d);
  } catch {
    return iso;
  }
}

export default function FinancialSummaryPanel({
  data,
}: {
  data: DashboardAnalyticsData;
}) {
  const { financial } = data;
  const mp = financial.mpWaterfall ?? {
    grossAmount: "0.00",
    feeAmount: "0.00",
    taxesAmount: "0.00",
    refundsAmount: "0.00",
    netReceivedAmount: "0.00",
    pendingReleaseAmount: "0.00",
    releasedAmount: "0.00",
    effectiveDeductionRate: "0.00%",
    isFeeInclusiveOfTax: false,
    releaseSchedule: [],
  };

  const cash = financial.cashLedger ?? {
    depositsAmount: "0.00",
    withdrawalsAmount: "0.00",
    netCashAmount: "0.00",
    movementsCount: 0,
    recentMovements: [],
  };

  const netCollections = financial.netCollections ?? "0.00";

  return (
    <div className="font-[family-name:var(--font-instrument-sans)] rounded-xl border border-zinc-800 bg-zinc-900/70 p-5 shadow-sm space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-base font-semibold text-zinc-100">
            Liquidación Mercado Pago & Caja en Efectivo
          </h2>
          <p className="text-xs text-zinc-400">
            Cascada de cobros con deducciones reales y libro de movimientos en mostrador
          </p>
        </div>
        <div className="flex items-center gap-2">
          {mp.isFeeInclusiveOfTax && (
            <span className="rounded-full bg-(--color-accent-tertiary)/10 px-2.5 py-1 text-[11px] font-medium text-(--color-accent-tertiary)">
              Comisión con impuestos incluidos
            </span>
          )}
        </div>
      </div>

      {/* KPI Hero row: Total Plata que te queda (M-53) */}
      <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
            Monto neto luego de comisiones e impuestos.
          </span>
          <p className="text-2xl font-bold tracking-tight text-emerald-400 sm:text-3xl mt-1">
            {formatCurrency(netCollections)}
          </p>
          <p className="text-xs text-zinc-500 mt-0.5">
            Total neto cobrado en el período (Mercado Pago disponible + efectivo de pedidos)
          </p>
        </div>
        {Number(mp.pendingReleaseAmount) > 0 && (
          <div className="rounded-md border border-(--color-accent-tertiary)/20 bg-(--color-accent-tertiary)/5 px-3 py-2 text-right">
            <span className="text-[11px] font-semibold text-(--color-accent-tertiary) uppercase tracking-wider block">
              Plata por liberar
            </span>
            <span className="text-base font-bold text-amber-300">
              {formatCurrency(mp.pendingReleaseAmount)}
            </span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Waterfall Chart Mercado Pago */}
        <div className="rounded-lg border border-zinc-800/80 bg-zinc-950/40 p-4 space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-zinc-200">
              Cascada de Cobros Mercado Pago
            </p>
            <span className="text-[11px] font-medium text-zinc-400">
              Deducción efectiva: {mp.effectiveDeductionRate}
            </span>
          </div>

          <div className="space-y-2.5 text-xs">
            {/* 1. Total cobrado por Mercado Pago */}
            <div className="flex items-center justify-between text-zinc-300 py-1 border-b border-zinc-800/60">
              <span className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-emerald-400" />
                Total cobrado por Mercado Pago
              </span>
              <span className="font-semibold text-zinc-100">
                {formatCurrency(mp.grossAmount)}
              </span>
            </div>

            {/* 2. Comisiones de Mercado Pago */}
            <div className="flex items-center justify-between text-zinc-400 py-1 border-b border-zinc-800/60">
              <span className="flex items-center gap-2 pl-3">
                <span className="h-1.5 w-1.5 rounded-full bg-(--color-accent-tertiary)" />
                Comisiones de Mercado Pago
              </span>
              <span className="font-medium text-(--color-accent-tertiary)">
                -{formatCurrency(mp.feeAmount)}
              </span>
            </div>

            {/* 3. Impuestos y retenciones */}
            <div className="flex items-center justify-between text-zinc-400 py-1 border-b border-zinc-800/60">
              <span className="flex items-center gap-2 pl-3">
                <span className="h-1.5 w-1.5 rounded-full bg-(--color-accent-tertiary)" />
                Impuestos y retenciones
              </span>
              <span className="font-medium text-(--color-accent-tertiary)">
                -{formatCurrency(mp.taxesAmount)}
              </span>
            </div>

            {/* 4. Devoluciones */}
            <div className="flex items-center justify-between text-zinc-400 py-1 border-b border-zinc-800/60">
              <span className="flex items-center gap-2 pl-3">
                <span className="h-1.5 w-1.5 rounded-full bg-red-400" />
                Devoluciones
              </span>
              <span className="font-medium text-red-400">
                -{formatCurrency(mp.refundsAmount)}
              </span>
            </div>

            {/* 5. Plata que te queda disponible */}
            <div className="flex items-center justify-between text-zinc-200 pt-2 font-bold bg-zinc-900/50 p-2 rounded">
              <span className="flex items-center gap-2 text-emerald-300">
                Plata que te queda disponible
              </span>
              <span className="text-emerald-400 text-sm">
                {formatCurrency(mp.netReceivedAmount)}
              </span>
            </div>
          </div>

          {/* Release Schedule preview if available */}
          {mp.releaseSchedule && mp.releaseSchedule.length > 0 && (
            <div className="pt-2 border-t border-zinc-800 text-[11px] text-zinc-400 space-y-1">
              <span className="font-semibold text-zinc-300 block">
                Próximas liberaciones previstas:
              </span>
              {mp.releaseSchedule.slice(0, 3).map((item) => (
                <div key={item.mpPaymentId} className="flex justify-between text-zinc-400">
                  <span>{formatDate(item.expectedAt)}</span>
                  <span className="font-medium text-zinc-200">
                    {formatCurrency(item.amount)}
                  </span>
                </div>
              ))}
            </div>
          )}

          <p className="text-[11px] text-zinc-500 pt-1">
            En este cálculo no están incluidos los sueldos ni los costos de la mercadería.
          </p>
        </div>

        {/* Cash Register Movements Ledger (M-54) */}
        <div className="rounded-lg border border-zinc-800/80 bg-zinc-950/40 p-4 space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-zinc-200">
              Libro de Movimientos de Caja (Efectivo)
            </p>
            <span className="text-[11px] font-medium text-zinc-400">
              {cash.movementsCount} movimientos
            </span>
          </div>

          <div className="space-y-2.5 text-xs">
            <div className="flex items-center justify-between text-zinc-300 py-1 border-b border-zinc-800/60">
              <span className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-emerald-400" />
                Ingresos por ventas en mostrador
              </span>
              <span className="font-semibold text-zinc-100">
                +{formatCurrency(cash.depositsAmount)}
              </span>
            </div>

            <div className="flex items-center justify-between text-zinc-400 py-1 border-b border-zinc-800/60">
              <span className="flex items-center gap-2 pl-3">
                <span className="h-1.5 w-1.5 rounded-full bg-red-400" />
                Retiros por cancelaciones
              </span>
              <span className="font-medium text-red-400">
                -{formatCurrency(cash.withdrawalsAmount)}
              </span>
            </div>

            <div className="flex items-center justify-between text-zinc-200 pt-2 font-bold bg-zinc-900/50 p-2 rounded">
              <span className="flex items-center gap-2 text-zinc-200">
                Movimiento neto de efectivo
              </span>
              <span className="text-zinc-100 text-sm">
                {formatCurrency(cash.netCashAmount)}
              </span>
            </div>
          </div>

          {/* Recent movements list */}
          {cash.recentMovements && cash.recentMovements.length > 0 ? (
            <div className="pt-2 border-t border-zinc-800 text-[11px] text-zinc-400 space-y-1">
              <span className="font-semibold text-zinc-300 block">
                Últimos movimientos de caja:
              </span>
              {cash.recentMovements.slice(0, 3).map((m) => (
                <div key={m.id} className="flex justify-between items-center text-zinc-400">
                  <span className="truncate max-w-[180px]">
                    {m.type === "sale_deposit"
                      ? "Ingreso por venta"
                      : "Retiro por cancelación"}
                  </span>
                  <span
                    className={`font-medium ${
                      m.type === "sale_deposit" ? "text-emerald-400" : "text-red-400"
                    }`}
                  >
                    {m.type === "sale_deposit" ? "+" : "-"}
                    {formatCurrency(m.amount)}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-[11px] text-zinc-500 pt-1">
              Sin movimientos de caja registrados en el período.
            </p>
          )}

          <p className="text-[11px] text-zinc-500 pt-1">
            M-54 refleja exclusivamente entradas y salidas de pedidos manuales. No incluye arqueo externo.
          </p>
        </div>
      </div>
    </div>
  );
}
