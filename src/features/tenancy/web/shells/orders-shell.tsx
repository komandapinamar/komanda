"use client";

import { useTenantPreset } from "@/features/tenancy/web/tenant-preset-context";
import AdminOrdersLive from "@/features/orders/web/AdminOrdersLive";
import { ExpressOrdersLive } from "@/features/orders/web/ExpressOrdersLive";
import type { AdminDashboardOrder } from "@/types/types";

export function OrdersShell({
  tenantId,
  initialOrders,
}: {
  tenantId: string;
  initialOrders: AdminDashboardOrder[];
}) {
  const { preset } = useTenantPreset();

  if (preset === "express_retail") {
    return <ExpressOrdersLive tenantId={tenantId} initialOrders={initialOrders} />;
  }

  if (preset === "gastronomy") {
    return <AdminOrdersLive tenantId={tenantId} initialOrders={initialOrders} />;
  }

  throw new Error(`[OrdersShell] Preset no soportado: ${preset}`);
}
