import type { Category, Combo, MenuItem } from "@/types/types";

const STRAPI_URL = process.env.STRAPI_URL;
const STRAPI_FULL_ACCESS_TOKEN = process.env.STRAPI_FULL_ACCESS_TOKEN;
const STRAPI_HEADERS = {
  Authorization: `Bearer ${STRAPI_FULL_ACCESS_TOKEN}`,
};

// could be on .env but I'm not planning on chaging routes anytime soon
// it is the strapi route
const menuItemPopulate =
  "populate[image]=true&populate[category]=true&populate[combos][populate][image]=true&populate[combos][populate][category]=true";
const itemsRoute = `/api/menu-items?${menuItemPopulate}`;

const categoryPopulate =
  "populate[menu_items][populate][image]=true&populate[menu_items][populate][category]=true&populate[menu_items][populate][combos][populate][image]=true&populate[combos][populate][image]=true";
const categoriesRoute = `/api/categories?${categoryPopulate}`;

function menuItemPath(documentId: string): string {
  return `/api/menu-items/${documentId}?${menuItemPopulate}`;
}

type StrapiMedia = {
  url?: string;
} | string | null | undefined;

type StrapiCategory = {
  documentId: string;
  name: string;
} | null;

type StrapiCombo = {
  documentId: string;
  name: string;
  price: number | string;
  description: string | null;
  image?: string;
  category?: StrapiCategory;
};

type StrapiMenuItem = {
  documentId: string;
  name: string;
  price: number | string;
  description: string | null;
  image: string;
  category?: StrapiCategory;
  combos?: StrapiCombo[] | null;
};

type MenuItemsResponse = {
  data: StrapiMenuItem[];
};

type MenuItemResponse = {
  data: StrapiMenuItem;
};

type StrapiCategoriesResponse = {
  data: Array<{
    documentId: string;
    name: string;
    menu_items?: StrapiMenuItem[] | { data: StrapiMenuItem[] } | null;
    combos?: StrapiCombo[] | { data: StrapiCombo[] } | null;
  }>;
};

// this makes sure that the image is a string and not an object
function toMediaUrl(image: StrapiMedia): string {
  if (!image) return "";
  const url = typeof image === "string" ? image : image?.url;
  return url ? `${STRAPI_URL}${url}` : "";
}

function mapCategory(entry?: StrapiCategory): Category | null {
  if (!entry) {
    return null;
  }

  return {
    documentId: entry.documentId,
    name: entry.name,
    menu_items: null,
    combos: null,
  };
}

function mapCombo(entry: StrapiCombo): Combo {
  return {
    documentId: entry.documentId,
    name: entry.name,
    price: Number(entry.price),
    description: entry.description,
    image: toMediaUrl(entry.image),
    category: mapCategory(entry.category),
    menu_items: null,
  };
}

function mapStrapiMenuItem(entry: StrapiMenuItem): MenuItem {
  return {
    documentId: entry.documentId,
    name: entry.name,
    price: Number(entry.price),
    description: entry.description,
    image: toMediaUrl(entry.image),
    category: mapCategory(entry.category),
    combos: entry.combos?.map(mapCombo) ?? null,
  };
}

async function fetchStrapiMenu<T>(
  path: string,
  errorMessage: string,
  options?: RequestInit,
): Promise<T> {
  const response = await fetch(`${STRAPI_URL}${path}`, {
    ...options,
    headers: {
      ...STRAPI_HEADERS,
      ...(options?.headers ?? {}),
    },
  });

  if (!response.ok) {
    throw new Error(errorMessage);
  }

  return (await response.json()) as T;
}

export async function getMenuItems(): Promise<MenuItem[]> {
  const data = await fetchStrapiMenu<MenuItemsResponse>(
    itemsRoute,
    "Failed to fetch menu items",
    { next: { revalidate: 60 } },
  );
  return data.data.map(mapStrapiMenuItem);
}

function toArray<T>(value: T[] | { data: T[] } | null | undefined): T[] {
  if (!value) return [];
  return Array.isArray(value) ? value : value.data ?? [];
}

export async function getCategories(): Promise<Category[]> {
  const data = await fetchStrapiMenu<StrapiCategoriesResponse>(
    categoriesRoute,
    "Failed to fetch categories",
    { next: { revalidate: 60 } },
  );

  return data.data.map((cat) => {
    const items = toArray(cat.menu_items).map(mapStrapiMenuItem);
    const combos = toArray(cat.combos).map(mapCombo);

    return {
      documentId: cat.documentId,
      name: cat.name,
      menu_items: items.length > 0 ? items : null,
      combos: combos.length > 0 ? combos : null,
    };
  });
}

// resolve a single menu item using Strapi's v5 document identifier.
export async function getMenuItem(documentId: string): Promise<MenuItem> {
  const data = await fetchStrapiMenu<MenuItemResponse>(
    menuItemPath(documentId),
    `Failed to fetch menu item with documentId ${documentId}`,
    { cache: "no-store" },
  );

  return mapStrapiMenuItem(data.data);
}
