import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { coreSessionService } from "@/features/identity/web/authenticated-session";
import { SESSION_COOKIE_NAME } from "@/features/identity/web/session-cookie";
import { canAccess } from "@/lib/authorization/permissions";
import { createVerifiedTenantContext } from "@/lib/tenant-context/types";
import { AnalyticsService } from "@/features/analytics/application/analytics.service";
import type { DashboardAnalyticsData } from "@/features/analytics/web/analytics-types";
import AnalyticsDashboardLive from "@/features/analytics/web/AnalyticsDashboardLive";

export default async function TenantAnalyticsPage({
  params,
}: {
  params: Promise<{ tenantId: string }>;
}) {
  const { tenantId } = await params;
  const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  if (!token) redirect("/login");

  let authority;
  try {
    authority = await coreSessionService().authorizeTenant(token, tenantId);
  } catch {
    notFound();
  }

  if (!canAccess(authority.membership.role, "analytics")) {
    notFound();
  }

  const context = createVerifiedTenantContext({
    tenantId,
    correlationId: crypto.randomUUID(),
    source: "administrative",
    actor: {
      kind: "user",
      userId: authority.session.userId,
      membershipId: authority.membership.id,
      role: authority.membership.role,
    },
  });

  const initialData = await new AnalyticsService().getDashboardMetrics({
    context,
  });

  return (
    <main className="mx-auto space-y-8 px-6 py-10">
      <AnalyticsDashboardLive
        tenantId={tenantId}
        initialData={initialData as DashboardAnalyticsData}
        tenantPreset={authority.membership.tenantPreset ?? "gastronomy"}
      />
    </main>
  );
}
