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
    <main className="mx-auto max-w-5xl space-y-8 px-4 py-8 sm:px-6">
      <header className="space-y-1 border-b border-white/[0.08] pb-6">
        <p className="text-xs font-medium uppercase tracking-widest text-[#c2c2cc]">
          Administración · @{authority.membership.tenantSlug}
        </p>
        <h1 className="text-3xl font-medium tracking-tight text-[#f4f3f1]">
          Analítica operativa
        </h1>
        <p className="text-sm text-[#c2c2cc]">
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
