import type { DashboardAnalyticsData } from "./analytics-types";

export async function fetchDashboardAnalytics(input: {
  tenantId: string;
  from?: string;
  to?: string;
  granularity?: "hour" | "day" | "week" | "month";
  categoryId?: string;
  source?: "all" | "mercadopago_webhook" | "admin_direct";
}): Promise<DashboardAnalyticsData> {
  const params = new URLSearchParams();
  if (input.from) params.set("from", input.from);
  if (input.to) params.set("to", input.to);
  if (input.granularity) params.set("granularity", input.granularity);
  if (input.categoryId) params.set("categoryId", input.categoryId);
  if (input.source && input.source !== "all") params.set("source", input.source);

  const response = await fetch(
    `/api/v1/tenants/${encodeURIComponent(input.tenantId)}/analytics?${params.toString()}`,
    {
      headers: { Accept: "application/json" },
      cache: "no-store",
    },
  );

  if (!response.ok) {
    throw new Error(`Failed to load analytics: ${response.statusText}`);
  }

  return response.json();
}
