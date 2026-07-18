import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { CatalogService } from "@/features/catalog/application/catalog.service";
import { coreSessionService } from "@/features/identity/web/authenticated-session";
import { SESSION_COOKIE_NAME } from "@/features/identity/web/session-cookie";
import { AdminDirectOrderForm } from "@/features/admin-panel/components/AdminDirectOrderForm";
import { createVerifiedTenantContext } from "@/lib/tenant-context/types";

export default async function NewDirectOrderPage({
  params,
}: {
  params: Promise<{ tenantId: string }>;
}) {
  const { tenantId } = await params;
  const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  if (!token) redirect("/admin");
  let authority;
  try {
    authority = await coreSessionService().authorizeTenant(token, tenantId);
  } catch {
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
    <main className="mx-auto max-w-4xl space-y-8 px-6 py-10">
      <header>
        <p className="text-sm uppercase tracking-[0.2em] text-amber-400">
          Operación
        </p>
        <h1 className="mt-2 text-3xl font-semibold">Nuevo pedido directo</h1>
        <p className="mt-2 text-zinc-400">
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
