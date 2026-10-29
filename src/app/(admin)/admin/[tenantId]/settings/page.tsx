import { cookies } from "next/headers";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { coreSessionService } from "@/features/identity/web/authenticated-session";
import { SESSION_COOKIE_NAME } from "@/features/identity/web/session-cookie";
import { canAccess } from "@/lib/authorization/permissions";
import { TenantSettingsService } from "@/features/tenancy/application/tenant-settings.service";
import { TenantReadinessService } from "@/features/tenancy/application/tenant-readiness.service";
import { SettingsShell } from "@/features/tenancy/web/shells/settings-shell";
import { TenantActivationPanel } from "@/features/tenancy/web/TenantActivationPanel";
import { MercadoPagoIntegrationService } from "@/features/payments/application/integration.service";
import { MercadoPagoIntegrationPanel } from "@/features/payments/web/MercadoPagoIntegrationPanel";
import { DangerZone } from "@/features/tenancy/web/DangerZone";
import type { MercadoPagoOutcome } from "@/features/payments/web/mercado-pago-outcome";
import {
  MERCADO_PAGO_CONNECTED_MESSAGE,
  mercadoPagoFailureMessage,
  mercadoPagoReasonFromValue,
} from "@/features/payments/web/mercado-pago-outcome";
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
  public_slug: "Identificador único de la tienda en la URL pública.",
  primary_location:
    "Confirmá la dirección y coordenadas en el mapa del local.",
  currency: "Moneda en la que se expresan los precios del catálogo.",
  published_item: "Creá y publicá al menos un producto activo en el catálogo.",
  payment_connected: "Vinculá tu cuenta de Mercado Pago para cobros online.",
  print_agent_connected: "Conectá Komanda Desktop para imprimir comandas.",
};

function readinessActionForCheck(
  code: string,
  tenantId: string,
  complete: boolean,
): { href: string; label: string } {
  switch (code) {
    case "public_slug":
      return {
        href: "#datos-generales",
        label: complete ? "Ver datos" : "Completar datos",
      };
    case "primary_location":
      return {
        href: "#ubicacion-sede",
        label: complete ? "Editar ubicación" : "Confirmar ubicación",
      };
    case "currency":
      return {
        href: "#datos-generales",
        label: complete ? "Ver moneda" : "Configurar moneda",
      };
    case "published_item":
      return {
        href: `/admin/${tenantId}/catalog`,
        label: complete ? "Ir al catálogo" : "Publicar producto",
      };
    case "payment_connected":
      return {
        href: "#mercado-pago",
        label: complete ? "Gestionar cuenta" : "Conectar Mercado Pago",
      };
    case "print_agent_connected":
      return {
        href: `/admin/${tenantId}/integrations/printing`,
        label: complete ? "Gestionar impresora" : "Vincular impresora",
      };
    default:
      return {
        href: "#datos-generales",
        label: "Ir al apartado",
      };
  }
}

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function mercadoPagoOutcomeFromQuery(
  status: string | undefined,
  reason: string | undefined,
): MercadoPagoOutcome | null {
  if (status === "connected") {
    return { kind: "success", message: MERCADO_PAGO_CONNECTED_MESSAGE };
  }
  if (status !== "error") return null;
  return {
    kind: "error",
    message: mercadoPagoFailureMessage(
      mercadoPagoReasonFromValue(reason) ?? "failed",
    ),
  };
}

export default async function TenantSettingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenantId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { tenantId } = await params;
  const query = (await searchParams) ?? {};
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

  const mercadoPagoOutcome = mercadoPagoOutcomeFromQuery(
    firstValue(query.mercadopago),
    firstValue(query.reason),
  );

  return (
    <main className="mx-auto max-w-5xl space-y-8 px-4 py-8 sm:px-6">
      <header className="flex flex-col justify-between gap-4 border-b border-white/[0.08] pb-6 sm:flex-row sm:items-end">
        <div className="space-y-1">
          <p className="text-xs font-medium uppercase tracking-widest text-[#c2c2cc]">
            Administración · @{authority.membership.tenantSlug}
          </p>
          <h1 className="text-3xl font-medium tracking-tight text-[#f4f3f1]">
            Configuración del negocio
          </h1>
          <p className="text-sm text-[#c2c2cc]">
            Gestioná el estado operativo, ubicación, horarios, cobros e
            impresión desde un solo lugar.
          </p>
        </div>

        <nav className="flex flex-wrap gap-2 text-xs">
          <a
            href="#estado-del-negocio"
            className="rounded-full border border-white/12 bg-white/[0.04] px-3.5 py-1.5 font-medium text-[#d4d4dc] transition hover:bg-white/[0.1] hover:text-white"
          >
            Estado
          </a>
          <a
            href="#datos-generales"
            className="rounded-full border border-white/12 bg-white/[0.04] px-3.5 py-1.5 font-medium text-[#d4d4dc] transition hover:bg-white/[0.1] hover:text-white"
          >
            Datos y Horarios
          </a>
          <a
            href="#ubicacion-sede"
            className="rounded-full border border-white/12 bg-white/[0.04] px-3.5 py-1.5 font-medium text-[#d4d4dc] transition hover:bg-white/[0.1] hover:text-white"
          >
            Ubicación
          </a>
          <a
            href="#mercado-pago"
            className="rounded-full border border-white/12 bg-white/[0.04] px-3.5 py-1.5 font-medium text-[#d4d4dc] transition hover:bg-white/[0.1] hover:text-white"
          >
            Mercado Pago
          </a>
          <a
            href="#impresion"
            className="rounded-full border border-white/12 bg-white/[0.04] px-3.5 py-1.5 font-medium text-[#d4d4dc] transition hover:bg-white/[0.1] hover:text-white"
          >
            Impresión
          </a>
        </nav>
      </header>

      {/* 1. ESTADO DEL NEGOCIO & CHECKLIST DE ACTIVACIÓN CON CTAs */}
      <section
        id="estado-del-negocio"
        className="liquid-prism-ring liquid-glass-card scroll-mt-24 rounded-3xl p-6 sm:p-7 space-y-5"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-medium tracking-tight text-[#f4f3f1]">
              Estado del negocio
            </h2>
            <p className="mt-0.5 text-xs text-[#c2c2cc]">
              Cada requisito cuenta con un acceso directo al apartado donde se
              configura.
            </p>
          </div>
          <span
            className={`inline-flex items-center gap-2 rounded-full border px-3.5 py-1 text-xs font-medium ${
              readiness.ready
                ? "border-emerald-400/30 bg-emerald-500/15 text-emerald-300"
                : "border-amber-400/30 bg-amber-500/15 text-amber-300"
            }`}
          >
            <span
              className={`size-2 rounded-full ${
                readiness.ready ? "bg-emerald-400" : "bg-amber-400"
              }`}
            />
            {readiness.ready ? "Listo" : "Pendiente"}
          </span>
        </div>

        <ul className="divide-y divide-white/[0.08] overflow-hidden rounded-2xl border border-white/12 bg-[#101013]/90">
          {readiness.checks.map((check) => {
            const action = readinessActionForCheck(
              check.code,
              tenantId,
              check.complete,
            );
            const isInternalAnchor = action.href.startsWith("#");
            return (
              <li
                key={check.code}
                className="flex flex-col justify-between gap-3 px-4 py-3.5 sm:flex-row sm:items-center sm:px-5"
              >
                <div className="flex items-start gap-3">
                  <span
                    aria-hidden
                    className={`mt-1.5 flex size-2.5 shrink-0 rounded-full ${
                      check.complete ? "bg-emerald-400" : "bg-amber-400"
                    }`}
                  />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium text-[#f4f3f1]">
                        {readinessLabels[check.code] ?? check.code}
                      </span>
                      {!check.requiredForActivation ? (
                        <span className="rounded-full border border-white/12 bg-white/[0.04] px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-[#c2c2cc]">
                          Opcional
                        </span>
                      ) : null}
                      <span
                        className={`text-[11px] font-medium ${
                          check.complete
                            ? "text-emerald-400"
                            : "text-amber-300"
                        }`}
                      >
                        {check.complete ? "Completado" : "Por completar"}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-[#c2c2cc]">
                      {readinessHints[check.code]}
                    </p>
                  </div>
                </div>

                {isInternalAnchor ? (
                  <a
                    href={action.href}
                    className={`inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-full px-3.5 text-xs font-medium transition ${
                      check.complete
                        ? "border border-white/15 bg-white/[0.05] text-[#f4f3f1] hover:bg-white/[0.12]"
                        : "bg-[#f4f3f1] text-[#141416] hover:bg-white"
                    }`}
                  >
                    <span>{action.label}</span>
                    <span aria-hidden="true">→</span>
                  </a>
                ) : (
                  <Link
                    href={action.href}
                    className={`inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-full px-3.5 text-xs font-medium transition ${
                      check.complete
                        ? "border border-white/15 bg-white/[0.05] text-[#f4f3f1] hover:bg-white/[0.12]"
                        : "bg-[#f4f3f1] text-[#141416] hover:bg-white"
                    }`}
                  >
                    <span>{action.label}</span>
                    <span aria-hidden="true">→</span>
                  </Link>
                )}
              </li>
            );
          })}
        </ul>

        {authority.membership.tenantStatus === "onboarding" ? (
          <div className="flex flex-col justify-between gap-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:flex-row sm:items-center">
            <p className="text-sm text-[#d4d4dc]">
              {readiness.ready
                ? "Todos los requisitos obligatorios están completos. Activá las ventas para publicar el negocio."
                : "Las ventas permanecen deshabilitadas hasta completar todos los requisitos obligatorios."}
            </p>
            <TenantActivationPanel
              tenantId={tenantId}
              ready={readiness.ready}
            />
          </div>
        ) : readiness.ready ? (
          <div className="flex items-center gap-2.5 rounded-2xl border border-emerald-400/25 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
            <span>✓</span>
            <span>
              El negocio está operativo y listo para recibir pedidos online.
            </span>
          </div>
        ) : (
          <div className="rounded-2xl border border-amber-400/25 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
            Pedidos online no disponibles: completá los requisitos pendientes
            (ej. conectar Mercado Pago) para figurar en el directorio público y
            habilitar el checkout.
          </div>
        )}
      </section>

      {/* 2. DATOS GENERALES, UBICACIÓN Y HORARIOS */}
      <section
        id="datos-generales"
        className="liquid-glass-card scroll-mt-24 rounded-3xl p-6 sm:p-7 space-y-6"
      >
        <div className="border-b border-white/[0.08] pb-4">
          <h2 className="text-xl font-medium tracking-tight text-[#f4f3f1]">
            Datos operativos, ubicación y horarios
          </h2>
          <p className="mt-0.5 text-xs text-[#c2c2cc]">
            Información de contacto, moneda (`{settings.currency}`), mapa de la
            sede y horarios de apertura.
          </p>
        </div>
        <SettingsShell initialSettings={settings} />
      </section>

      {/* 3. MERCADO PAGO & IMPRESIÓN EN GRILLA */}
      <div className="grid gap-6 lg:grid-cols-2">
        <section
          id="mercado-pago"
          className="liquid-glass-card scroll-mt-24 flex flex-col justify-between rounded-3xl p-6 sm:p-7 space-y-4"
        >
          <div className="space-y-1">
            <h2 className="text-xl font-medium tracking-tight text-[#f4f3f1]">
              Mercado Pago
            </h2>
            <p className="text-xs text-[#c2c2cc]">
              Conectá tu cuenta para cobrar pedidos online y con QR.
            </p>
          </div>
          <MercadoPagoIntegrationPanel
            tenantId={tenantId}
            initialStatus={mpStatus}
            outcome={mercadoPagoOutcome}
          />
        </section>

        <section
          id="impresion"
          className="liquid-glass-card scroll-mt-24 flex flex-col justify-between rounded-3xl p-6 sm:p-7 space-y-4"
        >
          <div className="space-y-1">
            <h2 className="text-xl font-medium tracking-tight text-[#f4f3f1]">
              Agente de impresión térmica
            </h2>
            <p className="text-xs text-[#c2c2cc]">
              Vinculá Komanda Desktop para imprimir tickets y comandas ESC/POS
              automáticamente en tu local.
            </p>
          </div>
          <div className="pt-2">
            <Link
              href={`/admin/${tenantId}/integrations/printing`}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-full bg-[#f4f3f1] px-5 text-sm font-medium text-[#141416] transition hover:bg-white"
            >
              <span>Configurar impresión</span>
              <span aria-hidden="true">→</span>
            </Link>
          </div>
        </section>
      </div>

      {/* 4. ZONA DE PELIGRO */}
      {authority.membership.role === "owner" ? (
        <section id="zona-peligro" className="pt-2">
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
