import type { DashboardAnalyticsData } from "../analytics-types";

function formatCurrency(amount: string | number): string {
  const num = typeof amount === "string" ? Number(amount) : amount;
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(num);
}

export default function ExpressRetailPanel({ data }: { data: DashboardAnalyticsData }) {
  const { currentCashShift, tenderBreakdown, financial } = data;

  const cashTender = tenderBreakdown?.find((t) => t.tender === "cash");
  const posnetTender = tenderBreakdown?.find((t) => t.tender === "posnet");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
        <div>
          <h2 className="text-lg font-bold text-zinc-100 flex items-center gap-2">
            <span>Komanda Kiosk</span>
            <span className="rounded-full border border-[var(--color-accent-tertiary)]/20 bg-[var(--color-accent-tertiary)]/10 px-2.5 py-0.5 text-xs font-semibold text-[var(--color-accent-tertiary)]">
              Autoservicio & Caja
            </span>
          </h2>
          <p className="text-xs text-zinc-400">
            Control de caja física y recaudación por medio de pago en el local.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {/* Card 1: Total en Caja Fisica */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
              Total en Caja Hoy
            </span>
            <span
              className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                currentCashShift ? "bg-emerald-500/10 text-emerald-400" : "bg-zinc-800 text-zinc-400"
              }`}
            >
              {currentCashShift ? "Turno Abierto" : "Caja Cerrada"}
            </span>
          </div>

          <p className="mt-3 text-2xl font-bold tracking-tight text-[var(--color-accent-tertiary)] sm:text-3xl">
            {currentCashShift
              ? formatCurrency(currentCashShift.expectedCash)
              : formatCurrency(financial.cashLedger?.netCashAmount ?? "0.00")}
          </p>

          <div className="mt-2 text-xs text-zinc-400 space-y-0.5">
            {currentCashShift ? (
              <>
                <p>Apertura: {formatCurrency(currentCashShift.openingBalance)}</p>
                <p>Cobros en efectivo: {formatCurrency(currentCashShift.currentCashSales)}</p>
              </>
            ) : (
              <p>Iniciá turno desde Komanda Kiosk para registrar arqueo.</p>
            )}
          </div>
        </div>

        {/* Card 2: Efectivo en Mostrador */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
              Cobros en Efectivo
            </span>
            <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-xs text-zinc-400">
              {cashTender?.ordersCount ?? 0} pedidos
            </span>
          </div>

          <p className="mt-3 text-2xl font-bold tracking-tight text-zinc-100 sm:text-3xl">
            {formatCurrency(cashTender?.revenue ?? "0.00")}
          </p>

          <p className="mt-2 text-xs text-zinc-400">
            Recaudado en caja física durante el período seleccionado.
          </p>
        </div>

        {/* Card 3: Cobros Digitales / Tarjetas */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
              Tarjetas / Digital
            </span>
            <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-xs text-zinc-400">
              {posnetTender?.ordersCount ?? 0} pedidos
            </span>
          </div>

          <p className="mt-3 text-2xl font-bold tracking-tight text-zinc-100 sm:text-3xl">
            {formatCurrency(posnetTender?.revenue ?? "0.00")}
          </p>

          <p className="mt-2 text-xs text-zinc-400">
            Cobros automáticos procesados vía terminal electrónica.
          </p>
        </div>
      </div>
    </div>
  );
}
