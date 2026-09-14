import { z } from "zod";

export const deviceTypeSchema = z.enum(["mobile", "tablet", "desktop", "unknown"]);

export const recordStorefrontSessionSchema = z.object({
  sessionKey: z.string().min(1).max(128),
  deviceType: deviceTypeSchema.default("unknown"),
  dwellTimeSeconds: z.number().int().min(0).max(86400),
  categoryDwellMap: z.record(z.string(), z.number().int().nonnegative()).default({}),
  itemViewsMap: z.record(z.string(), z.number().int().nonnegative()).default({}),
  cartCreated: z.boolean().default(false),
  orderPlaced: z.boolean().default(false),
  associatedOrderId: z.string().uuid().optional().nullable(),
});

export type RecordStorefrontSessionInput = z.infer<typeof recordStorefrontSessionSchema>;

export const analyticsDateFilterSchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  granularity: z.enum(["hour", "day", "week", "month"]).default("day"),
  categoryId: z.string().uuid().optional(),
  source: z.enum(["all", "mercadopago_webhook", "admin_direct"]).default("all"),
});

export type AnalyticsDateFilterInput = z.infer<typeof analyticsDateFilterSchema>;

export const cashMovementTypeSchema = z.enum([
  "sale_deposit",
  "cancellation_withdrawal",
]);
export type CashMovementType = z.infer<typeof cashMovementTypeSchema>;

export const cashMovementSchema = z.object({
  id: z.string().uuid(),
  orderId: z.string().uuid(),
  type: cashMovementTypeSchema,
  amount: z.string(),
  occurredAt: z.string(),
});
export type CashMovement = z.infer<typeof cashMovementSchema>;

export const cashLedgerSummarySchema = z.object({
  depositsAmount: z.string(),
  withdrawalsAmount: z.string(),
  netCashAmount: z.string(), // M-54
  movementsCount: z.number().int().nonnegative(),
  recentMovements: z.array(cashMovementSchema),
});
export type CashLedgerSummary = z.infer<typeof cashLedgerSummarySchema>;

export const mpWaterfallReleaseItemSchema = z.object({
  mpPaymentId: z.string(),
  amount: z.string(),
  expectedAt: z.string().nullable(),
});

export const mpWaterfallSchema = z.object({
  grossAmount: z.string(),
  feeAmount: z.string(),
  taxesAmount: z.string(),
  refundsAmount: z.string(),
  netReceivedAmount: z.string(),
  pendingReleaseAmount: z.string(), // M-56
  releasedAmount: z.string(),
  effectiveDeductionRate: z.string(), // M-52
  isFeeInclusiveOfTax: z.boolean(),
  releaseSchedule: z.array(mpWaterfallReleaseItemSchema),
});
export type MpWaterfall = z.infer<typeof mpWaterfallSchema>;

export const revenueBySourceItemSchema = z.object({
  source: z.string(),
  revenue: z.string(),
  orders: z.number().int().nonnegative(),
});

export const financialSummarySchema = z.object({
  totalRevenue: z.string(),
  subtotal: z.string(),
  totalDiscounts: z.string(),
  paidOrdersCount: z.number().int().nonnegative(),
  avgOrderValue: z.string(),
  revenueBySource: z.array(revenueBySourceItemSchema),
  netCollections: z.string(), // M-53
  mpWaterfall: mpWaterfallSchema,
  cashLedger: cashLedgerSummarySchema,
});
export type FinancialSummary = z.infer<typeof financialSummarySchema>;

export const telemetryItemEventSchema = z.object({
  itemId: z.string().uuid(),
  surface: z.enum(["classic", "reels"]),
  eventType: z.enum(["impression", "qualified_view", "dwell_heartbeat", "cart_add"]),
  dwellDurationMs: z.number().int().nonnegative().default(0),
  exposureId: z.string().max(128).optional(),
  occurredAt: z.string().datetime().optional(),
});
export type TelemetryItemEvent = z.infer<typeof telemetryItemEventSchema>;

export const ingestTelemetryBatchSchema = z.object({
  sessionId: z.string().min(1).max(128),
  events: z.array(telemetryItemEventSchema).min(1).max(100),
});
export type IngestTelemetryBatchInput = z.infer<typeof ingestTelemetryBatchSchema>;

export const percentileMetricsSchema = z.object({
  p50: z.number().nonnegative(),
  p90: z.number().nonnegative(),
  sampleSize: z.number().int().nonnegative(),
});
export type PercentileMetrics = z.infer<typeof percentileMetricsSchema>;

export const pendingKitchenOrderSchema = z.object({
  orderId: z.string().uuid(),
  purchaseNumber: z.number().int().or(z.string()),
  fulfillmentStatus: z.enum(["approved", "preparing"]),
  waitingAgeMinutes: z.number().int().nonnegative(),
  enteredAt: z.string(),
  total: z.string(),
});
export type PendingKitchenOrder = z.infer<typeof pendingKitchenOrderSchema>;

export const kitchenDelaysSummarySchema = z.object({
  waitingMinutes: percentileMetricsSchema,
  preparationMinutes: percentileMetricsSchema,
  totalTimeMinutes: percentileMetricsSchema,
  pendingOrders: z.array(pendingKitchenOrderSchema),
  cancelledBeforeCookingCount: z.number().int().nonnegative(),
});
export type KitchenDelaysSummary = z.infer<typeof kitchenDelaysSummarySchema>;

export const peakHoursHeatmapCellSchema = z.object({
  dayOfWeek: z.number().int().min(0).max(6),
  dayName: z.string(),
  hour: z.number().int().min(0).max(23),
  orderCount: z.number().int().nonnegative(),
  revenue: z.string(),
  isPeak: z.boolean().default(false),
});
export type PeakHoursHeatmapCell = z.infer<typeof peakHoursHeatmapCellSchema>;

export const peakHoursHeatmapSchema = z.object({
  cells: z.array(peakHoursHeatmapCellSchema),
  maxOrdersInSlot: z.number().int().nonnegative(),
  busiestDay: z.string().nullable().optional(),
  busiestHour: z.number().int().nullable().optional(),
});
export type PeakHoursHeatmap = z.infer<typeof peakHoursHeatmapSchema>;

export const unconvertedProductSuggestionSchema = z.enum([
  "Probar foto nueva",
  "Revisar precio",
  "Falta foto en carta",
]);
export type UnconvertedProductSuggestion = z.infer<typeof unconvertedProductSuggestionSchema>;

export const unconvertedProductSchema = z.object({
  itemId: z.string().uuid(),
  productName: z.string(),
  categoryName: z.string().nullable().optional(),
  imageUrl: z.string().nullable().optional(),
  price: z.string().optional(),
  qualifiedViews: z.number().int().nonnegative(),
  purchasesCount: z.number().int().nonnegative(),
  conversionRate: z.number().nonnegative(),
  suggestion: z.string(),
});
export type UnconvertedProduct = z.infer<typeof unconvertedProductSchema>;

export function extractCustomerIdentifier(
  snapshot: Record<string, unknown> | null | undefined,
): string | null {
  if (!snapshot || typeof snapshot !== "object") return null;

  // 1. Email check (top-level or inside payer, skipping empty/whitespace)
  const topEmail = typeof snapshot.email === "string" ? snapshot.email.trim() : "";
  const payerEmail = typeof (snapshot.payer as Record<string, unknown> | undefined)?.email === "string"
    ? ((snapshot.payer as Record<string, unknown>).email as string).trim()
    : "";
  const rawEmail = topEmail || payerEmail;

  if (rawEmail) {
    const normalized = rawEmail.toLowerCase();
    const parts = normalized.split("@");
    if (parts.length === 2 && parts[0].length > 0 && parts[1].includes(".")) {
      return `email:${normalized}`;
    }
  }

  // 2. Phone check (top-level string/number, object { number }, or inside payer)
  let rawPhone: unknown = snapshot.phone;
  if (!rawPhone && snapshot.payer && typeof snapshot.payer === "object") {
    rawPhone = (snapshot.payer as Record<string, unknown>).phone;
  }
  if (
    rawPhone &&
    typeof rawPhone === "object" &&
    "number" in (rawPhone as Record<string, unknown>)
  ) {
    rawPhone = (rawPhone as Record<string, unknown>).number;
  }
  const phoneStr = typeof rawPhone === "string" ? rawPhone : typeof rawPhone === "number" ? String(rawPhone) : null;
  if (phoneStr) {
    const digitsOnly = phoneStr.replace(/\D/g, "");
    if (digitsOnly.length >= 6) {
      return `phone:${digitsOnly}`;
    }
  }

  return null;
}

export const customerSegmentMetricsSchema = z.object({
  customerCount: z.number().int().nonnegative(),
  orderCount: z.number().int().nonnegative(),
  totalRevenue: z.string(),
  avgTicket: z.string(),
});
export type CustomerSegmentMetrics = z.infer<typeof customerSegmentMetricsSchema>;

export const customerRecurrenceSummarySchema = z.object({
  totalCustomers: z.number().int().nonnegative(),
  firstTimeCustomers: z.number().int().nonnegative(),
  recurrentCustomers: z.number().int().nonnegative(),
  repeatRate: z.number().nonnegative(),
  orderFrequency: z.number().nonnegative(),
  medianDaysBetweenOrders: z.number().nullable(),
  medianDaysDisplay: z.string(),
  identityCoverageRate: z.number().nonnegative(),
  identifiedOrdersCount: z.number().int().nonnegative(),
  unidentifiedOrdersCount: z.number().int().nonnegative(),
  totalOrdersCount: z.number().int().nonnegative(),
  segments: z.object({
    firstTime: customerSegmentMetricsSchema,
    recurrent: customerSegmentMetricsSchema,
    unidentified: customerSegmentMetricsSchema,
  }),
});
export type CustomerRecurrenceSummary = z.infer<typeof customerRecurrenceSummarySchema>;

export const ticketComparisonSchema = z.object({
  discountedAvgTicket: z.string(),
  fullPriceAvgTicket: z.string(),
  differenceAmount: z.string(),
  differencePercent: z.number(),
});
export type TicketComparison = z.infer<typeof ticketComparisonSchema>;

export const promotionsSummarySchema = z.object({
  totalOrdersCount: z.number().int().nonnegative(),
  discountedOrdersCount: z.number().int().nonnegative(),
  fullPriceOrdersCount: z.number().int().nonnegative(),
  discountAdoptionRate: z.number().nonnegative(),
  totalDiscountsApplied: z.string(),
  discountedRevenue: z.string(),
  fullPriceRevenue: z.string(),
  ticketComparison: ticketComparisonSchema,
});
export type PromotionsSummary = z.infer<typeof promotionsSummarySchema>;


