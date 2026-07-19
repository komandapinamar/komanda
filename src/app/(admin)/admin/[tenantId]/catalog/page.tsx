import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { CatalogService } from "@/features/catalog/application/catalog.service";
import { CatalogEditor } from "@/features/catalog/web/CatalogEditor";
import { coreSessionService } from "@/features/identity/web/authenticated-session";
import { SESSION_COOKIE_NAME } from "@/features/identity/web/session-cookie";
import { createVerifiedTenantContext } from "@/lib/tenant-context/types";

export default async function CatalogPage({
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
  const [categories, items] = await Promise.all([
    service.listCategories(context),
    service.listItems(context),
  ]);

  return (
    <main className="mx-auto max-w-6xl space-y-8 px-6 py-10">
      <header>
        <p className="text-sm uppercase text-amber-400">
          Catálogo del negocio
        </p>
        <h1 className="mt-2 text-3xl font-semibold">Menú, adicionales y combos</h1>
        <p className="mt-2 text-zinc-400">
          Cada cambio usa control de versión; un conflicto nunca sobrescribe el
          trabajo de otro operador.
        </p>
      </header>
      <CatalogEditor
        tenantId={tenantId}
        initialCategories={categories}
        initialItems={items}
      />
    </main>
  );
}
