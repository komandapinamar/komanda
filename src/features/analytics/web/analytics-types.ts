import type {
  CustomerRecurrenceSummary,
  KitchenDelaysSummary,
  PeakHoursHeatmap,
  PromotionsSummary,
  UnconvertedProduct,
} from "../domain/analytics.schemas";

export type DashboardAnalyticsData = {
  dateRange: {
    from: string;
    to: string;
    granularity: "hour" | "day" | "week" | "month";
  };
  dwell: {
    totalSessions: number;
    avgDwellSeconds: number;
    maxDwellSeconds: number;
    bounceSessions: number;
    cartCreatedSessions: number;
    orderPlacedSessions: number;
    bounceRate: number;
    conversionRate: number;
  };
  dwellTimeline: Array<{
    bucket: string;
    sessions: number;
    avgDwellSeconds: number;
    orders: number;
  }>;
  financial: {
    totalRevenue: string;
    subtotal: string;
    totalDiscounts: string;
    paidOrdersCount: number;
    avgOrderValue: string;
    revenueBySource: Array<{
      source: string;
      revenue: string;
      orders: number;
    }>;
    netCollections?: string;
    mpWaterfall?: {
      grossAmount: string;
      feeAmount: string;
      taxesAmount: string;
      refundsAmount: string;
      netReceivedAmount: string;
      pendingReleaseAmount: string;
      releasedAmount: string;
      effectiveDeductionRate: string;
      isFeeInclusiveOfTax: boolean;
      releaseSchedule: Array<{
        mpPaymentId: string;
        amount: string;
        expectedAt: string | null;
      }>;
    };
    cashLedger?: {
      depositsAmount: string;
      withdrawalsAmount: string;
      netCashAmount: string;
      movementsCount: number;
      recentMovements: Array<{
        id: string;
        orderId: string;
        type: "sale_deposit" | "cancellation_withdrawal";
        amount: string;
        occurredAt: string;
      }>;
    };
  };
  revenueTimeline: Array<{
    bucket: string;
    revenue: string;
    ordersCount: number;
  }>;
  topProducts: {
    byQuantity: Array<{
      productName: string;
      sourceItemId: string | null;
      sourceComboId: string | null;
      categoryName: string | null;
      totalQuantity: number;
      totalRevenue: string;
    }>;
    byRevenue: Array<{
      productName: string;
      sourceItemId: string | null;
      sourceComboId: string | null;
      categoryName: string | null;
      totalQuantity: number;
      totalRevenue: string;
    }>;
  };
  kitchenDelays?: KitchenDelaysSummary;
  peakHoursHeatmap?: PeakHoursHeatmap;
  unconvertedProducts?: UnconvertedProduct[];
  customerRecurrence?: CustomerRecurrenceSummary;
  promotions?: PromotionsSummary;
  tenderBreakdown?: Array<{
    tender: string;
    revenue: string;
    ordersCount: number;
  }>;
  currentCashShift?: {
    id: string;
    openingBalance: string;
    expectedCash: string;
    currentCashSales: string;
    status: string;
    openedAt: string;
  } | null;
};

export type DatePreset = "today" | "7d" | "30d" | "month" | "custom";

