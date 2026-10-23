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
    <main className="min-h-dvh bg-[var(--color-accent-primary)] px-6 py-12 text-[var(--color-accent-tertiary)]">
      <section className="mx-auto max-w-3xl space-y-6">
        <header>
          <p className="text-8xl text-white tracking-tighter font-normal">Komanda Business</p>
          <h1 className="mt-2 text-3xl font-semibold">Seleccioná un negocio</h1>
          <p className="mt-2 text-zinc-400">El contexto elegido limita todos los datos y operaciones del panel.</p>
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
            const statusClass = isListed
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
              : membership.tenantStatus === "onboarding"
                ? "border-amber-500/30 bg-amber-500/10 text-amber-300"
                : "border-zinc-700 bg-zinc-800 text-zinc-400";

            return (
              <Link
                key={membership.tenantId}
                href={href}
                className="rounded-lg border border-zinc-800 bg-zinc-900 p-5 transition hover:border-[var(--color-accent-tertiary)] flex items-center justify-between"
              >
                <div>
                  <span className="block text-lg font-medium">{membership.tenantName}</span>
                  <span className="mt-1 flex flex-wrap items-center gap-2 text-sm text-zinc-400">
                    <span>{membership.tenantSlug}</span>
                    <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${statusClass}`}>
                      {statusLabel}
                    </span>
                  </span>
                  {!isListed && membership.tenantStatus === "active" ? (
                    <span className="mt-1 block text-xs text-zinc-500">
                      No aparece en la página principal.
                    </span>
                  ) : null}
                </div>
                <span className="rounded-full bg-[var(--color-accent-tertiary)]/10 border border-[var(--color-accent-tertiary)]/20 px-3 py-1 text-xs font-semibold text-[var(--color-accent-tertiary)]">
                  {membership.tenantPreset === "express_retail" ? "Express Retail" : "Gastronomía"}
                </span>
              </Link>
            );
          })}
          {memberships.length === 0 ? (
            <p className="rounded-lg border border-zinc-800 p-5 text-zinc-400">No hay membresías activas disponibles.</p>
          ) : null}
        </div>

        <div className="pt-2">
          <Link
            href="/register"
            className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-[var(--color-accent-tertiary)]/30 bg-[var(--color-accent-primary)] p-4 text-sm font-semibold text-[var(--color-accent-tertiary)] transition hover:border-[var(--color-accent-tertiary)] hover:bg-[var(--color-accent-tertiary)]/10"
          >
            <span>Registrar un nuevo negocio</span>
          </Link>
        </div>
      </section>
    </main>
  );
}
