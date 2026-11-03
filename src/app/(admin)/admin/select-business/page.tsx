import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { RiAddLine, RiArrowRightSLine } from "@remixicon/react";
import { coreSessionService } from "@/features/identity/web/authenticated-session";
import { SESSION_COOKIE_NAME } from "@/features/identity/web/session-cookie";
import { PublicTenantService } from "@/features/tenancy/application/public-tenant.service";
import { canAccess } from "@/lib/authorization/permissions";
import { ButtonLink } from "@/components/base/buttons/button";
import { Chip, type ChipColor } from "@/components/base/badges/chip";
import { StatusDot } from "@/components/base/badges/status-dot";

export default async function SelectBusinessPage() {
  const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  if (!token) redirect("/login");
  let memberships;
  try {
    memberships = await coreSessionService().listTenants(token);
  } catch {
    redirect("/login");
  }

  const directoryListing = await new PublicTenantService()
    .listDirectoryListing(memberships.map((membership) => membership.tenantId))
    .catch(() => ({}) as Record<string, boolean>);

  return (
    <main className="min-h-[calc(100dvh-4rem)] bg-background-full px-4 py-12 text-text-primary sm:px-6">
      <section className="mx-auto max-w-4xl space-y-6">
        <header className="flex flex-col justify-between gap-4 border-b border-separator-border pb-6 sm:flex-row sm:items-end">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <p className="komanda-logo font-sans text-4xl font-normal tracking-tighter text-white normal-case">
                Komanda Business
              </p>
            </div>
            <h1 className="text-title-1-semibold text-text-primary">
              Seleccioná un negocio
            </h1>
            <p className="text-body-regular text-text-secondary">
              El contexto elegido limita todos los datos y operaciones del panel.
            </p>
          </div>
          <ButtonLink href="/register" leadingIcon={RiAddLine}>
            Registrar un nuevo negocio
          </ButtonLink>
        </header>

        <div className="grid gap-3">
          {memberships.map((membership) => {
            const defaultPath = membership.tenantPreset === "express_retail" ? "analytics" : "orders";
            const href =
              canAccess(membership.role, "configuracion") && membership.tenantStatus === "onboarding"
                ? `/admin/${membership.tenantId}/settings`
                : `/admin/${membership.tenantId}/${defaultPath}`;
            const isListed = directoryListing[membership.tenantId] === true;
            const statusLabel =
              membership.tenantStatus === "suspended"
                ? "Suspendido"
                : isListed
                  ? "Activo"
                  : membership.tenantStatus === "onboarding"
                    ? "Onboarding"
                    : "No publicado";
            const chipColor: ChipColor =
              membership.tenantStatus === "suspended"
                ? "rose"
                : isListed
                  ? "lime"
                  : membership.tenantStatus === "onboarding"
                    ? "yellow"
                    : "neutral";
            const dotColor =
              membership.tenantStatus === "suspended"
                ? "rose"
                : isListed
                  ? "green"
                  : "yellow";

            return (
              <Link
                key={membership.tenantId}
                href={href}
                className="group flex items-center justify-between gap-4 rounded-2xl border border-border-component-detail-container bg-background-secondary-default p-5 shadow-card transition hover:border-border-button-hover hover:bg-background-primary-default"
              >
                <div className="space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <StatusDot color={dotColor} />
                    <span className="text-title-3-semibold text-text-primary">
                      {membership.tenantName}
                    </span>
                    <Chip variant="caption" color={chipColor}>
                      {statusLabel}
                    </Chip>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-body-2-regular text-text-secondary">
                    <span>@{membership.tenantSlug}</span>
                    {!isListed && membership.tenantStatus === "active" ? (
                      <span>· No aparece en la página principal.</span>
                    ) : null}
                  </div>
                </div>
                <div className="flex items-center gap-2.5">
                  {membership.tenantPreset === "express_retail" ? "Express" : "Gastronomía"}
                  <RiArrowRightSLine
                    className="size-5 text-foreground-icon-secondary transition-transform group-hover:translate-x-0.5 group-hover:text-foreground-icon-primary"
                    aria-hidden
                  />
                </div>
              </Link>
            );
          })}
          {memberships.length === 0 ? (
            <p className="rounded-2xl border border-border-component-detail-container bg-background-secondary-default p-6 text-body-regular text-text-secondary">
              No hay membresías activas disponibles.
            </p>
          ) : null}
        </div>
      </section>
    </main>
  );
}
