import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { coreSessionService } from "@/features/identity/web/authenticated-session";
import { SESSION_COOKIE_NAME } from "@/features/identity/web/session-cookie";
import { TenantPresetProvider } from "@/features/tenancy/web/tenant-preset-context";
import { AdminNavShell } from "@/features/tenancy/web/shells/admin-nav-shell";
import { ButtonLink } from "@/components/base/buttons/button";
import { Chip } from "@/components/base/badges/chip";
import { StatusDot } from "@/components/base/badges/status-dot";

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
      <div className="min-h-[calc(100dvh-3.5rem)] bg-background-full text-text-primary antialiased">
        <header className="sticky top-0 z-40 border-b border-separator-border bg-background-secondary-default/95 backdrop-blur-md shadow-card">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
            <div className="flex items-center gap-2.5">
              <p className="komanda-logo font-sans text-xl font-normal tracking-tighter text-white normal-case sm:text-2xl">
                <span className="sm:hidden">Kda</span>
                <span className="hidden sm:inline">Komanda Business</span>
              </p>
              <Chip variant="caption" color="neutral" className="hidden gap-1.5 sm:inline-flex">
                <StatusDot color="green" />
                <span>@{authority.membership.tenantSlug}</span>
              </Chip>
            </div>
            <AdminNavShell
              tenantId={tenantId}
              role={authority.membership.role}
              switchBusiness={
                <ButtonLink
                  href="/admin/select-business"
                  variant="secondary"
                  size="small"
                >
                  Cambiar negocio
                </ButtonLink>
              }
            />
          </div>
        </header>
        {children}
      </div>
    </TenantPresetProvider>
  );
}
