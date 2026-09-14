import { PublicTenantService } from "@/features/tenancy/application/public-tenant.service";
import type { Category, Combo, MenuItem } from "@/types/types";

type PublicCatalog = Awaited<ReturnType<PublicTenantService["catalog"]>>;

function mapItem(
  item: PublicCatalog["categories"][number]["items"][number],
  category: Category,
): MenuItem {
  return {
    documentId: item.id,
    name: item.name,
    price: Number(item.price),
    description: item.description,
    image: item.imageUrl ?? "",
    category,
    combos: null,
    videoUrl: item.videoUrl ?? null,
  };
}

function mapCombo(
  combo: PublicCatalog["categories"][number]["combos"][number],
  category: Category,
): Combo {
  return {
    documentId: combo.id,
    name: combo.name,
    price: Number(combo.price),
    description: combo.description,
    image: combo.imageUrl ?? "",
    category,
    menu_items: null,
  };
}

export async function getPublicCatalog(tenantSlug: string) {
  return new PublicTenantService().catalog(tenantSlug);
}

export async function getPublicTenantsDirectory() {
  return new PublicTenantService().listActiveDirectory();
}

export function transformCatalogToCategories(catalog: PublicCatalog): Category[] {
  return catalog.categories.map((source) => {
    const category: Category = {
      documentId: source.id,
      name: source.name,
      menu_items: null,
      combos: null,
    };
    const items = source.items.map((item) => mapItem(item, category));
    const combos = source.combos.map((combo) => mapCombo(combo, category));
    return {
      ...category,
      menu_items: items.length > 0 ? items : null,
      combos: combos.length > 0 ? combos : null,
    };
  });
}

export async function getTenantMenuTheme(
  tenantSlug?: string,
): Promise<"classic" | "reels"> {
  const catalog = await getPublicCatalog(requiredTenantSlug(tenantSlug));
  const theme = catalog.menuTheme ?? catalog.tenant?.menuTheme;
  return theme === "reels" ? "reels" : "classic";
}

function requiredTenantSlug(tenantSlug?: string) {
  const resolved = tenantSlug?.trim();
  if (!resolved) throw new Error("An explicit tenant slug is required.");
  return resolved;
}

export async function getCategories(tenantSlug?: string): Promise<Category[]> {
  const catalog = await getPublicCatalog(requiredTenantSlug(tenantSlug));
  return transformCatalogToCategories(catalog);
}

export async function getMenuItems(tenantSlug?: string): Promise<MenuItem[]> {
  const categories = await getCategories(tenantSlug);
  return categories.flatMap((category) => category.menu_items ?? []);
}

export async function getMenuItem(
  tenantSlugOrItemId: string,
  optionalItemId?: string,
): Promise<MenuItem> {
  const tenantSlug = optionalItemId
    ? tenantSlugOrItemId
    : requiredTenantSlug();
  const itemId = optionalItemId ?? tenantSlugOrItemId;
  const item = (await getMenuItems(tenantSlug)).find(
    ({ documentId }) => documentId === itemId,
  );
  if (!item) throw new Error("Menu item not found.");
  return item;
}
