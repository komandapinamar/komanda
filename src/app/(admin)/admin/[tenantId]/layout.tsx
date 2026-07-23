import Link from "next/link";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { coreSessionService } from "@/features/identity/web/authenticated-session";
import { SESSION_COOKIE_NAME } from "@/features/identity/web/session-cookie";
import { canAccess } from "@/lib/authorization/permissions";

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
    <div className="min-h-dvh bg-zinc-950 text-zinc-100">
      <header className="border-b border-zinc-800 bg-zinc-900">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-6 px-6 py-4">
          <div>
            <p className="font-semibold">{authority.membership.tenantName.toUpperCase()}</p>
          </div>
          <nav className="flex items-center gap-4 text-sm">
            {canAccess(authority.membership.role, "estado") && (
              <Link href={`/admin/${tenantId}/onboarding`}>Estado</Link>
            )}
            {canAccess(authority.membership.role, "pedidos") && (
              <Link href={`/admin/${tenantId}/orders`}>Pedidos</Link>
            )}
            {canAccess(authority.membership.role, "catalog") && (
              <Link href={`/admin/${tenantId}/catalog`}>Catálogo</Link>
            )}
            {canAccess(authority.membership.role, "configuracion") && (
              <Link href={`/admin/${tenantId}/settings`}>Configuración</Link>
            )}
            {canAccess(authority.membership.role, "integraciones") && (
              <Link href={`/admin/${tenantId}/integrations`}>Integraciones</Link>
            )}
            {canAccess(authority.membership.role, "members") && (
              <Link href={`/admin/${tenantId}/members`}>Miembros</Link>
            )}
            <Link href="/admin/select-business" className="text-amber-400">Cambiar negocio</Link>
          </nav>
        </div>
      </header>
      {children}
    </div>
  );
}
