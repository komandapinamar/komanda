"use client";

import type { DashboardAnalyticsData } from "../analytics-types";

function formatCurrency(amount: string | number): string {
  const num = typeof amount === "string" ? Number(amount) : amount;
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(num);
}

export default function CustomerPromotionsPanel({
  data,
}: {
  data: DashboardAnalyticsData;
}) {
  const recurrence = data.customerRecurrence;
  const promotions = data.promotions;

  return (
    <div className="font-[family-name:var(--font-instrument-sans)] liquid-glass-card rounded-3xl p-6 sm:p-7 space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-2 border-b border-white/[0.08] pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-medium tracking-tight text-[#f4f3f1]">
            Clientes y Promociones
          </h2>
          <p className="mt-0.5 text-xs text-[#c2c2cc]">
            Retención de comensales, frecuencia de pedidos y análisis descriptivo de descuentos
          </p>
        </div>

        {recurrence && recurrence.identityCoverageRate > 0 && (
          <span className="self-start sm:self-auto rounded-full border border-white/12 bg-white/[0.04] px-3 py-1 text-[11px] font-medium text-[#c2c2cc]">
            Cobertura de comensales:{" "}
            <strong className="text-[#f4f3f1]">{recurrence.identityCoverageRate}%</strong>
          </span>
        )}
      </div>

      {/* Recurrence KPI Cards Grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Repeat Rate Card */}
        <div className="rounded-2xl border border-white/12 bg-[#101013]/90 p-5">
          <span className="text-[11px] font-medium text-[#c2c2cc] uppercase tracking-wider">
            Tasa de Recompra
          </span>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-medium text-[#f4f3f1] tabular-nums">
              {recurrence ? `${recurrence.repeatRate}%` : "--"}
            </span>
          </div>
          <div className="mt-1 flex flex-col gap-0.5 text-xs text-[#c2c2cc]">
            <span>
              {recurrence
                ? `${recurrence.recurrentCustomers} de ${recurrence.totalCustomers} clientes identificados`
                : "Sin datos del período"}
            </span>
            <span className="text-[11px] text-[#9b9ba4]">
              Comensales con compras previas registradas
            </span>
          </div>
        </div>

        {/* Days Between Orders Card */}
        <div className="rounded-2xl border border-white/12 bg-[#101013]/90 p-5">
          <span className="text-[11px] font-medium text-[#c2c2cc] uppercase tracking-wider">
            Tiempo Entre Compras
          </span>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-medium text-[#f4f3f1] tabular-nums">
              {recurrence ? recurrence.medianDaysDisplay : "--"}
            </span>
          </div>
          <div className="mt-1 flex flex-col gap-0.5 text-xs text-[#c2c2cc]">
            <span>Mediana de intervalo observada</span>
            <span className="text-[11px] text-[#9b9ba4]">
              {recurrence?.medianDaysBetweenOrders !== null
                ? "Días transcurridos entre pedidos consecutivos"
                : "Solo comensales con 2 o más pedidos"}
            </span>
          </div>
        </div>

        {/* Order Frequency Card */}
        <div className="rounded-2xl border border-white/12 bg-[#101013]/90 p-5">
          <span className="text-[11px] font-medium text-[#c2c2cc] uppercase tracking-wider">
            Frecuencia de Pedidos
          </span>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-medium text-[#f4f3f1] tabular-nums">
              {recurrence ? recurrence.orderFrequency : "--"}
            </span>
            <span className="text-xs text-[#9b9ba4] font-medium">pedidos/cliente</span>
          </div>
          <div className="mt-1 flex flex-col gap-0.5 text-xs text-[#c2c2cc]">
            <span>
              {recurrence
                ? `${recurrence.identifiedOrdersCount} pedidos de clientes identificados`
                : "Sin datos"}
            </span>
            <span className="text-[11px] text-[#9b9ba4]">
              Promedio de compras en el período
            </span>
          </div>
        </div>

        {/* Identity Coverage Card */}
        <div className="rounded-2xl border border-white/12 bg-[#101013]/90 p-5">
          <span className="text-[11px] font-medium text-[#c2c2cc] uppercase tracking-wider">
            Cobertura de Identidad
          </span>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-medium text-[#f4f3f1] tabular-nums">
              {recurrence ? `${recurrence.identityCoverageRate}%` : "--"}
            </span>
          </div>
          <div className="mt-1 flex flex-col gap-0.5 text-xs text-[#c2c2cc]">
            <span>
              {recurrence
                ? `${recurrence.identifiedOrdersCount} de ${recurrence.totalOrdersCount} pedidos con email/teléfono`
                : "Sin datos"}
            </span>
            <span className="text-[11px] text-[#9b9ba4]">
              {recurrence ? `${recurrence.unidentifiedOrdersCount} pedidos sin identificar` : ""}
            </span>
          </div>
        </div>
      </div>

      {/* Customer Segments Table */}
      <div className="space-y-3">
        <h3 className="text-xs font-medium uppercase tracking-widest text-[#c2c2cc]">
          Desempeño y Ticket por Segmento de Comensal
        </h3>

        <div className="overflow-x-auto rounded-2xl border border-white/12 bg-[#101013]/90">
          <table className="w-full text-left text-xs text-[#d4d4dc]">
            <thead className="border-b border-white/[0.08] bg-white/[0.03] text-[11px] uppercase tracking-wider text-[#c2c2cc]">
              <tr>
                <th className="px-4 py-3 font-medium">Segmento</th>
                <th className="px-4 py-3 text-right font-medium">Comensales</th>
                <th className="px-4 py-3 text-right font-medium">Pedidos</th>
                <th className="px-4 py-3 text-right font-medium">Facturación</th>
                <th className="px-4 py-3 text-right font-medium">Ticket Promedio</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.08] font-mono text-[11px]">
              {/* Recurrent Customers */}
              <tr className="hover:bg-white/[0.03] transition-colors">
                <td className="px-4 py-3 font-sans font-medium text-[#f4f3f1]">
                  <span className="inline-block w-2 h-2 rounded-full bg-emerald-400 mr-2" />
                  Comensales Recurrentes
                </td>
                <td className="px-4 py-3 text-right">
                  {recurrence?.segments?.recurrent?.customerCount ?? 0}
                </td>
                <td className="px-4 py-3 text-right">
                  {recurrence?.segments?.recurrent?.orderCount ?? 0}
                </td>
                <td className="px-4 py-3 text-right text-[#f4f3f1]">
                  {formatCurrency(recurrence?.segments?.recurrent?.totalRevenue ?? "0.00")}
                </td>
                <td className="px-4 py-3 text-right font-medium text-emerald-400">
                  {formatCurrency(recurrence?.segments?.recurrent?.avgTicket ?? "0.00")}
                </td>
              </tr>

              {/* First-time Customers */}
              <tr className="hover:bg-white/[0.03] transition-colors">
                <td className="px-4 py-3 font-sans font-medium text-[#f4f3f1]">
                  <span className="inline-block w-2 h-2 rounded-full bg-sky-400 mr-2" />
                  Nuevos Comensales
                </td>
                <td className="px-4 py-3 text-right">
                  {recurrence?.segments?.firstTime?.customerCount ?? 0}
                </td>
                <td className="px-4 py-3 text-right">
                  {recurrence?.segments?.firstTime?.orderCount ?? 0}
                </td>
                <td className="px-4 py-3 text-right text-[#f4f3f1]">
                  {formatCurrency(recurrence?.segments?.firstTime?.totalRevenue ?? "0.00")}
                </td>
                <td className="px-4 py-3 text-right font-medium text-sky-400">
                  {formatCurrency(recurrence?.segments?.firstTime?.avgTicket ?? "0.00")}
                </td>
              </tr>

              {/* Unidentified Orders */}
              <tr className="hover:bg-white/[0.03] transition-colors">
                <td className="px-4 py-3 font-sans font-medium text-[#c2c2cc]">
                  <span className="inline-block w-2 h-2 rounded-full bg-[#9b9ba4] mr-2" />
                  Sin Identificar (Mostrador / Anónimos)
                </td>
                <td className="px-4 py-3 text-right text-[#9b9ba4]">
                  --
                </td>
                <td className="px-4 py-3 text-right">
                  {recurrence?.segments.unidentified.orderCount ?? 0}
                </td>
                <td className="px-4 py-3 text-right text-[#f4f3f1]">
                  {formatCurrency(recurrence?.segments.unidentified.totalRevenue ?? "0.00")}
                </td>
                <td className="px-4 py-3 text-right font-medium text-[#c2c2cc]">
                  {formatCurrency(recurrence?.segments.unidentified.avgTicket ?? "0.00")}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Promotions & Discounts Performance */}
      <div className="space-y-3 pt-2 border-t border-white/[0.08]">
        <div>
          <h3 className="text-xs font-medium uppercase tracking-widest text-[#c2c2cc]">
            Promociones y Descuentos Aplicados
          </h3>
          <p className="text-xs text-[#9b9ba4]">
            Comparativa descriptiva entre pedidos con beneficio y a tarifa regular
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {/* Discount Adoption Card */}
          <div className="rounded-2xl border border-white/12 bg-[#101013]/90 p-5">
            <span className="text-[11px] font-medium text-[#c2c2cc] uppercase tracking-wider">
              Uso de Descuentos
            </span>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-medium text-[#f4f3f1] tabular-nums">
                {promotions ? `${promotions.discountAdoptionRate}%` : "--"}
              </span>
            </div>
            <div className="mt-1 flex flex-col gap-0.5 text-xs text-[#c2c2cc]">
              <span>
                {promotions
                  ? `${promotions.discountedOrdersCount} de ${promotions.totalOrdersCount} pedidos`
                  : "Sin datos"}
              </span>
              <span className="text-[11px] text-[#9b9ba4]">
                Pedidos con algún beneficio o rebaja
              </span>
            </div>
          </div>

          {/* Total Discounts Applied Card */}
          <div className="rounded-2xl border border-white/12 bg-[#101013]/90 p-5">
            <span className="text-[11px] font-medium text-[#c2c2cc] uppercase tracking-wider">
              Total Descuentos Otorgados
            </span>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-medium text-[#f4f3f1] tabular-nums">
                {promotions ? formatCurrency(promotions.totalDiscountsApplied) : "--"}
              </span>
            </div>
            <div className="mt-1 flex flex-col gap-0.5 text-xs text-[#c2c2cc]">
              <span>
                {promotions
                  ? `Venta con descuento: ${formatCurrency(promotions.discountedRevenue)}`
                  : "Sin datos"}
              </span>
              <span className="text-[11px] text-[#9b9ba4]">
                Monto total absorbido en promociones
              </span>
            </div>
          </div>

          {/* Ticket Comparison Card */}
          <div className="rounded-2xl border border-white/12 bg-[#101013]/90 p-5">
            <span className="text-[11px] font-medium text-[#c2c2cc] uppercase tracking-wider">
              Ticket: Con Promo vs Regular
            </span>
            <div className="mt-2 flex items-baseline gap-2 tabular-nums">
              <span className="text-lg font-medium text-[#f4f3f1]">
                {promotions?.ticketComparison ? formatCurrency(promotions.ticketComparison.discountedAvgTicket) : "--"}
              </span>
              <span className="text-xs text-[#c2c2cc]">
                vs {promotions?.ticketComparison ? formatCurrency(promotions.ticketComparison.fullPriceAvgTicket) : "--"}
              </span>
            </div>
            <div className="mt-1 flex flex-col gap-0.5 text-xs text-[#c2c2cc]">
              <span className={promotions?.ticketComparison && Number(promotions.ticketComparison.differenceAmount) >= 0 ? "text-emerald-400 font-medium" : "text-amber-300 font-medium"}>
                {promotions?.ticketComparison
                  ? `${Number(promotions.ticketComparison.differenceAmount) >= 0 ? "+" : ""}${formatCurrency(promotions.ticketComparison.differenceAmount)} (${promotions.ticketComparison.differencePercent > 0 ? "+" : ""}${promotions.ticketComparison.differencePercent}%)`
                  : "Sin datos"}
              </span>
              <span className="text-[11px] text-[#9b9ba4]">
                Diferencia observada en ticket promedio
              </span>
            </div>
          </div>
        </div>

        {/* Descriptive observation note without speculative claims */}
        <p className="text-xs text-[#9b9ba4]">
          Nota: Los indicadores promocionales reflejan diferencias descriptivas observadas en ticket y volumen, sin efectuar inferencias predictivas o de retorno causal.
        </p>
      </div>
    </div>
  );
}
