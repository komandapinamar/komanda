import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { coreSessionService } from "@/features/identity/web/authenticated-session";
import { SESSION_COOKIE_NAME } from "@/features/identity/web/session-cookie";
import { canAccess } from "@/lib/authorization/permissions";
import { DiscountService } from "@/features/discounts/application/discount.service";
import { AdminDiscountsPanel } from "@/features/discounts/web/AdminDiscountsPanel";
import { createVerifiedTenantContext } from "@/lib/tenant-context/types";

export default async function DiscountsPage({
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

  if (!canAccess(authority.membership.role, "promociones")) {
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

  const { items } = await new DiscountService().listDiscounts(context);

  return (
    <main className="mx-auto space-y-8 px-6 py-10">
      <AdminDiscountsPanel tenantId={tenantId} initialDiscounts={items} />
    </main>
  );
}
