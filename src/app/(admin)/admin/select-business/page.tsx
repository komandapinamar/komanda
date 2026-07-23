import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { coreSessionService } from "@/features/identity/web/authenticated-session";
import { SESSION_COOKIE_NAME } from "@/features/identity/web/session-cookie";

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
    <main className="min-h-dvh bg-zinc-950 px-6 py-12 text-zinc-100">
      <section className="mx-auto max-w-3xl space-y-6">
        <header>
          <p className="text-sm uppercase text-amber-400">Komanda</p>
          <h1 className="mt-2 text-3xl font-semibold">Seleccioná un negocio</h1>
          <p className="mt-2 text-zinc-400">El contexto elegido limita todos los datos y operaciones del panel.</p>
        </header>
        <div className="grid gap-3">
          {memberships.map((membership) => (
            <Link
              key={membership.tenantId}
              href={`/admin/${membership.tenantId}/onboarding`}
              className="rounded-lg border border-zinc-800 bg-zinc-900 p-5 transition hover:border-amber-400"
            >
              <span className="block text-lg font-medium">{membership.tenantName}</span>
              <span className="text-sm text-zinc-400">{membership.tenantSlug} · {membership.tenantStatus}</span>
            </Link>
          ))}
          {memberships.length === 0 ? (
            <p className="rounded-lg border border-zinc-800 p-5 text-zinc-400">No hay membresías activas disponibles.</p>
          ) : null}
        </div>
      </section>
    </main>
  );
}
