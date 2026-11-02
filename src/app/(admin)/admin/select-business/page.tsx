import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { coreSessionService } from "@/features/identity/web/authenticated-session";
import { SESSION_COOKIE_NAME } from "@/features/identity/web/session-cookie";
import { PublicTenantService } from "@/features/tenancy/application/public-tenant.service";
import { canAccess } from "@/lib/authorization/permissions";

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
    <main className="min-h-dvh bg-[#141416] px-4 py-12 text-[#f4f3f1] antialiased sm:px-6">
      <section className="mx-auto max-w-4xl space-y-8">
        <header className="space-y-1 border-b border-white/[0.08] pb-6">
          <p className="komanda-logo font-sans text-2xl font-normal tracking-tighter text-white normal-case">
            Komanda Business
          </p>
          <h1 className="text-3xl font-medium tracking-tight text-[#f4f3f1]">
            Seleccioná un negocio
          </h1>
          <p className="text-sm text-[#c2c2cc]">
            El contexto elegido limita todos los datos y operaciones del panel.
          </p>
        </header>
        <div className="grid gap-4">
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
            const statusClass = isListed
              ? "border-emerald-400/30 bg-emerald-500/15 text-emerald-300"
              : membership.tenantStatus === "onboarding"
                ? "border-amber-400/30 bg-amber-500/15 text-amber-300"
                : "border-white/12 bg-white/[0.04] text-[#c2c2cc]";

            return (
              <Link
                key={membership.tenantId}
                href={href}
                className="liquid-prism-ring liquid-glass-card flex items-center justify-between gap-4 rounded-3xl p-6 transition hover:-translate-y-0.5"
              >
                <div>
                  <span className="block text-xl font-medium tracking-tight text-[#f4f3f1]">
                    {membership.tenantName}
                  </span>
                  <span className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-[#c2c2cc]">
                    <span>@{membership.tenantSlug}</span>
                    <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${statusClass}`}>
                      {statusLabel}
                    </span>
                  </span>
                  {!isListed && membership.tenantStatus === "active" ? (
                    <span className="mt-1.5 block text-xs text-[#c2c2cc]">
                      No aparece en la página principal.
                    </span>
                  ) : null}
                </div>
                <span className="rounded-full border border-white/15 bg-white/[0.06] px-3.5 py-1 text-xs font-medium text-[#f4f3f1]">
                  {membership.tenantPreset === "express_retail" ? "Express Retail" : "Gastronomía"}
                </span>
              </Link>
            );
          })}
          {memberships.length === 0 ? (
            <p className="liquid-glass-card rounded-3xl p-6 text-sm text-[#c2c2cc]">
              No hay membresías activas disponibles.
            </p>
          ) : null}
        </div>

        <div className="pt-2">
          <Link
            href="/register"
            className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-full bg-[#f4f3f1] px-6 text-sm font-medium text-[#141416] transition hover:bg-white"
          >
            <span>Registrar un nuevo negocio</span>
            <span aria-hidden="true">→</span>
          </Link>
        </div>
      </section>
    </main>
  );
}
