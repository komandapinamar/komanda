import { and, eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { tenantLocations } from "@/db/schema";
import { withTenantTransaction } from "@/db/tenant-transaction";
import { coreSessionService } from "@/features/identity/web/authenticated-session";
import { SESSION_COOKIE_NAME } from "@/features/identity/web/session-cookie";
import { canAccess } from "@/lib/authorization/permissions";
import { PrintingIntegrationPanel } from "@/features/printing/web/PrintingIntegrationPanel";
import { createVerifiedTenantContext } from "@/lib/tenant-context/types";

export default async function TenantPrintingIntegrationPage({
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
  if (!canAccess(authority.membership.role, "configuracion")) {
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
  const [location] = await withTenantTransaction(context, (transaction) =>
    transaction
      .select({ id: tenantLocations.id })
      .from(tenantLocations)
      .where(
        and(
          eq(tenantLocations.tenantId, tenantId),
          eq(tenantLocations.isPrimary, true),
          eq(tenantLocations.status, "active"),
        ),
      )
      .limit(1),
  );
  if (!location) notFound();

  return (
    <main className="mx-auto max-w-5xl space-y-8 px-4 py-8 sm:px-6">
      <header className="space-y-1 border-b border-white/[0.08] pb-6">
        <p className="text-xs font-medium uppercase tracking-widest text-[#c2c2cc]">
          Integraciones · @{authority.membership.tenantSlug}
        </p>
        <h1 className="text-3xl font-medium tracking-tight text-[#f4f3f1]">
          Agente de impresión térmica
        </h1>
        <p className="text-sm text-[#c2c2cc]">
          Cada agente queda limitado al tenant y sede derivados de su token.
        </p>
      </header>
      <PrintingIntegrationPanel tenantId={tenantId} locationId={location.id} />
    </main>
  );
}
