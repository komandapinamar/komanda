import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { coreSessionService } from "@/features/identity/web/authenticated-session";
import { SESSION_COOKIE_NAME } from "@/features/identity/web/session-cookie";
import { canAccess } from "@/lib/authorization/permissions";
import { createVerifiedTenantContext } from "@/lib/tenant-context/types";
import { AnalyticsService } from "@/features/analytics/application/analytics.service";
import type { DashboardAnalyticsData } from "@/features/analytics/web/analytics-types";
import { AnalyticsShell } from "@/features/tenancy/web/shells/analytics-shell";

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
    <main className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6">
      <header className="space-y-1 border-b border-separator-border pb-5">
        <p className="text-caption-1-semibold uppercase tracking-wider text-text-secondary">
          Administración · @{authority.membership.tenantSlug}
        </p>
        <h1 className="text-title-1-semibold text-text-primary">
          Analítica operativa
        </h1>
        <p className="text-body-regular text-text-secondary">
          Seguimiento de facturación, demanda horaria, tiempos de cocina y conversión.
        </p>
      </header>
      <AnalyticsShell
        tenantId={tenantId}
        initialData={initialData as DashboardAnalyticsData}
      />
    </main>
  );
}
