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
    <div className="font-[family-name:var(--font-instrument-sans)] rounded-xl border border-zinc-800 bg-zinc-900/70 p-5 shadow-sm space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-base font-semibold text-zinc-100">
            Clientes y Promociones
          </h2>
          <p className="text-xs text-zinc-400">
            Retención de comensales, frecuencia de pedidos y análisis descriptivo de descuentos
          </p>
        </div>

        {recurrence && recurrence.identityCoverageRate > 0 && (
          <span className="self-start sm:self-auto rounded-full bg-zinc-800 px-3 py-1 text-[11px] font-medium text-zinc-300 border border-zinc-700/60">
            Cobertura de comensales:{" "}
            <strong className="text-amber-400">{recurrence.identityCoverageRate}%</strong>
          </span>
        )}
      </div>

      {/* Recurrence KPI Cards Grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Repeat Rate Card */}
        <div className="rounded-lg border border-zinc-800/80 bg-zinc-900/90 p-4">
          <span className="text-[11px] font-medium text-zinc-400 uppercase tracking-wider">
            Tasa de Recompra
          </span>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-zinc-100">
              {recurrence ? `${recurrence.repeatRate}%` : "--"}
            </span>
          </div>
          <div className="mt-1 flex flex-col gap-0.5 text-xs text-zinc-400">
            <span>
              {recurrence
                ? `${recurrence.recurrentCustomers} de ${recurrence.totalCustomers} clientes identificados`
                : "Sin datos del período"}
            </span>
            <span className="text-[11px] text-zinc-500">
              Comensales con compras previas registradas
            </span>
          </div>
        </div>

        {/* Days Between Orders Card */}
        <div className="rounded-lg border border-zinc-800/80 bg-zinc-900/90 p-4">
          <span className="text-[11px] font-medium text-zinc-400 uppercase tracking-wider">
            Tiempo Entre Compras
          </span>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-zinc-100">
              {recurrence ? recurrence.medianDaysDisplay : "--"}
            </span>
          </div>
          <div className="mt-1 flex flex-col gap-0.5 text-xs text-zinc-400">
            <span>Mediana de intervalo observada</span>
            <span className="text-[11px] text-zinc-500">
              {recurrence?.medianDaysBetweenOrders !== null
                ? "Días transcurridos entre pedidos consecutivos"
                : "Solo comensales con 2 o más pedidos"}
            </span>
          </div>
        </div>

        {/* Order Frequency Card */}
        <div className="rounded-lg border border-zinc-800/80 bg-zinc-900/90 p-4">
          <span className="text-[11px] font-medium text-zinc-400 uppercase tracking-wider">
            Frecuencia de Pedidos
          </span>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-zinc-100">
              {recurrence ? recurrence.orderFrequency : "--"}
            </span>
            <span className="text-xs text-zinc-500 font-medium">pedidos/cliente</span>
          </div>
          <div className="mt-1 flex flex-col gap-0.5 text-xs text-zinc-400">
            <span>
              {recurrence
                ? `${recurrence.identifiedOrdersCount} pedidos de clientes identificados`
                : "Sin datos"}
            </span>
            <span className="text-[11px] text-zinc-500">
              Promedio de compras en el período
            </span>
          </div>
        </div>

        {/* Identity Coverage Card */}
        <div className="rounded-lg border border-zinc-800/80 bg-zinc-900/90 p-4">
          <span className="text-[11px] font-medium text-zinc-400 uppercase tracking-wider">
            Cobertura de Identidad
          </span>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-zinc-100">
              {recurrence ? `${recurrence.identityCoverageRate}%` : "--"}
            </span>
          </div>
          <div className="mt-1 flex flex-col gap-0.5 text-xs text-zinc-400">
            <span>
              {recurrence
                ? `${recurrence.identifiedOrdersCount} de ${recurrence.totalOrdersCount} pedidos con email/teléfono`
                : "Sin datos"}
            </span>
            <span className="text-[11px] text-zinc-500">
              {recurrence ? `${recurrence.unidentifiedOrdersCount} pedidos sin identificar` : ""}
            </span>
          </div>
        </div>
      </div>

      {/* Customer Segments Table */}
      <div className="space-y-3">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-300">
          Desempeño y Ticket por Segmento de Comensal
        </h3>

        <div className="overflow-x-auto rounded-lg border border-zinc-800/80">
          <table className="w-full text-left text-xs text-zinc-300">
            <thead className="bg-zinc-800/60 text-[11px] uppercase tracking-wider text-zinc-400">
              <tr>
                <th className="px-4 py-2.5">Segmento</th>
                <th className="px-4 py-2.5 text-right">Comensales</th>
                <th className="px-4 py-2.5 text-right">Pedidos</th>
                <th className="px-4 py-2.5 text-right">Facturación</th>
                <th className="px-4 py-2.5 text-right">Ticket Promedio</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60 bg-zinc-900/40 font-mono text-[11px]">
              {/* Recurrent Customers */}
              <tr className="hover:bg-zinc-800/30 transition-colors">
                <td className="px-4 py-3 font-sans font-medium text-zinc-200">
                  <span className="inline-block w-2 h-2 rounded-full bg-emerald-400 mr-2" />
                  Comensales Recurrentes
                </td>
                <td className="px-4 py-3 text-right">
                  {recurrence?.segments?.recurrent?.customerCount ?? 0}
                </td>
                <td className="px-4 py-3 text-right">
                  {recurrence?.segments?.recurrent?.orderCount ?? 0}
                </td>
                <td className="px-4 py-3 text-right text-zinc-100">
                  {formatCurrency(recurrence?.segments?.recurrent?.totalRevenue ?? "0.00")}
                </td>
                <td className="px-4 py-3 text-right font-semibold text-emerald-400">
                  {formatCurrency(recurrence?.segments?.recurrent?.avgTicket ?? "0.00")}
                </td>
              </tr>

              {/* First-time Customers */}
              <tr className="hover:bg-zinc-800/30 transition-colors">
                <td className="px-4 py-3 font-sans font-medium text-zinc-200">
                  <span className="inline-block w-2 h-2 rounded-full bg-sky-400 mr-2" />
                  Nuevos Comensales
                </td>
                <td className="px-4 py-3 text-right">
                  {recurrence?.segments?.firstTime?.customerCount ?? 0}
                </td>
                <td className="px-4 py-3 text-right">
                  {recurrence?.segments?.firstTime?.orderCount ?? 0}
                </td>
                <td className="px-4 py-3 text-right text-zinc-100">
                  {formatCurrency(recurrence?.segments?.firstTime?.totalRevenue ?? "0.00")}
                </td>
                <td className="px-4 py-3 text-right font-semibold text-sky-400">
                  {formatCurrency(recurrence?.segments?.firstTime?.avgTicket ?? "0.00")}
                </td>
              </tr>

              {/* Unidentified Orders */}
              <tr className="hover:bg-zinc-800/30 transition-colors">
                <td className="px-4 py-3 font-sans font-medium text-zinc-400">
                  <span className="inline-block w-2 h-2 rounded-full bg-zinc-500 mr-2" />
                  Sin Identificar (Mostrador / Anónimos)
                </td>
                <td className="px-4 py-3 text-right text-zinc-500">
                  --
                </td>
                <td className="px-4 py-3 text-right">
                  {recurrence?.segments.unidentified.orderCount ?? 0}
                </td>
                <td className="px-4 py-3 text-right text-zinc-100">
                  {formatCurrency(recurrence?.segments.unidentified.totalRevenue ?? "0.00")}
                </td>
                <td className="px-4 py-3 text-right font-semibold text-zinc-400">
                  {formatCurrency(recurrence?.segments.unidentified.avgTicket ?? "0.00")}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Promotions & Discounts Performance */}
      <div className="space-y-3 pt-2 border-t border-zinc-800/80">
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-300">
            Promociones y Descuentos Aplicados
          </h3>
          <p className="text-[11px] text-zinc-400">
            Comparativa descriptiva entre pedidos con beneficio y a tarifa regular
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {/* Discount Adoption Card */}
          <div className="rounded-lg border border-zinc-800/80 bg-zinc-900/90 p-4">
            <span className="text-[11px] font-medium text-zinc-400 uppercase tracking-wider">
              Uso de Descuentos
            </span>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-bold text-amber-400">
                {promotions ? `${promotions.discountAdoptionRate}%` : "--"}
              </span>
            </div>
            <div className="mt-1 flex flex-col gap-0.5 text-xs text-zinc-400">
              <span>
                {promotions
                  ? `${promotions.discountedOrdersCount} de ${promotions.totalOrdersCount} pedidos`
                  : "Sin datos"}
              </span>
              <span className="text-[11px] text-zinc-500">
                Pedidos con algún beneficio o rebaja
              </span>
            </div>
          </div>

          {/* Total Discounts Applied Card */}
          <div className="rounded-lg border border-zinc-800/80 bg-zinc-900/90 p-4">
            <span className="text-[11px] font-medium text-zinc-400 uppercase tracking-wider">
              Total Descuentos Otorgados
            </span>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-bold text-zinc-100">
                {promotions ? formatCurrency(promotions.totalDiscountsApplied) : "--"}
              </span>
            </div>
            <div className="mt-1 flex flex-col gap-0.5 text-xs text-zinc-400">
              <span>
                {promotions
                  ? `Venta con descuento: ${formatCurrency(promotions.discountedRevenue)}`
                  : "Sin datos"}
              </span>
              <span className="text-[11px] text-zinc-500">
                Monto total absorbido en promociones
              </span>
            </div>
          </div>

          {/* Ticket Comparison Card */}
          <div className="rounded-lg border border-zinc-800/80 bg-zinc-900/90 p-4">
            <span className="text-[11px] font-medium text-zinc-400 uppercase tracking-wider">
              Ticket: Con Promo vs Regular
            </span>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-lg font-bold text-zinc-100">
                {promotions?.ticketComparison ? formatCurrency(promotions.ticketComparison.discountedAvgTicket) : "--"}
              </span>
              <span className="text-xs text-zinc-400">
                vs {promotions?.ticketComparison ? formatCurrency(promotions.ticketComparison.fullPriceAvgTicket) : "--"}
              </span>
            </div>
            <div className="mt-1 flex flex-col gap-0.5 text-xs text-zinc-400">
              <span className={promotions?.ticketComparison && Number(promotions.ticketComparison.differenceAmount) >= 0 ? "text-emerald-400 font-medium" : "text-amber-400 font-medium"}>
                {promotions?.ticketComparison
                  ? `${Number(promotions.ticketComparison.differenceAmount) >= 0 ? "+" : ""}${formatCurrency(promotions.ticketComparison.differenceAmount)} (${promotions.ticketComparison.differencePercent > 0 ? "+" : ""}${promotions.ticketComparison.differencePercent}%)`
                  : "Sin datos"}
              </span>
              <span className="text-[11px] text-zinc-500">
                Diferencia observada en ticket promedio
              </span>
            </div>
          </div>
        </div>

        {/* Descriptive observation note without speculative claims */}
        <p className="text-[11px] text-zinc-500 italic">
          Nota: Los indicadores promocionales reflejan diferencias descriptivas observadas en ticket y volumen, sin efectuar inferencias predictivas o de retorno causal.
        </p>
      </div>
    </div>
  );
}
