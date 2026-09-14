"use client";

import { useMenuAnalytics } from "./useMenuAnalytics";

export default function MenuAnalyticsTracker({
  tenantSlug,
}: {
  tenantSlug: string;
}) {
  useMenuAnalytics(tenantSlug);
  return null;
}
