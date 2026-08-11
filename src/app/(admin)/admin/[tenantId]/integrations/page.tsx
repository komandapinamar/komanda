import { cookies } from "next/headers";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { coreSessionService } from "@/features/identity/web/authenticated-session";
import { SESSION_COOKIE_NAME } from "@/features/identity/web/session-cookie";
import { MercadoPagoIntegrationService } from "@/features/payments/application/integration.service";
import { MercadoPagoIntegrationPanel } from "@/features/payments/web/MercadoPagoIntegrationPanel";
import { createVerifiedTenantContext } from "@/lib/tenant-context/types";

export default async function TenantIntegrationsPage({
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
  if (authority.membership.role !== "owner") {
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
  const status = await new MercadoPagoIntegrationService().getStatus(context);

  return (
    <main className="mx-auto max-w-4xl space-y-8 px-6 py-10">
      <header>
        <p className="text-sm uppercase text-amber-400">
          Integraciones
        </p>
        <h1 className="mt-2 text-3xl font-semibold">Mercado Pago</h1>
        <p className="mt-2 text-zinc-400">
          La conexión se realiza solo por OAuth. Los tokens no se muestran
          después de guardarse.
        </p>
      </header>
      <MercadoPagoIntegrationPanel tenantId={tenantId} initialStatus={status} />
      <section className="rounded-lg border border-zinc-800 bg-zinc-900 p-5">
        <h2 className="text-xl font-semibold">Impresión</h2>
        <p className="mt-2 text-sm text-zinc-400">
          Enrolá agentes para reclamar tickets solo de este negocio y sede.
        </p>
        <Link
          href={`/admin/${tenantId}/integrations/printing`}
          className="mt-4 inline-flex rounded-md bg-amber-400 px-4 py-2 text-sm font-semibold text-zinc-950"
        >
          Configurar impresión
        </Link>
      </section>
    </main>
  );
}
