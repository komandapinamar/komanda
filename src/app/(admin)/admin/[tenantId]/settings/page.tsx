import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { coreSessionService } from "@/features/identity/web/authenticated-session";
import { SESSION_COOKIE_NAME } from "@/features/identity/web/session-cookie";
import { canAccess } from "@/lib/authorization/permissions";
import { TenantSettingsService } from "@/features/tenancy/application/tenant-settings.service";
import { TenantReadinessService } from "@/features/tenancy/application/tenant-readiness.service";
import { TenantSettingsPanel } from "@/features/tenancy/web/TenantSettingsPanel";
import { TenantActivationPanel } from "@/features/tenancy/web/TenantActivationPanel";
import { MercadoPagoIntegrationService } from "@/features/payments/application/integration.service";
import { MercadoPagoIntegrationPanel } from "@/features/payments/web/MercadoPagoIntegrationPanel";
import { createVerifiedTenantContext } from "@/lib/tenant-context/types";

const readinessLabels: Record<string, string> = {
  public_slug: "Identificador público",
  primary_location: "Sede principal",
  currency: "Moneda operativa",
  published_item: "Primer producto publicado",
  payment_connected: "Mercado Pago conectado",
  print_agent_connected: "Agente de impresión conectado",
};

export default async function TenantSettingsPage({
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

  const [settings, mpStatus, readiness] = await Promise.all([
    new TenantSettingsService().get(context),
    new MercadoPagoIntegrationService().getStatus(context),
    new TenantReadinessService().get(authority.session, authority.membership),
  ]);

  return (
    <main className="mx-auto max-w-4xl space-y-8 px-6 py-10">
      <section className="space-y-4">
        <h2 className="text-xl font-semibold">Preparación operativa</h2>
        <ul className="grid gap-3 sm:grid-cols-2">
          {readiness.checks.map((check) => (
            <li
              key={check.code}
              className="rounded-lg border border-zinc-800 bg-zinc-900 p-5"
            >
              <div className="flex items-center justify-between gap-4">
                <span>{readinessLabels[check.code] ?? check.code}</span>
                <span
                  className={
                    check.complete ? "text-emerald-400" : "text-(--color-accent-tertiary)"
                  }
                >
                  {check.complete ? "Listo" : "Pendiente"}
                </span>
              </div>
              {!check.requiredForActivation ? (
                <p className="mt-2 text-xs text-zinc-500">Opcional</p>
              ) : null}
            </li>
          ))}
        </ul>
        {authority.membership.tenantStatus === "onboarding" ? (
          <>
            <p className="text-sm text-zinc-400">
              {readiness.ready
                ? "Todos los requisitos obligatorios están completos."
                : "Las ventas permanecen deshabilitadas hasta completar todos los requisitos obligatorios."}
            </p>
            <TenantActivationPanel tenantId={tenantId} ready={readiness.ready} />
          </>
        ) : readiness.ready ? (
          <p className="text-sm text-zinc-400">
            El negocio está operativo y listo para recibir pedidos online.
          </p>
        ) : (
          <p className="rounded-md border border-amber-500/20 bg-amber-500/10 p-3 text-sm text-amber-300">
            Pedidos online no disponibles: completá los requisitos pendientes (ej. conectar Mercado Pago) para figurar en el directorio público y habilitar el checkout.
          </p>
        )}
      </section>

      <TenantSettingsPanel initialSettings={settings} />

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">Mercado Pago</h2>
        <p className="text-sm text-zinc-400">
          La conexión se realiza solo por OAuth. Los tokens no se muestran
          después de guardarse.
        </p>
        <MercadoPagoIntegrationPanel
          tenantId={tenantId}
          initialStatus={mpStatus}
        />
      </section>

      <section className="rounded-lg border border-zinc-800 bg-zinc-900 p-5">
        <h2 className="text-xl font-semibold">Impresión</h2>
        <p className="mt-2 text-sm text-zinc-400">
          Enrolá agentes para reclamar tickets solo de este negocio y sede.
        </p>
        <a
          href={`/admin/${tenantId}/integrations/printing`}
          className="mt-4 inline-flex rounded-md bg-(--color-accent-tertiary) px-4 py-2 text-sm font-semibold text-zinc-950"
        >
          Configurar impresión
        </a>
      </section>
    </main>
  );
}
