import Link from "next/link";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { coreSessionService } from "@/features/identity/web/authenticated-session";
import { SESSION_COOKIE_NAME } from "@/features/identity/web/session-cookie";
import { canAccess } from "@/lib/authorization/permissions";
import { TenantAdminNavLink } from "./TenantAdminNavLink";

export default async function TenantAdminLayout({
  children,
  params,
}: Readonly<{
  children: React.ReactNode;
  params: Promise<{ tenantId: string }>;
}>) {
  const { tenantId } = await params;
  const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  if (!token) redirect("/login");
  let authority;
  try {
    authority = await coreSessionService().authorizeTenant(token, tenantId);
  } catch {
    notFound();
  }

  return (
    <div className="min-h-dvh bg-black text-zinc-100">
      <header className="border-b border-zinc-800 bg-zinc-900">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-6 px-6 py-4">
          <div>
            <p className="tracking-tighter text-2xl font-thin">
                Komanda Business
            </p>
          </div>
          <nav className="flex items-center gap-4 text-sm">
            {authority.membership.tenantPreset !== "express_retail" &&
              canAccess(authority.membership.role, "pedidos") && (
                <TenantAdminNavLink href={`/admin/${tenantId}/orders`}>
                  Pedidos
                </TenantAdminNavLink>
              )}
            {canAccess(authority.membership.role, "analytics") && (
              <TenantAdminNavLink href={`/admin/${tenantId}/analytics`}>
                Analítica
              </TenantAdminNavLink>
            )}
            {canAccess(authority.membership.role, "catalog") && (
              <TenantAdminNavLink href={`/admin/${tenantId}/catalog`}>
                Catálogo
              </TenantAdminNavLink>
            )}
            {canAccess(authority.membership.role, "configuracion") && (
              <TenantAdminNavLink
                href={`/admin/${tenantId}/settings`}
                activePaths={[
                  `/admin/${tenantId}/settings`,
                  `/admin/${tenantId}/integrations`,
                ]}
              >
                Configuración
              </TenantAdminNavLink>
            )}
            {canAccess(authority.membership.role, "members") && (
              <TenantAdminNavLink href={`/admin/${tenantId}/members`}>
                Miembros
              </TenantAdminNavLink>
            )}
            <Link href="/admin/select-business" className="text-(--color-accent-tertiary)">Cambiar negocio</Link>
          </nav>
        </div>
      </header>
      {children}
    </div>
  );
}
