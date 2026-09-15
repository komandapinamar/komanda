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
    authority.membership.tenantStatus === "onboarding"
      ? new TenantReadinessService().get(authority.session, authority.membership)
      : Promise.resolve(null),
  ]);

  return (
    <main className="mx-auto max-w-4xl space-y-8 px-6 py-10">
      <header>
        <p className="text-sm uppercase text-amber-400">
          Configuración
        </p>
        <h1 className="mt-2 text-3xl font-semibold">Operación del negocio</h1>
        <p className="mt-2 text-zinc-400">
          Estado de preparación, datos operativos, cobros con Mercado Pago e impresión.
        </p>
      </header>

      {readiness ? (
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
                      check.complete ? "text-emerald-400" : "text-amber-400"
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
          <p className="text-sm text-zinc-400">
            {readiness.ready
              ? "Todos los requisitos obligatorios están completos."
              : "Las ventas permanecen deshabilitadas hasta completar todos los requisitos obligatorios."}
          </p>
          <TenantActivationPanel tenantId={tenantId} ready={readiness.ready} />
        </section>
      ) : null}

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
