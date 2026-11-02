import { PublicTenantService } from "@/features/tenancy/application/public-tenant.service";
import type {
  Category,
  Combo,
  ComboItemSummary,
  ComboMediaSlot,
  MenuItem,
  ProductModifierGroup,
} from "@/types/types";

type PublicCatalog = Awaited<ReturnType<PublicTenantService["catalog"]>>;
type PublicCatalogItem = PublicCatalog["categories"][number]["items"][number];
type PublicCatalogCombo = PublicCatalog["categories"][number]["combos"][number];

function mapModifierGroups(
  groups: PublicCatalogItem["addonGroups"],
): ProductModifierGroup[] {
  return groups.map((group) => ({
    id: group.id,
    name: group.name,
    required: group.minSelected > 0,
    minSelect: group.minSelected,
    maxSelect: group.maxSelected,
    options: group.options.map((option) => ({
      id: option.id,
      name: option.name,
      description: option.description ?? null,
      priceDelta: Number(option.priceDelta),
    })),
  }));
}

function mapItem(
  item: PublicCatalogItem,
  category: Category,
): MenuItem {
  const modifierGroups = mapModifierGroups(item.addonGroups);

  return {
    documentId: item.id,
    name: item.name,
    price: Number(item.price),
    basePrice: Number(item.price),
    description: item.description,
    image: item.imageUrl ?? "",
    category,
    combos: null,
    videoUrl: item.videoUrl ?? null,
    hasOptions: modifierGroups.length > 0,
    modifierGroups,
  };
}

function resolveComboDetails(
  combo: PublicCatalogCombo,
  catalogItemsById: Map<string, PublicCatalogItem>,
  mappedItemsById: Map<string, MenuItem>,
) {
  const sortedLines = [...(combo.items ?? [])].sort(
    (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0),
  );
  const componentSummaries: ComboItemSummary[] = [];
  const componentMenuItems: MenuItem[] = [];
  const comboMedia: ComboMediaSlot[] = [];
  let fallbackImage = "";
  let fallbackVideoUrl: string | null = null;

  for (const line of sortedLines) {
    const rawLine = line as {
      itemId: string;
      quantity: number;
      itemName?: string | null;
      imageUrl?: string | null;
    };
    const catalogItem = catalogItemsById.get(rawLine.itemId);
    const mappedItem = mappedItemsById.get(rawLine.itemId);
    const resolvedName = rawLine.itemName ?? catalogItem?.name ?? null;
    if (resolvedName) {
      componentSummaries.push({
        itemId: rawLine.itemId,
        name: resolvedName,
        quantity: rawLine.quantity,
      });
    }
    if (mappedItem) {
      componentMenuItems.push(mappedItem);
    }
    const slotImage = rawLine.imageUrl ?? catalogItem?.imageUrl ?? null;
    const slotVideo = catalogItem?.videoUrl ?? null;
    if (slotImage || slotVideo) {
      comboMedia.push({
        itemId: rawLine.itemId,
        name: resolvedName ?? "Producto",
        quantity: rawLine.quantity,
        image: slotImage,
        videoUrl: slotVideo,
      });
    }
    if (!fallbackImage && slotImage) {
      fallbackImage = slotImage;
    }
    if (!fallbackVideoUrl && slotVideo) {
      fallbackVideoUrl = slotVideo;
    }
  }

  const includedText = componentSummaries
    .map((entry) =>
      entry.quantity > 1 ? `${entry.quantity} × ${entry.name}` : entry.name,
    )
    .join(", ");

  const cleanDescription = combo.description?.trim() || "";
  const description =
    cleanDescription && includedText
      ? `${cleanDescription} · Incluye: ${includedText}`
      : includedText
        ? `Incluye: ${includedText}`
        : cleanDescription || null;

  return {
    description,
    image: combo.imageUrl ?? fallbackImage,
    videoUrl: fallbackVideoUrl,
    componentSummaries,
    componentMenuItems,
    comboMedia,
  };
}

function mapCombo(
  combo: PublicCatalogCombo,
  category: Category,
  catalogItemsById: Map<string, PublicCatalogItem>,
  mappedItemsById: Map<string, MenuItem>,
): { combo: Combo; menuItem: MenuItem } {
  const details = resolveComboDetails(combo, catalogItemsById, mappedItemsById);

  const mappedCombo: Combo = {
    documentId: combo.id,
    name: combo.name,
    price: Number(combo.price),
    description: details.description,
    image: details.image,
    category,
    menu_items:
      details.componentMenuItems.length > 0 ? details.componentMenuItems : null,
    items: details.componentSummaries,
    comboMedia: details.comboMedia,
  };

  const comboMenuItem: MenuItem = {
    documentId: combo.id,
    kind: "combo",
    name: combo.name,
    price: Number(combo.price),
    basePrice: Number(combo.price),
    description: details.description,
    image: details.image,
    category,
    combos: null,
    videoUrl: details.videoUrl,
    comboMedia: details.comboMedia,
    hasOptions: false,
    modifierGroups: [],
  };

  return { combo: mappedCombo, menuItem: comboMenuItem };
}

export async function getPublicCatalog(tenantSlug: string) {
  return new PublicTenantService().catalog(tenantSlug);
}

export async function getPublicTenantsDirectory() {
  return new PublicTenantService().listActiveDirectory();
}

export function transformCatalogToCategories(catalog: PublicCatalog): Category[] {
  const catalogItemsById = new Map<string, PublicCatalogItem>();
  for (const source of catalog.categories) {
    for (const item of source.items) {
      catalogItemsById.set(item.id, item);
    }
  }

  const categoriesPass1 = catalog.categories.map((source) => {
    const category: Category = {
      documentId: source.id,
      name: source.name,
      menu_items: null,
      combos: null,
    };
    const items = source.items.map((item) => mapItem(item, category));
    return { source, category, items };
  });

  const mappedItemsById = new Map<string, MenuItem>();
  for (const entry of categoriesPass1) {
    for (const item of entry.items) {
      mappedItemsById.set(item.documentId, item);
    }
  }

  return categoriesPass1.map(({ source, category, items }) => {
    const mappedCombos = (source.combos ?? []).map((combo) =>
      mapCombo(combo, category, catalogItemsById, mappedItemsById),
    );
    const combos = mappedCombos.map((entry) => entry.combo);
    const comboMenuItems = mappedCombos.map((entry) => entry.menuItem);
    const allMenuItems = [...items, ...comboMenuItems];

    return {
      ...category,
      menu_items: allMenuItems.length > 0 ? allMenuItems : null,
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
