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
};

export type DatePreset = "today" | "7d" | "30d" | "month" | "custom";
