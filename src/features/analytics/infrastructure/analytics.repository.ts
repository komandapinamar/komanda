import { and, asc, desc, eq, gte, inArray, lt, lte, sql } from "drizzle-orm";
import {
  cashRegisterMovements,
  catalogCategories,
  catalogItems,
  mediaAssets,
  mpFinancialRecords,
  orderEvents,
  orderLines,
  storefrontItemEvents,
  storefrontSessions,
  tenantOrders,
} from "@/db/schema";
import type { TenantTransaction } from "@/db/tenant-transaction";
import {
  extractCustomerIdentifier,
  type CustomerRecurrenceSummary,
  type IngestTelemetryBatchInput,
  type KitchenDelaysSummary,
  type PeakHoursHeatmap,
  type PeakHoursHeatmapCell,
  type PendingKitchenOrder,
  type PromotionsSummary,
  type RecordStorefrontSessionInput,
  type UnconvertedProduct,
} from "../domain/analytics.schemas";

export function parseMoneyToCents(amount: string | number): bigint {
  const str = typeof amount === "number" ? amount.toFixed(2) : amount.trim();
  const isNegative = str.startsWith("-");
  const clean = isNegative ? str.slice(1) : str;
  const [whole = "0", frac = "00"] = clean.split(".");
  const cents =
    BigInt(whole) * BigInt(100) + BigInt(frac.padEnd(2, "0").slice(0, 2));
  return isNegative ? -cents : cents;
}

export function centsToMoneyString(cents: bigint): string {
  const isNegative = cents < BigInt(0);
  const abs = isNegative ? -cents : cents;
  const whole = abs / BigInt(100);
  const frac = abs % BigInt(100);
  return `${isNegative ? "-" : ""}${whole}.${frac.toString().padStart(2, "0")}`;
}

export function addMoneyStrings(...amounts: string[]): string {
  const total = amounts.reduce(
    (acc, val) => acc + parseMoneyToCents(val),
    BigInt(0),
  );
  return centsToMoneyString(total);
}

export function calculatePercentile(values: number[], percentile: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = (sorted.length - 1) * percentile;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const weight = index - lower;
  if (lower === upper) return Number(sorted[lower].toFixed(1));
  const interpolated = sorted[lower] * (1 - weight) + sorted[upper] * weight;
  return Number(interpolated.toFixed(1));
}

const HEATMAP_DAYS = [
  "Lunes",
  "Martes",
  "Miércoles",
  "Jueves",
  "Viernes",
  "Sábado",
  "Domingo",
] as const;

export class AnalyticsRepository {
  constructor(
    private readonly transaction: TenantTransaction,
    private readonly tenantId: string,
  ) {}

  async upsertSession(input: RecordStorefrontSessionInput) {
    const [row] = await this.transaction
      .insert(storefrontSessions)
      .values({
        tenantId: this.tenantId,
        sessionKey: input.sessionKey,
        deviceType: input.deviceType,
        dwellTimeSeconds: input.dwellTimeSeconds,
        categoryDwellMap: input.categoryDwellMap,
        itemViewsMap: input.itemViewsMap,
        cartCreated: input.cartCreated,
        orderPlaced: input.orderPlaced,
        associatedOrderId: input.associatedOrderId ?? null,
        lastActiveAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [storefrontSessions.tenantId, storefrontSessions.sessionKey],
        set: {
          dwellTimeSeconds: sql`greatest(${storefrontSessions.dwellTimeSeconds}, ${input.dwellTimeSeconds})`,
          deviceType: input.deviceType !== "unknown" ? input.deviceType : storefrontSessions.deviceType,
          categoryDwellMap: input.categoryDwellMap,
          itemViewsMap: input.itemViewsMap,
          cartCreated: sql`${storefrontSessions.cartCreated} or ${input.cartCreated}`,
          orderPlaced: sql`${storefrontSessions.orderPlaced} or ${input.orderPlaced}`,
          associatedOrderId: sql`coalesce(${input.associatedOrderId ?? null}, ${storefrontSessions.associatedOrderId})`,
          lastActiveAt: new Date(),
          updatedAt: new Date(),
        },
      })
      .returning();

    return row;
  }

  async getDwellMetrics(from: Date, to: Date) {
    const result = await this.transaction
      .select({
        totalSessions: sql<number>`count(*)::int`,
        avgDwellSeconds: sql<number>`coalesce(round(avg(${storefrontSessions.dwellTimeSeconds})), 0)::int`,
        maxDwellSeconds: sql<number>`coalesce(max(${storefrontSessions.dwellTimeSeconds}), 0)::int`,
        bounceSessions: sql<number>`count(*) filter (where ${storefrontSessions.dwellTimeSeconds} < 5)::int`,
        cartCreatedSessions: sql<number>`count(*) filter (where ${storefrontSessions.cartCreated} = true)::int`,
        orderPlacedSessions: sql<number>`count(*) filter (where ${storefrontSessions.orderPlaced} = true)::int`,
      })
      .from(storefrontSessions)
      .where(
        and(
          eq(storefrontSessions.tenantId, this.tenantId),
          gte(storefrontSessions.createdAt, from),
          lte(storefrontSessions.createdAt, to),
        ),
      );

    const metrics = result[0] ?? {
      totalSessions: 0,
      avgDwellSeconds: 0,
      maxDwellSeconds: 0,
      bounceSessions: 0,
      cartCreatedSessions: 0,
      orderPlacedSessions: 0,
    };

    const bounceRate = metrics.totalSessions > 0
      ? Number(((metrics.bounceSessions / metrics.totalSessions) * 100).toFixed(1))
      : 0;

    const conversionRate = metrics.totalSessions > 0
      ? Number(((metrics.orderPlacedSessions / metrics.totalSessions) * 100).toFixed(1))
      : 0;

    return {
      ...metrics,
      bounceRate,
      conversionRate,
    };
  }

  async getDwellTimeline(from: Date, to: Date, granularity: "hour" | "day" = "day") {
    const truncUnit = granularity === "hour" ? "hour" : "day";
    const dateTruncExpr = sql`date_trunc('${sql.raw(truncUnit)}', ${storefrontSessions.createdAt})`;
    const bucketSql = sql<string>`to_char(${dateTruncExpr}, 'YYYY-MM-DD"T"HH24:MI:SS"Z"')`;

    const rows = await this.transaction
      .select({
        bucket: bucketSql,
        sessions: sql<number>`count(*)::int`,
        avgDwellSeconds: sql<number>`coalesce(round(avg(${storefrontSessions.dwellTimeSeconds})), 0)::int`,
        orders: sql<number>`count(*) filter (where ${storefrontSessions.orderPlaced} = true)::int`,
      })
      .from(storefrontSessions)
      .where(
        and(
          eq(storefrontSessions.tenantId, this.tenantId),
          gte(storefrontSessions.createdAt, from),
          lte(storefrontSessions.createdAt, to),
        ),
      )
      .groupBy(dateTruncExpr)
      .orderBy(sql`${dateTruncExpr} asc`);

    return rows;
  }

  async getCashLedgerSummary(from: Date, to: Date, locationId?: string) {
    const conditions = [
      eq(cashRegisterMovements.tenantId, this.tenantId),
      gte(cashRegisterMovements.occurredAt, from),
      lte(cashRegisterMovements.occurredAt, to),
    ];
    if (locationId) {
      conditions.push(eq(cashRegisterMovements.locationId, locationId));
    }

    const [row] = await this.transaction
      .select({
        totalDeposits: sql<string>`coalesce(round(sum(case when ${cashRegisterMovements.type} = 'sale_deposit' then ${cashRegisterMovements.amount} else 0 end), 2), 0)::text`,
        totalWithdrawals: sql<string>`coalesce(round(sum(case when ${cashRegisterMovements.type} = 'cancellation_withdrawal' then ${cashRegisterMovements.amount} else 0 end), 2), 0)::text`,
        netCash: sql<string>`coalesce(round(sum(case when ${cashRegisterMovements.type} = 'sale_deposit' then ${cashRegisterMovements.amount} when ${cashRegisterMovements.type} = 'cancellation_withdrawal' then -${cashRegisterMovements.amount} else 0 end), 2), 0)::text`,
        count: sql<number>`count(*)::int`,
      })
      .from(cashRegisterMovements)
      .where(and(...conditions));

    const recent = await this.transaction
      .select({
        id: cashRegisterMovements.id,
        orderId: cashRegisterMovements.orderId,
        type: cashRegisterMovements.type,
        amount: sql<string>`${cashRegisterMovements.amount}::text`,
        occurredAt: sql<string>`to_char(${cashRegisterMovements.occurredAt}, 'YYYY-MM-DD"T"HH24:MI:SS"Z"')`,
      })
      .from(cashRegisterMovements)
      .where(and(...conditions))
      .orderBy(desc(cashRegisterMovements.occurredAt))
      .limit(10);

    return {
      depositsAmount: row?.totalDeposits ?? "0.00",
      withdrawalsAmount: row?.totalWithdrawals ?? "0.00",
      netCashAmount: row?.netCash ?? "0.00",
      movementsCount: row?.count ?? 0,
      recentMovements: recent,
    };
  }

  async getMpFinancialSummary(from: Date, to: Date, locationId?: string) {
    const conditions = [
      eq(mpFinancialRecords.tenantId, this.tenantId),
      gte(mpFinancialRecords.settlementDate, from),
      lte(mpFinancialRecords.settlementDate, to),
    ];
    if (locationId) {
      conditions.push(eq(mpFinancialRecords.locationId, locationId));
    }

    const [row] = await this.transaction
      .select({
        grossAmount: sql<string>`coalesce(round(sum(${mpFinancialRecords.grossAmount}), 2), 0)::text`,
        feeAmount: sql<string>`coalesce(round(sum(${mpFinancialRecords.feeAmount}), 2), 0)::text`,
        taxesAmount: sql<string>`coalesce(round(sum(${mpFinancialRecords.taxesAmount}), 2), 0)::text`,
        netReceivedAmount: sql<string>`coalesce(round(sum(${mpFinancialRecords.netReceivedAmount}), 2), 0)::text`,
        pendingReleaseAmount: sql<string>`coalesce(round(sum(case when ${mpFinancialRecords.moneyReleaseStatus} = 'pending' then ${mpFinancialRecords.netReceivedAmount} else 0 end), 2), 0)::text`,
        releasedAmount: sql<string>`coalesce(round(sum(case when ${mpFinancialRecords.moneyReleaseStatus} = 'released' then ${mpFinancialRecords.netReceivedAmount} else 0 end), 2), 0)::text`,
        isFeeInclusiveOfTax: sql<boolean>`coalesce(bool_or(${mpFinancialRecords.isFeeInclusiveOfTax}), false)`,
      })
      .from(mpFinancialRecords)
      .where(and(...conditions));

    const releaseConditions = [
      eq(mpFinancialRecords.tenantId, this.tenantId),
      eq(mpFinancialRecords.moneyReleaseStatus, "pending"),
    ];
    if (locationId) {
      releaseConditions.push(eq(mpFinancialRecords.locationId, locationId));
    }

    const releaseSchedule = await this.transaction
      .select({
        mpPaymentId: mpFinancialRecords.mpPaymentId,
        amount: sql<string>`${mpFinancialRecords.netReceivedAmount}::text`,
        expectedAt: sql<string | null>`to_char(${mpFinancialRecords.moneyReleaseExpectedAt}, 'YYYY-MM-DD"T"HH24:MI:SS"Z"')`,
      })
      .from(mpFinancialRecords)
      .where(and(...releaseConditions))
      .orderBy(asc(mpFinancialRecords.moneyReleaseExpectedAt))
      .limit(10);

    const grossCents = parseMoneyToCents(row?.grossAmount ?? "0.00");
    const feeCents = parseMoneyToCents(row?.feeAmount ?? "0.00");
    const taxesCents = parseMoneyToCents(row?.taxesAmount ?? "0.00");
    const totalDeductionsCents = feeCents + taxesCents;
    const effectiveRate =
      grossCents > BigInt(0)
        ? (Number((totalDeductionsCents * BigInt(10000)) / grossCents) / 100).toFixed(2)
        : "0.00";

    return {
      grossAmount: row?.grossAmount ?? "0.00",
      feeAmount: row?.feeAmount ?? "0.00",
      taxesAmount: row?.taxesAmount ?? "0.00",
      refundsAmount: "0.00",
      netReceivedAmount: row?.netReceivedAmount ?? "0.00",
      pendingReleaseAmount: row?.pendingReleaseAmount ?? "0.00",
      releasedAmount: row?.releasedAmount ?? "0.00",
      effectiveDeductionRate: `${effectiveRate}%`,
      isFeeInclusiveOfTax: row?.isFeeInclusiveOfTax ?? false,
      releaseSchedule,
    };
  }

  async getFinancialSummary(input: {
    from: Date;
    to: Date;
    locationId?: string;
    source?: string;
  }) {
    const orderConditions = [
      eq(tenantOrders.tenantId, this.tenantId),
      gte(tenantOrders.createdAt, input.from),
      lte(tenantOrders.createdAt, input.to),
      eq(tenantOrders.paymentStatus, "paid"),
      sql`${tenantOrders.fulfillmentStatus} != 'cancelled'`,
    ];
    if (input.locationId) {
      orderConditions.push(eq(tenantOrders.locationId, input.locationId));
    }
    if (input.source && input.source !== "all") {
      orderConditions.push(
        eq(
          tenantOrders.source,
          input.source as "mercadopago_webhook" | "admin_direct",
        ),
      );
    }

    const [orderSummary] = await this.transaction
      .select({
        totalRevenue: sql<string>`coalesce(round(sum(${tenantOrders.total}), 2), 0)::text`,
        subtotal: sql<string>`coalesce(round(sum(${tenantOrders.subtotal}), 2), 0)::text`,
        totalDiscounts: sql<string>`coalesce(round(sum(${tenantOrders.discountTotal}), 2), 0)::text`,
        paidOrdersCount: sql<number>`count(*)::int`,
        avgOrderValue: sql<string>`coalesce(round(avg(${tenantOrders.total}), 2), 0)::text`,
      })
      .from(tenantOrders)
      .where(and(...orderConditions));

    const revenueBySource = await this.transaction
      .select({
        source: tenantOrders.source,
        totalRevenue: sql<string>`coalesce(round(sum(${tenantOrders.total}), 2), 0)::text`,
        orderCount: sql<number>`count(*)::int`,
      })
      .from(tenantOrders)
      .where(and(...orderConditions))
      .groupBy(tenantOrders.source);

    const cashLedger = await this.getCashLedgerSummary(
      input.from,
      input.to,
      input.locationId,
    );
    const mpWaterfall = await this.getMpFinancialSummary(
      input.from,
      input.to,
      input.locationId,
    );

    // M-53: Consolidated net collections (respecting channel filter if specified)
    const netCollections =
      input.source === "admin_direct"
        ? cashLedger.netCashAmount
        : input.source === "mercadopago_webhook"
        ? mpWaterfall.netReceivedAmount
        : addMoneyStrings(
            mpWaterfall.netReceivedAmount,
            cashLedger.netCashAmount,
          );

    return {
      totalRevenue: orderSummary?.totalRevenue ?? "0.00",
      subtotal: orderSummary?.subtotal ?? "0.00",
      totalDiscounts: orderSummary?.totalDiscounts ?? "0.00",
      paidOrdersCount: orderSummary?.paidOrdersCount ?? 0,
      avgOrderValue: orderSummary?.avgOrderValue ?? "0.00",
      revenueBySource: revenueBySource.map((r) => ({
        source: r.source,
        revenue: r.totalRevenue,
        orders: r.orderCount,
      })),
      netCollections,
      mpWaterfall,
      cashLedger,
    };
  }

  async insertItemEvents(
    locationId: string,
    input: IngestTelemetryBatchInput,
  ): Promise<{ count: number }> {
    if (input.events.length === 0) return { count: 0 };
    const rows = input.events.map((evt) => ({
      tenantId: this.tenantId,
      locationId,
      sessionId: input.sessionId,
      itemId: evt.itemId,
      surface: evt.surface,
      eventType: evt.eventType,
      dwellDurationMs: evt.dwellDurationMs,
      exposureId: evt.exposureId ?? null,
      occurredAt: evt.occurredAt ? new Date(evt.occurredAt) : new Date(),
    }));

    await this.transaction.insert(storefrontItemEvents).values(rows);
    return { count: rows.length };
  }

  async getKitchenDelaysSummary(
    from: Date,
    to: Date,
    locationId?: string,
  ): Promise<KitchenDelaysSummary> {
    const conditions = [
      eq(tenantOrders.tenantId, this.tenantId),
      gte(tenantOrders.createdAt, from),
      lte(tenantOrders.createdAt, to),
    ];
    if (locationId) {
      conditions.push(eq(tenantOrders.locationId, locationId));
    }

    const orders = await this.transaction
      .select({
        id: tenantOrders.id,
        purchaseNumber: tenantOrders.purchaseNumber,
        fulfillmentStatus: tenantOrders.fulfillmentStatus,
        paymentStatus: tenantOrders.paymentStatus,
        approvedAt: tenantOrders.approvedAt,
        createdAt: tenantOrders.createdAt,
        total: tenantOrders.total,
      })
      .from(tenantOrders)
      .where(and(...conditions));

    const orderIds = orders.map((o) => o.id);
    const events =
      orderIds.length > 0
        ? await this.transaction
            .select({
              orderId: orderEvents.orderId,
              toStatus: orderEvents.toStatus,
              occurredAt: orderEvents.occurredAt,
            })
            .from(orderEvents)
            .where(
              and(
                eq(orderEvents.tenantId, this.tenantId),
                inArray(orderEvents.orderId, orderIds),
              ),
            )
            .orderBy(asc(orderEvents.occurredAt))
        : [];

    const eventsByOrder = new Map<
      string,
      Array<{ toStatus: string | null; occurredAt: Date }>
    >();
    for (const evt of events) {
      const list = eventsByOrder.get(evt.orderId) ?? [];
      list.push(evt);
      eventsByOrder.set(evt.orderId, list);
    }

    const waitingMinutesList: number[] = [];
    const prepMinutesList: number[] = [];
    const totalMinutesList: number[] = [];
    let cancelledBeforeCookingCount = 0;

    for (const order of orders) {
      const orderEvts = eventsByOrder.get(order.id) ?? [];
      const prepEvt = orderEvts.find((e) => e.toStatus === "preparing");
      const readyEvt = orderEvts.find((e) => e.toStatus === "ready");

      if (order.fulfillmentStatus === "cancelled" && !prepEvt) {
        cancelledBeforeCookingCount++;
        continue;
      }

      const tIn = order.approvedAt ?? order.createdAt;

      if (prepEvt) {
        const tStart = prepEvt.occurredAt;
        const waitingMs = tStart.getTime() - tIn.getTime();
        if (waitingMs >= 0) {
          waitingMinutesList.push(Number((waitingMs / 60000).toFixed(1)));
        }

        if (readyEvt) {
          const tReady = readyEvt.occurredAt;
          const prepMs = tReady.getTime() - tStart.getTime();
          const totalMs = tReady.getTime() - tIn.getTime();

          if (prepMs >= 0) {
            prepMinutesList.push(Number((prepMs / 60000).toFixed(1)));
          }
          if (totalMs >= 0) {
            totalMinutesList.push(Number((totalMs / 60000).toFixed(1)));
          }
        }
      } else if (readyEvt) {
        const totalMs = readyEvt.occurredAt.getTime() - tIn.getTime();
        if (totalMs >= 0) {
          totalMinutesList.push(Number((totalMs / 60000).toFixed(1)));
        }
      }
    }

    // Pending orders in approved or preparing status not yet ready
    const pendingConditions = [
      eq(tenantOrders.tenantId, this.tenantId),
      sql`${tenantOrders.fulfillmentStatus} in ('approved', 'preparing')`,
      sql`${tenantOrders.fulfillmentStatus} != 'cancelled'`,
    ];
    if (locationId) {
      pendingConditions.push(eq(tenantOrders.locationId, locationId));
    }

    const pendingRows = await this.transaction
      .select({
        id: tenantOrders.id,
        purchaseNumber: tenantOrders.purchaseNumber,
        fulfillmentStatus: tenantOrders.fulfillmentStatus,
        approvedAt: tenantOrders.approvedAt,
        createdAt: tenantOrders.createdAt,
        total: tenantOrders.total,
      })
      .from(tenantOrders)
      .where(and(...pendingConditions));

    const now = Date.now();
    const pendingOrders: PendingKitchenOrder[] = pendingRows.map((o) => {
      const enteredAt = o.approvedAt ?? o.createdAt;
      const waitingAgeMinutes = Math.max(
        0,
        Math.floor((now - enteredAt.getTime()) / 60000),
      );
      return {
        orderId: o.id,
        purchaseNumber: Number(o.purchaseNumber),
        fulfillmentStatus: o.fulfillmentStatus as "approved" | "preparing",
        waitingAgeMinutes,
        enteredAt: enteredAt.toISOString(),
        total: o.total,
      };
    });

    pendingOrders.sort((a, b) => b.waitingAgeMinutes - a.waitingAgeMinutes);

    return {
      waitingMinutes: {
        p50: calculatePercentile(waitingMinutesList, 0.5),
        p90: calculatePercentile(waitingMinutesList, 0.9),
        sampleSize: waitingMinutesList.length,
      },
      preparationMinutes: {
        p50: calculatePercentile(prepMinutesList, 0.5),
        p90: calculatePercentile(prepMinutesList, 0.9),
        sampleSize: prepMinutesList.length,
      },
      totalTimeMinutes: {
        p50: calculatePercentile(totalMinutesList, 0.5),
        p90: calculatePercentile(totalMinutesList, 0.9),
        sampleSize: totalMinutesList.length,
      },
      pendingOrders,
      cancelledBeforeCookingCount,
    };
  }

  async getPeakHoursHeatmap(
    from: Date,
    to: Date,
    locationId?: string,
  ): Promise<PeakHoursHeatmap> {
    const cells: PeakHoursHeatmapCell[] = [];
    for (let d = 0; d < 7; d++) {
      for (let h = 0; h < 24; h++) {
        cells.push({
          dayOfWeek: d,
          dayName: HEATMAP_DAYS[d],
          hour: h,
          orderCount: 0,
          revenue: "0.00",
          isPeak: false,
        });
      }
    }

    const orderConditions = [
      eq(tenantOrders.tenantId, this.tenantId),
      gte(tenantOrders.createdAt, from),
      lte(tenantOrders.createdAt, to),
      eq(tenantOrders.paymentStatus, "paid"),
      sql`${tenantOrders.fulfillmentStatus} != 'cancelled'`,
    ];
    if (locationId) {
      orderConditions.push(eq(tenantOrders.locationId, locationId));
    }

    const orders = await this.transaction
      .select({
        createdAt: tenantOrders.createdAt,
        total: tenantOrders.total,
      })
      .from(tenantOrders)
      .where(and(...orderConditions));

    const dayMap: Record<string, number> = {
      Mon: 0,
      Tue: 1,
      Wed: 2,
      Thu: 3,
      Fri: 4,
      Sat: 5,
      Sun: 6,
    };
    const tzFormatter = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Argentina/Buenos_Aires",
      weekday: "short",
      hour: "numeric",
      hourCycle: "h23",
    });

    for (const order of orders) {
      const parts = tzFormatter.formatToParts(order.createdAt);
      const weekdayStr = parts.find((p) => p.type === "weekday")?.value;
      const hourStr = parts.find((p) => p.type === "hour")?.value;

      const dayOfWeek = weekdayStr ? dayMap[weekdayStr] ?? 0 : 0;
      const hour = hourStr ? parseInt(hourStr, 10) : 0;

      const cellIndex = dayOfWeek * 24 + hour;
      const cell = cells[cellIndex];
      if (cell) {
        cell.orderCount += 1;
        cell.revenue = addMoneyStrings(cell.revenue, order.total);
      }
    }

    const maxOrdersInSlot = Math.max(...cells.map((c) => c.orderCount), 0);
    if (maxOrdersInSlot > 0) {
      for (const cell of cells) {
        if (cell.orderCount === maxOrdersInSlot) {
          cell.isPeak = true;
        }
      }
    }

    const dayTotals = Array(7).fill(0);
    const hourTotals = Array(24).fill(0);
    for (const cell of cells) {
      dayTotals[cell.dayOfWeek] += cell.orderCount;
      hourTotals[cell.hour] += cell.orderCount;
    }

    const maxDayOrders = Math.max(...dayTotals, 0);
    const maxHourOrders = Math.max(...hourTotals, 0);

    const busiestDayIndex =
      maxDayOrders > 0 ? dayTotals.indexOf(maxDayOrders) : -1;
    const busiestHourIndex =
      maxHourOrders > 0 ? hourTotals.indexOf(maxHourOrders) : -1;

    return {
      cells,
      maxOrdersInSlot,
      busiestDay: busiestDayIndex >= 0 ? HEATMAP_DAYS[busiestDayIndex] : null,
      busiestHour: busiestHourIndex >= 0 ? busiestHourIndex : null,
    };
  }

  async getUnconvertedProducts(
    from: Date,
    to: Date,
    locationId?: string,
  ): Promise<UnconvertedProduct[]> {
    const viewConditions = [
      eq(storefrontItemEvents.tenantId, this.tenantId),
      eq(storefrontItemEvents.eventType, "qualified_view"),
      gte(storefrontItemEvents.occurredAt, from),
      lte(storefrontItemEvents.occurredAt, to),
    ];
    if (locationId) {
      viewConditions.push(eq(storefrontItemEvents.locationId, locationId));
    }

    const itemViews = await this.transaction
      .select({
        itemId: storefrontItemEvents.itemId,
        viewsCount: sql<number>`count(*)::int`,
      })
      .from(storefrontItemEvents)
      .where(and(...viewConditions))
      .groupBy(storefrontItemEvents.itemId);

    const qualifiedItems = itemViews.filter((v) => v.viewsCount >= 10);
    if (qualifiedItems.length === 0) return [];

    const itemIds = qualifiedItems.map((v) => v.itemId);

    const itemsInfo = await this.transaction
      .select({
        id: catalogItems.id,
        name: catalogItems.name,
        price: catalogItems.price,
        imageAssetId: catalogItems.imageAssetId,
        categoryName: catalogCategories.name,
        mediaUrl: mediaAssets.publicUrl,
      })
      .from(catalogItems)
      .leftJoin(
        catalogCategories,
        eq(catalogCategories.id, catalogItems.categoryId),
      )
      .leftJoin(mediaAssets, eq(mediaAssets.id, catalogItems.imageAssetId))
      .where(
        and(
          eq(catalogItems.tenantId, this.tenantId),
          inArray(catalogItems.id, itemIds),
        ),
      );

    const purchaseConditions = [
      eq(tenantOrders.tenantId, this.tenantId),
      eq(tenantOrders.paymentStatus, "paid"),
      sql`${tenantOrders.fulfillmentStatus} != 'cancelled'`,
      gte(tenantOrders.createdAt, from),
      lte(tenantOrders.createdAt, to),
      inArray(orderLines.sourceItemId, itemIds),
    ];
    if (locationId) {
      purchaseConditions.push(eq(tenantOrders.locationId, locationId));
    }

    const purchases = await this.transaction
      .select({
        sourceItemId: orderLines.sourceItemId,
        purchasesCount: sql<number>`coalesce(sum(${orderLines.quantity}), 0)::int`,
      })
      .from(orderLines)
      .innerJoin(tenantOrders, eq(tenantOrders.id, orderLines.orderId))
      .where(and(...purchaseConditions))
      .groupBy(orderLines.sourceItemId);

    const purchaseMap = new Map<string, number>();
    for (const p of purchases) {
      if (p.sourceItemId) {
        purchaseMap.set(p.sourceItemId, p.purchasesCount);
      }
    }

    const itemsMap = new Map(itemsInfo.map((i) => [i.id, i]));
    const unconverted: UnconvertedProduct[] = [];

    for (const qItem of qualifiedItems) {
      const info = itemsMap.get(qItem.itemId);
      if (!info) continue;

      const purchasesCount = purchaseMap.get(qItem.itemId) ?? 0;
      const conversionRate = Number(
        ((purchasesCount / qItem.viewsCount) * 100).toFixed(1),
      );

      if (conversionRate <= 5.0) {
        let suggestion: string;
        if (!info.imageAssetId && !info.mediaUrl) {
          suggestion = "Falta foto en carta";
        } else if (purchasesCount === 0 || conversionRate === 0) {
          suggestion = "Probar foto nueva";
        } else {
          suggestion = "Revisar precio";
        }

        unconverted.push({
          itemId: qItem.itemId,
          productName: info.name,
          categoryName: info.categoryName ?? null,
          imageUrl: info.mediaUrl ?? null,
          price: info.price,
          qualifiedViews: qItem.viewsCount,
          purchasesCount,
          conversionRate,
          suggestion,
        });
      }
    }

    unconverted.sort((a, b) => b.qualifiedViews - a.qualifiedViews);
    return unconverted;
  }

  async getCustomerRecurrenceSummary(
    from: Date,
    to: Date,
    locationId?: string,
  ): Promise<CustomerRecurrenceSummary> {
    const periodConditions = [
      eq(tenantOrders.tenantId, this.tenantId),
      gte(tenantOrders.createdAt, from),
      lte(tenantOrders.createdAt, to),
      eq(tenantOrders.paymentStatus, "paid"),
      sql`${tenantOrders.fulfillmentStatus} != 'cancelled'`,
    ];
    if (locationId) {
      periodConditions.push(eq(tenantOrders.locationId, locationId));
    }

    const periodOrders = await this.transaction
      .select({
        id: tenantOrders.id,
        total: tenantOrders.total,
        customerSnapshot: tenantOrders.customerSnapshot,
        createdAt: tenantOrders.createdAt,
      })
      .from(tenantOrders)
      .where(and(...periodConditions))
      .orderBy(asc(tenantOrders.createdAt));

    type ParsedOrder = {
      id: string;
      total: string;
      createdAt: Date;
      customerId: string | null;
    };

    const parsedPeriodOrders: ParsedOrder[] = periodOrders.map((o) => ({
      id: o.id,
      total: o.total,
      createdAt: o.createdAt,
      customerId: extractCustomerIdentifier(o.customerSnapshot),
    }));

    const periodCustomerIds = new Set<string>();
    for (const o of parsedPeriodOrders) {
      if (o.customerId) {
        periodCustomerIds.add(o.customerId);
      }
    }

    const priorOrdersByCustomer = new Map<string, Array<{ createdAt: Date }>>();
    if (periodCustomerIds.size > 0) {
      const priorConditions = [
        eq(tenantOrders.tenantId, this.tenantId),
        lt(tenantOrders.createdAt, from),
        eq(tenantOrders.paymentStatus, "paid"),
        sql`${tenantOrders.fulfillmentStatus} != 'cancelled'`,
      ];
      if (locationId) {
        priorConditions.push(eq(tenantOrders.locationId, locationId));
      }

      const priorOrders = await this.transaction
        .select({
          customerSnapshot: tenantOrders.customerSnapshot,
          createdAt: tenantOrders.createdAt,
        })
        .from(tenantOrders)
        .where(and(...priorConditions))
        .orderBy(asc(tenantOrders.createdAt));

      for (const po of priorOrders) {
        const custId = extractCustomerIdentifier(po.customerSnapshot);
        if (custId && periodCustomerIds.has(custId)) {
          const list = priorOrdersByCustomer.get(custId) ?? [];
          list.push({ createdAt: po.createdAt });
          priorOrdersByCustomer.set(custId, list);
        }
      }
    }

    const firstTimeOrders: ParsedOrder[] = [];
    const recurrentOrders: ParsedOrder[] = [];
    const unidentifiedOrders: ParsedOrder[] = [];

    const customerPriorCount = new Map<string, number>();
    for (const [custId, list] of priorOrdersByCustomer.entries()) {
      customerPriorCount.set(custId, list.length);
    }

    const customerAllOrderDates = new Map<string, Date[]>();
    for (const [custId, list] of priorOrdersByCustomer.entries()) {
      customerAllOrderDates.set(custId, list.map((l) => l.createdAt));
    }

    for (const o of parsedPeriodOrders) {
      if (!o.customerId) {
        unidentifiedOrders.push(o);
        continue;
      }

      const priorCount = customerPriorCount.get(o.customerId) ?? 0;
      if (priorCount > 0) {
        recurrentOrders.push(o);
      } else {
        firstTimeOrders.push(o);
      }
      customerPriorCount.set(o.customerId, priorCount + 1);

      const dates = customerAllOrderDates.get(o.customerId) ?? [];
      dates.push(o.createdAt);
      customerAllOrderDates.set(o.customerId, dates);
    }

    let firstTimeCustomers = 0;
    let recurrentCustomers = 0;
    const allIntervalsDays: number[] = [];

    for (const custId of periodCustomerIds) {
      const dates = customerAllOrderDates.get(custId) ?? [];
      dates.sort((a, b) => a.getTime() - b.getTime());

      const priorCount = (priorOrdersByCustomer.get(custId) ?? []).length;
      if (priorCount > 0 || dates.length > 1) {
        recurrentCustomers++;
      } else {
        firstTimeCustomers++;
      }

      if (dates.length >= 2) {
        for (let i = 0; i < dates.length - 1; i++) {
          const diffMs = dates[i + 1].getTime() - dates[i].getTime();
          if (diffMs >= 0) {
            allIntervalsDays.push(
              Number((diffMs / (24 * 60 * 60 * 1000)).toFixed(1)),
            );
          }
        }
      }
    }

    const totalCustomers = periodCustomerIds.size;
    const identifiedOrdersCount = firstTimeOrders.length + recurrentOrders.length;
    const unidentifiedOrdersCount = unidentifiedOrders.length;
    const totalOrdersCount = parsedPeriodOrders.length;

    const repeatRate =
      totalCustomers > 0
        ? Number(((recurrentCustomers / totalCustomers) * 100).toFixed(1))
        : 0;

    const orderFrequency =
      totalCustomers > 0
        ? Number((identifiedOrdersCount / totalCustomers).toFixed(2))
        : 0;

    const identityCoverageRate =
      totalOrdersCount > 0
        ? Number(((identifiedOrdersCount / totalOrdersCount) * 100).toFixed(1))
        : 0;

    let medianDaysBetweenOrders: number | null = null;
    let medianDaysDisplay = "Sin compras repetidas";

    if (allIntervalsDays.length > 0) {
      medianDaysBetweenOrders = calculatePercentile(allIntervalsDays, 0.5);
      medianDaysDisplay = `${medianDaysBetweenOrders} ${
        medianDaysBetweenOrders === 1 ? "día" : "días"
      }`;
    }

    const buildSegment = (ordersList: ParsedOrder[], customerCount: number) => {
      const count = ordersList.length;
      const totalRev =
        count > 0
          ? centsToMoneyString(
              ordersList.reduce(
                (acc, o) => acc + parseMoneyToCents(o.total),
                BigInt(0),
              ),
            )
          : "0.00";
      const avg =
        count > 0
          ? centsToMoneyString(parseMoneyToCents(totalRev) / BigInt(count))
          : "0.00";
      return {
        customerCount,
        orderCount: count,
        totalRevenue: totalRev,
        avgTicket: avg,
      };
    };

    return {
      totalCustomers,
      firstTimeCustomers,
      recurrentCustomers,
      repeatRate,
      orderFrequency,
      medianDaysBetweenOrders,
      medianDaysDisplay,
      identityCoverageRate,
      identifiedOrdersCount,
      unidentifiedOrdersCount,
      totalOrdersCount,
      segments: {
        firstTime: buildSegment(firstTimeOrders, firstTimeCustomers),
        recurrent: buildSegment(recurrentOrders, recurrentCustomers),
        unidentified: buildSegment(unidentifiedOrders, 0),
      },
    };
  }

  async getPromotionsSummary(
    from: Date,
    to: Date,
    locationId?: string,
  ): Promise<PromotionsSummary> {
    const conditions = [
      eq(tenantOrders.tenantId, this.tenantId),
      gte(tenantOrders.createdAt, from),
      lte(tenantOrders.createdAt, to),
      eq(tenantOrders.paymentStatus, "paid"),
      sql`${tenantOrders.fulfillmentStatus} != 'cancelled'`,
    ];
    if (locationId) {
      conditions.push(eq(tenantOrders.locationId, locationId));
    }

    const orders = await this.transaction
      .select({
        id: tenantOrders.id,
        total: tenantOrders.total,
        discountTotal: tenantOrders.discountTotal,
      })
      .from(tenantOrders)
      .where(and(...conditions));

    const discountedOrders: Array<{ total: string; discountTotal: string }> = [];
    const fullPriceOrders: Array<{ total: string }> = [];

    for (const order of orders) {
      const discountCents = parseMoneyToCents(order.discountTotal ?? "0.00");
      if (discountCents > BigInt(0)) {
        discountedOrders.push({
          total: order.total,
          discountTotal: order.discountTotal ?? "0.00",
        });
      } else {
        fullPriceOrders.push({
          total: order.total,
        });
      }
    }

    const totalOrdersCount = orders.length;
    const discountedOrdersCount = discountedOrders.length;
    const fullPriceOrdersCount = fullPriceOrders.length;

    const discountAdoptionRate =
      totalOrdersCount > 0
        ? Number(((discountedOrdersCount / totalOrdersCount) * 100).toFixed(1))
        : 0;

    const totalDiscountsApplied =
      discountedOrders.length > 0
        ? centsToMoneyString(
            discountedOrders.reduce(
              (acc, o) => acc + parseMoneyToCents(o.discountTotal),
              BigInt(0),
            ),
          )
        : "0.00";

    const discountedRevenue =
      discountedOrders.length > 0
        ? centsToMoneyString(
            discountedOrders.reduce(
              (acc, o) => acc + parseMoneyToCents(o.total),
              BigInt(0),
            ),
          )
        : "0.00";

    const fullPriceRevenue =
      fullPriceOrders.length > 0
        ? centsToMoneyString(
            fullPriceOrders.reduce(
              (acc, o) => acc + parseMoneyToCents(o.total),
              BigInt(0),
            ),
          )
        : "0.00";

    const discountedAvgTicket =
      discountedOrdersCount > 0
        ? centsToMoneyString(
            parseMoneyToCents(discountedRevenue) / BigInt(discountedOrdersCount),
          )
        : "0.00";

    const fullPriceAvgTicket =
      fullPriceOrdersCount > 0
        ? centsToMoneyString(
            parseMoneyToCents(fullPriceRevenue) / BigInt(fullPriceOrdersCount),
          )
        : "0.00";

    const discountedCents = parseMoneyToCents(discountedAvgTicket);
    const fullPriceCents = parseMoneyToCents(fullPriceAvgTicket);
    const diffCents = discountedCents - fullPriceCents;
    const differenceAmount = centsToMoneyString(diffCents);

    const differencePercent =
      fullPriceCents > BigInt(0)
        ? Number(
            (
              (Number(diffCents) / Number(fullPriceCents)) *
              100
            ).toFixed(1),
          )
        : 0;

    return {
      totalOrdersCount,
      discountedOrdersCount,
      fullPriceOrdersCount,
      discountAdoptionRate,
      totalDiscountsApplied,
      discountedRevenue,
      fullPriceRevenue,
      ticketComparison: {
        discountedAvgTicket,
        fullPriceAvgTicket,
        differenceAmount,
        differencePercent,
      },
    };
  }
}

