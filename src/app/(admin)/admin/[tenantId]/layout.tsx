import Link from "next/link";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { coreSessionService } from "@/features/identity/web/authenticated-session";
import { SESSION_COOKIE_NAME } from "@/features/identity/web/session-cookie";
import { canAccess } from "@/lib/authorization/permissions";
import { TenantPresetProvider } from "@/features/tenancy/web/tenant-preset-context";
import { AdminNavShell } from "@/features/tenancy/web/shells/admin-nav-shell";

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
    <TenantPresetProvider preset={authority.membership.tenantPreset ?? "gastronomy"}>
      <div className="min-h-dvh bg-black text-zinc-100">
        <header className="border-b border-zinc-800 bg-zinc-900">
          <div className="mx-auto flex items-center justify-between gap-6 px-6 py-4">
            <div>
              <p className="tracking-tighter text-2xl font-thin">
                  Komanda Business
              </p>
            </div>
            <AdminNavShell
              tenantId={tenantId}
              role={authority.membership.role}
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
    </TenantPresetProvider>
  );
}
