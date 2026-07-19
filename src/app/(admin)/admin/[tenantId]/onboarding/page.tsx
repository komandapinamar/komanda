import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { coreSessionService } from "@/features/identity/web/authenticated-session";
import { SESSION_COOKIE_NAME } from "@/features/identity/web/session-cookie";
import { TenantReadinessService } from "@/features/tenancy/application/tenant-readiness.service";
import { TenantActivationPanel } from "@/features/tenancy/web/TenantActivationPanel";

const labels: Record<string, string> = {
  identity_verified: "Identidad verificada",
  public_slug: "Identificador público",
  primary_location: "Sede principal",
  currency: "Moneda operativa",
  published_item: "Primer producto publicado",
  payment_connected: "Mercado Pago conectado",
  print_agent_connected: "Agente de impresión conectado",
};

export default async function TenantOnboardingPage({
  params,
}: {
  params: Promise<{ tenantId: string }>;
}) {
  const { tenantId } = await params;
  const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  if (!token) redirect("/admin");
  let authority;
  try {
    authority = await coreSessionService().authorizeTenant(token, tenantId);
  } catch {
    notFound();
  }
  const readiness = await new TenantReadinessService().get(
    authority.session,
    authority.membership,
  );

  return (
    <main className="mx-auto max-w-4xl space-y-8 px-6 py-10">
      <header>
        <p className="text-sm uppercase text-amber-400">Preparación operativa</p>
        <h1 className="mt-2 text-3xl font-semibold">Antes de comenzar a vender</h1>
        <p className="mt-2 text-zinc-400">Las ventas permanecen deshabilitadas hasta completar todos los requisitos obligatorios.</p>
      </header>
      <ul className="grid gap-3 sm:grid-cols-2">
        {readiness.checks.map((check) => (
          <li key={check.code} className="rounded-lg border border-zinc-800 bg-zinc-900 p-5">
            <div className="flex items-center justify-between gap-4">
              <span>{labels[check.code] ?? check.code}</span>
              <span className={check.complete ? "text-emerald-400" : "text-amber-400"}>
                {check.complete ? "Listo" : "Pendiente"}
              </span>
            </div>
            {!check.requiredForActivation ? <p className="mt-2 text-xs text-zinc-500">Opcional</p> : null}
          </li>
        ))}
      </ul>
      <TenantActivationPanel tenantId={tenantId} ready={readiness.ready} />
    </main>
  );
}
