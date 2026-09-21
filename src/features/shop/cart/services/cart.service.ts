"use client";

import type {
  CartSnapshotLine,
  OfficialCart,
  OfficialCartLine,
} from "@/types/types";

type CartApiResponse = {
  id?: string;
  cartId?: string;
  currency?: string;
  items?: unknown[];
  lines?: unknown[];
  subtotal?: number | string;
  discountTotal?: number | string;
  total?: number | string;
  version?: number | string;
  appliedDiscount?: {
    code?: string;
    name?: string;
    discountType?: string;
    discountValue?: string | number;
    savingsAmount?: string | number;
  } | null;
  discountMetadata?: {
    code?: string;
    name?: string;
    discountType?: string;
    discountValue?: string | number;
    savingsAmount?: string | number;
  } | null;
  updatedAt?: string;
  expiresAt?: string;
};

function toNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toOptionalNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function normalizeCartLine(line: unknown): OfficialCartLine {
  const source = (line ?? {}) as Record<string, unknown>;
  const unitPrice = toNumber(source.unitPrice ?? source.unitPriceSnapshot, 0);
  const quantity = toNumber(source.quantity, 0);

  return {
    documentId: String(
      source.documentId ??
        source.resourceId ??
        source.itemId ??
        source.comboId ??
        source.id ??
        "",
    ),
    quantity,
    name: String(source.name ?? source.nameSnapshot ?? "Producto"),
    unitPrice,
    lineTotal: toNumber(source.lineTotal, unitPrice * quantity),
    image: String(
      source.image ?? source.imageUrl ?? source.imageUrlSnapshot ?? "",
    ),
    available: source.available === undefined ? true : Boolean(source.available),
    note: source.note ? String(source.note) : undefined,
  };
}

export function normalizeCartResponse(payload: CartApiResponse): OfficialCart {
  const lines = Array.isArray(payload.items)
    ? payload.items
    : Array.isArray(payload.lines)
      ? payload.lines
      : [];
  const items = lines.map(normalizeCartLine);
  const subtotal = toNumber(payload.subtotal, items.reduce((sum, item) => sum + item.lineTotal, 0));
  const discountTotal = toNumber(payload.discountTotal, 0);

  const rawDiscount = payload.appliedDiscount ?? payload.discountMetadata;
  const appliedDiscount =
    rawDiscount && rawDiscount.code
      ? {
          code: String(rawDiscount.code),
          name: String(rawDiscount.name ?? rawDiscount.code),
          discountType: (rawDiscount.discountType === "fixed_amount"
            ? "fixed_amount"
            : "percentage") as "percentage" | "fixed_amount",
          discountValue: String(rawDiscount.discountValue ?? ""),
          savingsAmount:
            rawDiscount.savingsAmount !== undefined
              ? String(rawDiscount.savingsAmount)
              : undefined,
        }
      : null;

  return {
    id: String(payload.id ?? payload.cartId ?? ""),
    currency: String(payload.currency ?? "ARS"),
    items,
    subtotal,
    discountTotal,
    total: toNumber(payload.total, subtotal - discountTotal),
    appliedDiscount,
    version: toOptionalNumber(payload.version),
    updatedAt: payload.updatedAt,
    expiresAt: payload.expiresAt,
  };
}

async function requestCart(
  tenantSlug: string,
  path: string,
  options: RequestInit,
): Promise<OfficialCart> {
  const response = await fetch(`/api/v1/storefronts/${tenantSlug}/carts${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
  });

  if (!response.ok) {
    throw new Error(`Cart request failed with status ${response.status}`);
  }

  const payload = (await response.json()) as CartApiResponse;
  const cart = normalizeCartResponse(payload);

  if (!cart.id) {
    throw new Error("Cart response is missing a valid cart id.");
  }

  return cart;
}

export function buildCartSnapshot(lines: CartSnapshotLine[]) {
  return lines.map((line) => ({
    kind: "item" as const,
    resourceId: line.documentId,
    quantity: line.quantity,
    optionIds: [],
    confirmedUnitPrice: line.unitPrice.toFixed(2),
  }));
}

export async function createCart(
  tenantSlug: string,
  lines: CartSnapshotLine[],
  discountCode?: string,
) {
  const payload = {
    lines: buildCartSnapshot(lines),
    ...(discountCode ? { discountCode } : {}),
  };

  return requestCart(tenantSlug, "", {
    method: "POST",
    headers: { "Idempotency-Key": crypto.randomUUID() },
    body: JSON.stringify(payload),
  });
}

function tenantSlugFromBrowser() {
  const path = typeof window === "undefined" ? "" : window.location.pathname;
  const match = path.match(/^\/storefronts\/([^/]+)/);
  const slug = match?.[1];
  if (!slug) throw new Error("An explicit tenant storefront is required.");
  return slug;
}

export async function getCart(
  tenantSlugOrCartId: string,
  optionalCartId?: string,
) {
  const tenantSlug = optionalCartId ? tenantSlugOrCartId : tenantSlugFromBrowser();
  const cartId = optionalCartId ?? tenantSlugOrCartId;
  return requestCart(tenantSlug, `/${cartId}`, {
    method: "GET",
    cache: "no-store",
  });
}

export async function applyCartDiscount(
  tenantSlug: string,
  cartId: string,
  code: string,
): Promise<OfficialCart> {
  return requestCart(tenantSlug, `/${cartId}/discount`, {
    method: "POST",
    body: JSON.stringify({ code }),
  });
}

export async function removeCartDiscount(
  tenantSlug: string,
  cartId: string,
): Promise<OfficialCart> {
  return requestCart(tenantSlug, `/${cartId}/discount`, {
    method: "DELETE",
  });
}
