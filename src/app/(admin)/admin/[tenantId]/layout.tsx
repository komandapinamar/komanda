import Link from "next/link";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { coreSessionService } from "@/features/identity/web/authenticated-session";
import { SESSION_COOKIE_NAME } from "@/features/identity/web/session-cookie";
import { canAccess } from "@/lib/authorization/permissions";
import { TenantAdminNav } from "./TenantAdminNav";

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
          <TenantAdminNav
            items={[
              ...(authority.membership.tenantPreset !== "express_retail" && canAccess(authority.membership.role, "pedidos")
                ? [{ href: `/admin/${tenantId}/orders`, label: "Pedidos" }]
                : []),
              ...(canAccess(authority.membership.role, "analytics")
                ? [{ href: `/admin/${tenantId}/analytics`, label: "Analítica" }]
                : []),
              ...(canAccess(authority.membership.role, "catalog")
                ? [{ href: `/admin/${tenantId}/catalog`, label: "Catálogo" }]
                : []),
              ...(canAccess(authority.membership.role, "promociones")
                ? [{ href: `/admin/${tenantId}/discounts`, label: "Promociones" }]
                : []),
              ...(canAccess(authority.membership.role, "configuracion")
                ? [{
                    href: `/admin/${tenantId}/settings`,
                    label: "Configuración",
                    activePaths: [`/admin/${tenantId}/settings`, `/admin/${tenantId}/integrations`],
                  }]
                : []),
              ...(canAccess(authority.membership.role, "members")
                ? [{ href: `/admin/${tenantId}/members`, label: "Miembros" }]
                : []),
            ]}
            switchBusiness={
              <Link href="/admin/select-business" className="rounded-md px-3 py-2 text-(--color-accent-tertiary)">
                Cambiar negocio
              </Link>
            }
          />
        </div>
      </header>
      {children}
    </div>
  );
}
