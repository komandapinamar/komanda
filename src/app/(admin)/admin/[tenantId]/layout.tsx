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
      <div className="min-h-dvh bg-[#141416] text-[#f4f3f1] antialiased">
        <header className="sticky top-0 z-40 border-b border-white/[0.08] bg-[#141416]/90 backdrop-blur-xl">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-6 px-4 py-3.5 sm:px-6">
            <div className="flex items-center gap-3">
              <p className="komanda-logo font-sans text-2xl font-normal tracking-tighter text-white normal-case">
                <span className="sm:hidden">Kda</span>
                <span className="hidden sm:inline">Komanda Business</span>
              </p>
              <span className="hidden rounded-full border border-white/12 bg-white/[0.04] px-2.5 py-0.5 text-[11px] font-medium text-[#c2c2cc] sm:inline-block">
                @{authority.membership.tenantSlug}
              </span>
            </div>
            <AdminNavShell
              tenantId={tenantId}
              role={authority.membership.role}
              switchBusiness={
                <Link
                  href="/admin/select-business"
                  className="inline-flex h-8 items-center justify-center rounded-full border border-white/15 bg-white/[0.05] px-3.5 text-xs font-medium text-[#f4f3f1] transition hover:bg-white/[0.12]"
                >
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
