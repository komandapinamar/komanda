import { and, eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { tenantLocations } from "@/db/schema";
import { withTenantTransaction } from "@/db/tenant-transaction";
import { coreSessionService } from "@/features/identity/web/authenticated-session";
import { SESSION_COOKIE_NAME } from "@/features/identity/web/session-cookie";
import { PrintingIntegrationPanel } from "@/features/printing/web/PrintingIntegrationPanel";
import { createVerifiedTenantContext } from "@/lib/tenant-context/types";

export default async function TenantPrintingIntegrationPage({
  params,
}: {
  params: Promise<{ tenantId: string }>;
}) {
  const { tenantId } = await params;
  const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  if (!token) redirect("/admin");
  let authority;
  try {
    authority = await coreSessionService().authorizeTenant(token, tenantId);
  } catch {
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
    <main className="mx-auto max-w-4xl space-y-8 px-6 py-10">
      <header>
        <p className="text-sm uppercase tracking-[0.2em] text-amber-400">
          Integraciones
        </p>
        <h1 className="mt-2 text-3xl font-semibold">Impresión</h1>
        <p className="mt-2 text-zinc-400">
          Cada agente queda limitado al tenant y sede derivados de su token.
        </p>
      </header>
      <PrintingIntegrationPanel tenantId={tenantId} locationId={location.id} />
    </main>
  );
}
