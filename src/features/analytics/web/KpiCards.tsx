import {
  RiMoneyDollarCircleLine,
  RiTimeLine,
  RiShoppingBasketLine,
  RiPercentLine,
} from "@remixicon/react";
import { Chip } from "@/components/base/badges/chip";
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
      <section className="flex min-w-0 flex-col rounded-2xl border border-border-component-detail-container bg-background-secondary-default p-2 shadow-card">
        <div className="flex w-full items-start justify-between gap-2.5 p-2">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-2lg bg-linear-to-b from-blue-500 to-blue-600">
            <RiMoneyDollarCircleLine className="size-5 shrink-0 text-white" aria-hidden />
          </span>
          {Number(financial.totalDiscounts) > 0 ? (
            <Chip variant="caption" color="lime">
              -{formatCurrency(financial.totalDiscounts)}
            </Chip>
          ) : null}
        </div>
        <div className="flex flex-col gap-0.5 px-2 pt-2 pb-3">
          <p className="truncate text-body-medium text-text-secondary">
            Facturación Total
          </p>
          <p className="text-display-4-medium whitespace-nowrap text-text-primary tabular-nums">
            {formatCurrency(financial.totalRevenue)}
          </p>
        </div>
        <div className="mt-auto flex w-full items-center justify-between gap-2 rounded-2lg bg-background-inner-default py-1.5 px-2.5 shadow-card">
          <p className="truncate text-caption-1-regular text-text-secondary">
            Subtotal: {formatCurrency(financial.subtotal)}
          </p>
        </div>
      </section>

      {/* Tiempo Promedio en Carta */}
      <section className="flex min-w-0 flex-col rounded-2xl border border-border-component-detail-container bg-background-secondary-default p-2 shadow-card">
        <div className="flex w-full items-start justify-between gap-2.5 p-2">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-2lg bg-linear-to-b from-purple-500 to-purple-600">
            <RiTimeLine className="size-5 shrink-0 text-white" aria-hidden />
          </span>
          <Chip variant="caption" color="purple">
            {dwell.orderPlacedSessions} con compra
          </Chip>
        </div>
        <div className="flex flex-col gap-0.5 px-2 pt-2 pb-3">
          <p className="truncate text-body-medium text-text-secondary">
            Tiempo en Carta
          </p>
          <p className="text-display-4-medium whitespace-nowrap text-text-primary tabular-nums">
            {formatSeconds(dwell.avgDwellSeconds)}
          </p>
        </div>
        <div className="mt-auto flex w-full items-center justify-between gap-2 rounded-2lg bg-background-inner-default py-1.5 px-2.5 shadow-card">
          <p className="truncate text-caption-1-regular text-text-secondary">
            En {dwell.totalSessions.toLocaleString("es-AR")} visitas a la carta
          </p>
        </div>
      </section>

      {/* Ticket Promedio */}
      <section className="flex min-w-0 flex-col rounded-2xl border border-border-component-detail-container bg-background-secondary-default p-2 shadow-card">
        <div className="flex w-full items-start justify-between gap-2.5 p-2">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-2lg bg-linear-to-b from-orange-400 to-orange-500">
            <RiShoppingBasketLine className="size-5 shrink-0 text-white" aria-hidden />
          </span>
          <Chip variant="caption" color="orange">
            {financial.paidOrdersCount} pedidos
          </Chip>
        </div>
        <div className="flex flex-col gap-0.5 px-2 pt-2 pb-3">
          <p className="truncate text-body-medium text-text-secondary">
            Ticket Promedio
          </p>
          <p className="text-display-4-medium whitespace-nowrap text-text-primary tabular-nums">
            {formatCurrency(financial.avgOrderValue)}
          </p>
        </div>
        <div className="mt-auto flex w-full items-center justify-between gap-2 rounded-2lg bg-background-inner-default py-1.5 px-2.5 shadow-card">
          <p className="truncate text-caption-1-regular text-text-secondary">
            En base a {financial.paidOrdersCount} pedidos pagados
          </p>
        </div>
      </section>

      {/* Conversion & Rebote */}
      <section className="flex min-w-0 flex-col rounded-2xl border border-border-component-detail-container bg-background-secondary-default p-2 shadow-card">
        <div className="flex w-full items-start justify-between gap-2.5 p-2">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-2lg bg-linear-to-b from-emerald-500 to-emerald-600">
            <RiPercentLine className="size-5 shrink-0 text-white" aria-hidden />
          </span>
          <Chip variant="bold" color="lime">
            {dwell.conversionRate}% conv.
          </Chip>
        </div>
        <div className="flex flex-col gap-0.5 px-2 pt-2 pb-3">
          <p className="truncate text-body-medium text-text-secondary">
            Conversión &amp; Rebote
          </p>
          <p className="text-display-4-medium whitespace-nowrap text-text-primary tabular-nums">
            {dwell.conversionRate}%
          </p>
        </div>
        <div className="mt-auto flex w-full items-center justify-between gap-2 rounded-2lg bg-background-inner-default py-1.5 px-2.5 shadow-card">
          <p className="truncate text-caption-1-regular text-text-secondary">
            Rebote (&lt;5s): {dwell.bounceRate}% ({dwell.bounceSessions} sesiones)
          </p>
        </div>
      </section>
    </div>
  );
}
