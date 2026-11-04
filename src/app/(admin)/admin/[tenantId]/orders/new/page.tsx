import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { CatalogService } from "@/features/catalog/application/catalog.service";
import { coreSessionService } from "@/features/identity/web/authenticated-session";
import { SESSION_COOKIE_NAME } from "@/features/identity/web/session-cookie";
import { canAccess } from "@/lib/authorization/permissions";
import { AdminDirectOrderForm } from "@/features/orders/web/AdminDirectOrderForm";
import { createVerifiedTenantContext } from "@/lib/tenant-context/types";

export default async function NewDirectOrderPage({
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

  if (!canAccess(authority.membership.role, "pedidos")) {
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

  const service = new CatalogService();
  const [items, categories] = await Promise.all([
    service.listItems(context),
    service.listCategories(context),
  ]);

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6">
      <header className="space-y-1 border-b border-separator-border pb-5">
        <p className="text-caption-1-semibold uppercase tracking-wider text-text-secondary">
          Operación · @{authority.membership.tenantSlug}
        </p>
        <h1 className="text-title-1-semibold text-text-primary">
          Nuevo pedido directo
        </h1>
        <p className="text-body-regular text-text-secondary">
          Seleccioná los productos y completá los datos del cliente para crear un pedido sin pago online.
        </p>
      </header>

      <AdminDirectOrderForm
        tenantId={tenantId}
        initialItems={items}
        initialCategories={categories}
      />
    </main>
  );
}
