import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { coreSessionService } from "@/features/identity/web/authenticated-session";
import { SESSION_COOKIE_NAME } from "@/features/identity/web/session-cookie";
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

            return (
              <Link
                key={membership.tenantId}
                href={href}
                className="rounded-lg border border-zinc-800 bg-zinc-900 p-5 transition hover:border-[var(--color-accent-tertiary)] flex items-center justify-between"
              >
                <div>
                  <span className="block text-lg font-medium">{membership.tenantName}</span>
                  <span className="text-sm text-zinc-400">{membership.tenantSlug} · {membership.tenantStatus}</span>
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
