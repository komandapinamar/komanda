import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { coreSessionService } from "@/features/identity/web/authenticated-session";
import { SESSION_COOKIE_NAME } from "@/features/identity/web/session-cookie";
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
  if (authority.membership.role !== "owner") {
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
    <main className="mx-auto max-w-4xl space-y-8 px-6 py-10">
      <header>
        <p className="text-sm uppercase text-amber-400">Miembros</p>
        <h1 className="mt-2 text-3xl font-semibold">Gestión de miembros</h1>
        <p className="mt-2 text-zinc-400">
          Agregá, cambiá roles y revocá miembros de tu negocio.
        </p>
      </header>
      <MemberManager tenantId={tenantId} initialMembers={members} />
    </main>
  );
}
