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
  published_item: "Al menos un producto publicado",
  payment_connected: "Mercado Pago",
};

const readinessHints: Record<string, string> = {
  public_slug: "Identificador único de la tienda en la URL pública.",
  primary_location:
    "Confirmá la dirección y coordenadas en el mapa del local.",
  published_item: "Creá y publicá al menos un producto activo en el catálogo.",
  payment_connected: "Vinculá tu cuenta de Mercado Pago para cobros online.",
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
    <main className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6">
      <header className="flex flex-col justify-between gap-4 border-b border-separator-border pb-5 sm:flex-row sm:items-end">
        <div className="space-y-1">
          <p className="text-caption-1-semibold uppercase tracking-wider text-text-secondary">
            Administración · @{authority.membership.tenantSlug}
          </p>
          <h1 className="text-title-1-semibold text-text-primary">
            Configuración del negocio
          </h1>
          <p className="text-body-regular text-text-secondary">
            Gestioná el estado operativo, ubicación, horarios, cobros e
            impresión desde un solo lugar.
          </p>
        </div>

        <nav className="flex flex-wrap gap-1.5 rounded-2lg bg-background-secondary-default p-1">
          <a
            href="#estado-del-negocio"
            className="rounded-lg px-3 py-1.5 text-body-2-medium text-text-secondary transition hover:bg-background-primary-hover hover:text-text-primary"
          >
            Estado
          </a>
          <a
            href="#datos-generales"
            className="rounded-lg px-3 py-1.5 text-body-2-medium text-text-secondary transition hover:bg-background-primary-hover hover:text-text-primary"
          >
            Datos y Horarios
          </a>
          <a
            href="#ubicacion-sede"
            className="rounded-lg px-3 py-1.5 text-body-2-medium text-text-secondary transition hover:bg-background-primary-hover hover:text-text-primary"
          >
            Ubicación
          </a>
          <a
            href="#mercado-pago"
            className="rounded-lg px-3 py-1.5 text-body-2-medium text-text-secondary transition hover:bg-background-primary-hover hover:text-text-primary"
          >
            Mercado Pago
          </a>
          <a
            href="#impresion"
            className="rounded-lg px-3 py-1.5 text-body-2-medium text-text-secondary transition hover:bg-background-primary-hover hover:text-text-primary"
          >
            Impresión
          </a>
        </nav>
      </header>

      {/* 1. ESTADO DEL NEGOCIO & CHECKLIST DE ACTIVACIÓN CON CTAs */}
      <section
        id="estado-del-negocio"
        className="scroll-mt-24 space-y-5 rounded-2xl border border-border-component-detail-container bg-background-secondary-default p-6 shadow-card sm:p-7"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-title-3-semibold text-text-primary">
              Estado del negocio
            </h2>
            <p className="mt-0.5 text-body-2-regular text-text-secondary">
              Cada requisito cuenta con un acceso directo al apartado donde se
              configura.
            </p>
          </div>
          <span
            className={`inline-flex items-center gap-2 rounded-md px-2.5 py-1 text-caption-1-semibold ${
              readiness.ready
                ? "bg-status-lime-background text-status-lime-text"
                : "bg-status-yellow-background text-status-yellow-text"
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

        <ul className="divide-y divide-separator-border overflow-hidden rounded-2lg border border-border-button-default bg-background-primary-default/50">
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
                      <span className="text-body-medium text-text-primary">
                        {readinessLabels[check.code] ?? check.code}
                      </span>
                      {!check.requiredForActivation ? (
                        <span className="rounded-sm bg-background-tertiary-default px-1.5 py-0.5 text-caption-2-semibold uppercase text-text-secondary">
                          Opcional
                        </span>
                      ) : null}
                      <span
                        className={`text-caption-1-medium ${
                          check.complete
                            ? "text-status-lime-text"
                            : "text-status-yellow-text"
                        }`}
                      >
                        {check.complete ? "Completado" : "Por completar"}
                      </span>
                    </div>
                    <p className="mt-0.5 text-caption-1-regular text-text-secondary">
                      {readinessHints[check.code]}
                    </p>
                  </div>
                </div>

                {isInternalAnchor ? (
                  <a
                    href={action.href}
                    className={`inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-lg px-3 text-body-2-medium transition ${
                      check.complete
                        ? "border border-border-button-default bg-background-primary-default text-text-primary hover:bg-background-primary-hover"
                        : "bg-button-primary text-text-white shadow-xs"
                    }`}
                  >
                    <span>{action.label}</span>
                    <span aria-hidden="true">→</span>
                  </a>
                ) : (
                  <Link
                    href={action.href}
                    className={`inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-lg px-3 text-body-2-medium transition ${
                      check.complete
                        ? "border border-border-button-default bg-background-primary-default text-text-primary hover:bg-background-primary-hover"
                        : "bg-button-primary text-text-white shadow-xs"
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
          <div className="flex flex-col justify-between gap-4 rounded-2lg border border-border-button-default bg-background-primary-default/50 p-4 sm:flex-row sm:items-center">
            <p className="text-body-regular text-text-secondary">
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
          <div className="flex items-center gap-2.5 rounded-2lg border border-emerald-500/30 bg-status-lime-background px-4 py-3 text-body-medium text-status-lime-text">
            <span>✓</span>
            <span>
              El negocio está operativo y listo para recibir pedidos online.
            </span>
          </div>
        ) : (
          <div className="rounded-2lg border border-amber-500/30 bg-status-yellow-background px-4 py-3 text-body-medium text-status-yellow-text">
            Pedidos online no disponibles: completá los requisitos pendientes
            (ej. conectar Mercado Pago) para figurar en el directorio público y
            habilitar el checkout.
          </div>
        )}
      </section>

      {/* 2. DATOS GENERALES, UBICACIÓN Y HORARIOS */}
      <section
        id="datos-generales"
        className="scroll-mt-24 space-y-6 rounded-2xl border border-border-component-detail-container bg-background-secondary-default p-6 shadow-card sm:p-7"
      >
        <div className="border-b border-separator-border pb-4">
          <h2 className="text-title-3-semibold text-text-primary">
            Datos operativos, ubicación y horarios
          </h2>
          <p className="mt-0.5 text-body-2-regular text-text-secondary">
            Información de contacto, mapa de la sede y horarios de apertura.
          </p>
        </div>
        <SettingsShell initialSettings={settings} />
      </section>

      {/* 3. MERCADO PAGO & IMPRESIÓN EN GRILLA */}
      <div className="grid gap-6 lg:grid-cols-2">
        <section
          id="mercado-pago"
          className="scroll-mt-24 flex flex-col justify-between space-y-4 rounded-2xl border border-border-component-detail-container bg-background-secondary-default p-6 shadow-card sm:p-7"
        >
          <div className="space-y-1">
            <h2 className="text-title-3-semibold text-text-primary">
              Mercado Pago
            </h2>
            <p className="text-body-2-regular text-text-secondary">
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
          className="scroll-mt-24 flex flex-col justify-between space-y-4 rounded-2xl border border-border-component-detail-container bg-background-secondary-default p-6 shadow-card sm:p-7"
        >
          <div className="space-y-1">
            <h2 className="text-title-3-semibold text-text-primary">
              Agente de impresión térmica
            </h2>
            <p className="text-body-2-regular text-text-secondary">
              Vinculá Komanda Desktop para imprimir tickets y comandas ESC/POS
              automáticamente en tu local.
            </p>
          </div>
          <div className="pt-2">
            <Link
              href={`/admin/${tenantId}/integrations/printing`}
              className="bg-button-primary button-press-motion inline-flex h-9 items-center justify-center gap-1.5 rounded-2lg px-4 text-body-medium text-text-white shadow-xs"
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
