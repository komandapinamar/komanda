import { headers } from "next/headers";
import { notFound } from "next/navigation";
import {
  getPublicCatalog,
  transformCatalogToCategories,
} from "@/features/shop/menu/services/menu.service";
import ClassicMenuView from "@/features/shop/menu/components/ClassicMenuView";
import ReelsMenuView from "@/features/shop/reels/components/ReelsMenuView";
import { PublicTenantNotFoundError } from "@/features/tenancy/application/public-tenant.service";

export const dynamic = "force-dynamic";

export default async function Order() {
  const rawTenantSlug = (await headers()).get("x-komanda-tenant-slug");
  const tenantSlug = rawTenantSlug?.trim();
  if (!tenantSlug) notFound();

  let catalog;
  try {
    catalog = await getPublicCatalog(tenantSlug);
  } catch (error) {
    if (error instanceof PublicTenantNotFoundError) {
      notFound();
    }
    throw error;
  }

  const categories = transformCatalogToCategories(catalog);
  const items = categories.flatMap((category) => category.menu_items ?? []);
  const rawTheme = catalog.menuTheme ?? catalog.tenant?.menuTheme;
  const menuTheme = rawTheme === "reels" ? "reels" : "classic";

  if (menuTheme === "reels") {
    return (
      <ReelsMenuView
        categories={categories}
        items={items}
        tenantSlug={tenantSlug}
      />
    );
  }

  return (
    <ClassicMenuView
      categories={categories}
      items={items}
      tenantSlug={tenantSlug}
    />
  );
}
