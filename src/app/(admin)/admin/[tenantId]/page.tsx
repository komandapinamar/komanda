import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { coreSessionService } from "@/features/identity/web/authenticated-session";
import { SESSION_COOKIE_NAME } from "@/features/identity/web/session-cookie";
import { canAccess } from "@/lib/authorization/permissions";

export default async function TenantAdminIndexPage({
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

  if (
    canAccess(authority.membership.role, "estado") &&
    authority.membership.tenantStatus === "onboarding"
  ) {
    redirect(`/admin/${tenantId}/onboarding`);
  }

  if (canAccess(authority.membership.role, "pedidos")) {
    redirect(`/admin/${tenantId}/orders`);
  }

  notFound();
}
