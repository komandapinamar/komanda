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
import { DangerZone } from "@/features/tenancy/web/DangerZone";
import { createVerifiedTenantContext } from "@/lib/tenant-context/types";

const readinessLabels: Record<string, string> = {
  public_slug: "Identificador público",
  primary_location: "Ubicacion de la sede",
  currency: "Moneda operativa",
  published_item: "Al menos un producto publicado",
  payment_connected: "Mercado Pago",
  print_agent_connected: "Agente de impresión conectado",
};

const readinessHints: Record<string, string> = {
  public_slug: "Definí el identificador público (URL) del negocio.",
  primary_location:
    "Confirmá la ubicación exacta en «Ubicación del local primario», más abajo.",
  currency: "Asigná la moneda operativa del negocio.",
  published_item: "Publicá al menos un producto en el catálogo.",
  payment_connected: "Conectá Mercado Pago para cobrar online.",
  print_agent_connected: "Enrolá un agente de impresión (opcional).",
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
    <main className="mx-auto max-w-4xl space-y-10 px-4 py-8 sm:px-6">
      <header className="space-y-1">
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-zinc-500">Administración</p>
        <h1 className="text-2xl font-semibold tracking-tight">Configuración</h1>
        <p className="text-sm text-zinc-400">Los datos básicos y conexiones de tu negocio.</p>
      </header>

      <section className="max-w-2xl space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">Estado del negocio</h2>
          <span className={readiness.ready ? "text-xs text-emerald-300" : "text-xs text-amber-300"}>
            {readiness.ready ? "Listo" : "Pendiente"}
          </span>
        </div>
        <ul className="divide-y divide-zinc-800/80 border-y border-zinc-800/80">
          {readiness.checks.map((check) => (
            <li key={check.code} className="flex items-start gap-3 px-4 py-2.5">
              <span
                aria-hidden
                className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                  check.complete ? "bg-emerald-400" : "bg-amber-400"
                }`}
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  <span className="text-md">
                    {readinessLabels[check.code] ?? check.code}
                  </span>
                  {!check.requiredForActivation ? (
                    <span className="rounded-full border border-zinc-700 px-2 py-0.5 text-[10px] uppercase tracking-wide text-zinc-500">
                      Opcional
                    </span>
                  ) : null}
                </div>
                {!check.complete && check.requiredForActivation ? (
                  <p className="mt-0.5 text-xs text-zinc-500">
                    {readinessHints[check.code]}
                  </p>
                ) : null}
              </div>
            </li>
          ))}
        </ul>

        {authority.membership.tenantStatus === "onboarding" ? (
          <div className="space-y-3 border-t border-zinc-800/80 pt-4">
            <p className="text-sm text-zinc-400">
              {readiness.ready
                ? "Todos los requisitos obligatorios están completos. Activá las ventas para publicar el negocio."
                : "Las ventas permanecen deshabilitadas hasta completar todos los requisitos obligatorios."}
            </p>
            <TenantActivationPanel tenantId={tenantId} ready={readiness.ready} />
          </div>
        ) : readiness.ready ? (
          <p className="text-sm text-emerald-300">
            El negocio está operativo y listo para recibir pedidos online.
          </p>
        ) : (
          <p className="text-sm text-amber-300">
            Pedidos online no disponibles: completá los requisitos pendientes (ej.
            conectar Mercado Pago) para figurar en el directorio público y habilitar
            el checkout.
          </p>
        )}
      </section>

      <section className="space-y-5">
        <div>
          <h2 className="text-base font-semibold">Datos generales</h2>
        </div>
        <TenantSettingsPanel initialSettings={settings} />
      </section>

      <section className="space-y-4 border-t border-zinc-800/80 pt-8">
        <h2 className="text-base font-semibold">Mercado Pago</h2>
        <MercadoPagoIntegrationPanel
          tenantId={tenantId}
          initialStatus={mpStatus}
        />
      </section>

      <section className="flex flex-col gap-3 border-t border-zinc-800/80 pt-8 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-base font-semibold">Impresión</h2>
          <p className="mt-1 text-sm text-zinc-400">Conectá el agente que usará este negocio.</p>
        </div>
        <a
          href={`/admin/${tenantId}/integrations/printing`}
          className="inline-flex w-fit rounded-md bg-(--color-accent-tertiary) px-4 py-2 text-sm font-semibold text-zinc-950"
        >
          Configurar impresión
        </a>
      </section>

      {authority.membership.role === "owner" ? (
        <section className="border-t border-zinc-800/80 pt-8">
          <DangerZone
            tenantId={tenantId}
            tenantName={authority.membership.tenantName}
            tenantSlug={authority.membership.tenantSlug}
            isOwner={true}
          />
        </section>
      ) : null}
    </main>
  );
}
