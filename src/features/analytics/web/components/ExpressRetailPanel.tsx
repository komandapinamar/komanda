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
    <div className="liquid-glass-card rounded-3xl p-6 sm:p-7 space-y-6">
      <div className="flex items-center justify-between border-b border-white/[0.08] pb-4">
        <div>
          <h2 className="text-xl font-medium tracking-tight text-[#f4f3f1] flex items-center gap-2.5">
            <span className="komanda-logo font-sans font-normal tracking-tighter text-white normal-case">Komanda Kiosk</span>
            <span className="rounded-full border border-white/15 bg-white/[0.06] px-3 py-0.5 text-xs font-medium text-[#f4f3f1]">
              Autoservicio & Caja
            </span>
          </h2>
          <p className="mt-0.5 text-xs text-[#c2c2cc]">
            Control de caja física y recaudación por medio de pago en el local.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {/* Card 1: Total en Caja Fisica */}
        <div className="rounded-2xl border border-white/12 bg-[#101013]/90 p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium uppercase tracking-widest text-[#c2c2cc]">
              Total en Caja Hoy
            </span>
            <span
              className={`rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${
                currentCashShift
                  ? "border-emerald-400/30 bg-emerald-500/15 text-emerald-300"
                  : "border-white/12 bg-white/[0.04] text-[#c2c2cc]"
              }`}
            >
              {currentCashShift ? "Turno Abierto" : "Caja Cerrada"}
            </span>
          </div>

          <p className="mt-3 text-2xl font-medium tracking-tight text-[#f4f3f1] tabular-nums sm:text-3xl">
            {currentCashShift
              ? formatCurrency(currentCashShift.expectedCash)
              : formatCurrency(financial.cashLedger?.netCashAmount ?? "0.00")}
          </p>

          <div className="mt-2 text-xs text-[#c2c2cc] space-y-0.5">
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
        <div className="rounded-2xl border border-white/12 bg-[#101013]/90 p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium uppercase tracking-widest text-[#c2c2cc]">
              Cobros en Efectivo
            </span>
            <span className="rounded-full border border-white/12 bg-white/[0.04] px-2.5 py-0.5 text-[11px] text-[#c2c2cc]">
              {cashTender?.ordersCount ?? 0} pedidos
            </span>
          </div>

          <p className="mt-3 text-2xl font-medium tracking-tight text-[#f4f3f1] tabular-nums sm:text-3xl">
            {formatCurrency(cashTender?.revenue ?? "0.00")}
          </p>

          <p className="mt-2 text-xs text-[#c2c2cc]">
            Recaudado en caja física durante el período seleccionado.
          </p>
        </div>

        {/* Card 3: Cobros Digitales / Tarjetas */}
        <div className="rounded-2xl border border-white/12 bg-[#101013]/90 p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium uppercase tracking-widest text-[#c2c2cc]">
              Tarjetas / Digital
            </span>
            <span className="rounded-full border border-white/12 bg-white/[0.04] px-2.5 py-0.5 text-[11px] text-[#c2c2cc]">
              {posnetTender?.ordersCount ?? 0} pedidos
            </span>
          </div>

          <p className="mt-3 text-2xl font-medium tracking-tight text-[#f4f3f1] tabular-nums sm:text-3xl">
            {formatCurrency(posnetTender?.revenue ?? "0.00")}
          </p>

          <p className="mt-2 text-xs text-[#c2c2cc]">
            Cobros automáticos procesados vía terminal electrónica.
          </p>
        </div>
      </div>
    </div>
  );
}
