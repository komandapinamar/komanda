"use client";

import { useTenantPreset } from "@/features/tenancy/web/tenant-preset-context";
import AnalyticsDashboardLive from "@/features/analytics/web/AnalyticsDashboardLive";
import type { DashboardAnalyticsData } from "@/features/analytics/web/analytics-types";

export function AnalyticsShell({
  tenantId,
  initialData,
}: {
  tenantId: string;
  initialData: DashboardAnalyticsData;
}) {
  const { preset } = useTenantPreset();

  if (preset === "express_retail") {
    return (
      <AnalyticsDashboardLive
        tenantId={tenantId}
        initialData={initialData}
        tenantPreset="express_retail"
      />
    );
  }

  if (preset === "gastronomy") {
    return (
      <AnalyticsDashboardLive
        tenantId={tenantId}
        initialData={initialData}
        tenantPreset="gastronomy"
      />
    );
  }

  throw new Error(`[AnalyticsShell] Preset no soportado: ${preset}`);
}
