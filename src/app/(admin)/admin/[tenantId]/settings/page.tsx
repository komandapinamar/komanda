import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { coreSessionService } from "@/features/identity/web/authenticated-session";
import { SESSION_COOKIE_NAME } from "@/features/identity/web/session-cookie";
import { TenantSettingsService } from "@/features/tenancy/application/tenant-settings.service";
import { TenantSettingsPanel } from "@/features/tenancy/web/TenantSettingsPanel";
import { createVerifiedTenantContext } from "@/lib/tenant-context/types";

export default async function TenantSettingsPage({
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
  const settings = await new TenantSettingsService().get(context);

  return (
    <main className="mx-auto max-w-4xl space-y-8 px-6 py-10">
      <header>
        <p className="text-sm uppercase text-amber-400">
          Configuración
        </p>
        <h1 className="mt-2 text-3xl font-semibold">Operación del negocio</h1>
        <p className="mt-2 text-zinc-400">
          Los cambios usan control de versión y no habilitan ventas si faltan
          requisitos obligatorios.
        </p>
      </header>
      <TenantSettingsPanel initialSettings={settings} />
    </main>
  );
}
