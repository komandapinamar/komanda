import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { CatalogService } from "@/features/catalog/application/catalog.service";
import { CatalogShell } from "@/features/tenancy/web/shells/catalog-shell";
import { coreSessionService } from "@/features/identity/web/authenticated-session";
import { SESSION_COOKIE_NAME } from "@/features/identity/web/session-cookie";
import { canAccess, canWriteCatalog } from "@/lib/authorization/permissions";
import { createVerifiedTenantContext } from "@/lib/tenant-context/types";

export default async function CatalogPage({
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
  if (!canAccess(authority.membership.role, "catalog")) {
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
  const [categories, items, addonGroups, combos] = await Promise.all([
    service.listCategories(context),
    service.listItemsWithMedia(context),
    service.listAddonGroups(context),
    service.listCombos(context),
  ]);

  const isReadOnly = !canWriteCatalog(authority.membership.role);

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6">
      <header className="space-y-1 border-b border-separator-border pb-5">
        <p className="text-caption-1-semibold uppercase tracking-wider text-text-secondary">
          Administración · @{authority.membership.tenantSlug}
        </p>
        <h1 className="text-title-1-semibold text-text-primary">
          Catálogo del negocio
        </h1>
        <p className="text-body-regular text-text-secondary">
          Organizá categorías, productos, precios, adicionales y combos publicados.
        </p>
      </header>
      <CatalogShell
        tenantId={tenantId}
        initialCategories={categories}
        initialItems={items}
        initialAddonGroups={addonGroups}
        initialCombos={combos}
        isReadOnly={isReadOnly}
      />
    </main>
  );
}
