import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { coreSessionService } from "@/features/identity/web/authenticated-session";
import { SESSION_COOKIE_NAME } from "@/features/identity/web/session-cookie";
import { canAccess } from "@/lib/authorization/permissions";
import { MemberService } from "@/features/members/application/member.service";
import { MemberManager } from "@/features/members/web/MemberManager";
import { createVerifiedTenantContext } from "@/lib/tenant-context/types";

export default async function MembersPage({
  params,
}: {
  params: Promise<{ tenantId: string }>;
}) {
  const { tenantId } = await params;
  const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  if (!token) redirect("/login");
  let authority;
  try {
    authority = await coreSessionService().authorizeTenant(token, tenantId);
  } catch {
    notFound();
  }
  if (!canAccess(authority.membership.role, "members")) {
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
  const members = await new MemberService().listMembers(context);

  return (
    <main className="mx-auto max-w-5xl space-y-8 px-4 py-8 sm:px-6">
      <header className="space-y-1 border-b border-white/[0.08] pb-6">
        <p className="text-xs font-medium uppercase tracking-widest text-[#c2c2cc]">
          Administración · @{authority.membership.tenantSlug}
        </p>
        <h1 className="text-3xl font-medium tracking-tight text-[#f4f3f1]">
          Miembros del equipo
        </h1>
        <p className="text-sm text-[#c2c2cc]">
          Gestioná los accesos y permisos operativos de tu personal.
        </p>
      </header>
      <MemberManager tenantId={tenantId} initialMembers={members} />
    </main>
  );
}
