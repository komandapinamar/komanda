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
  updatedAt?: string;
  expiresAt?: string;
};

const CART_API_BASE_PATH = "/api/cart";

function toNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeCartLine(line: unknown): OfficialCartLine {
  const source = (line ?? {}) as Record<string, unknown>;
  const unitPrice = toNumber(
    source.unitPrice ?? source.price ?? source.unit_price,
    0,
  );
  const quantity = toNumber(source.quantity, 0);

  return {
    documentId: String(
      source.documentId ??
        source.document_id ??
        source.itemId ??
        source.item_id ??
        "",
    ),
    quantity,
    name: String(source.name ?? source.title ?? "Producto"),
    unitPrice,
    lineTotal: toNumber(source.lineTotal ?? source.total, unitPrice * quantity),
    image: String(source.image ?? ""),
    available: source.available === undefined ? true : Boolean(source.available),
    note: source.note ? String(source.note) : undefined,
  };
}

function normalizeCartResponse(payload: CartApiResponse): OfficialCart {
  const lines = Array.isArray(payload.items)
    ? payload.items
    : Array.isArray(payload.lines)
      ? payload.lines
      : [];
  const items = lines.map(normalizeCartLine);
  const subtotal = toNumber(payload.subtotal, items.reduce((sum, item) => sum + item.lineTotal, 0));
  const discountTotal = toNumber(payload.discountTotal, 0);

  return {
    id: String(payload.id ?? payload.cartId ?? ""),
    currency: String(payload.currency ?? "ARS"),
    items,
    subtotal,
    discountTotal,
    total: toNumber(payload.total, subtotal - discountTotal),
    updatedAt: payload.updatedAt,
    expiresAt: payload.expiresAt,
  };
}

async function requestCart(
  path: string,
  options: RequestInit,
): Promise<OfficialCart> {
  const response = await fetch(`${CART_API_BASE_PATH}${path}`, {
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
    documentId: line.documentId,
    quantity: line.quantity,
  }));
}

export async function createCart(lines: CartSnapshotLine[]) {
  const payload = { items: buildCartSnapshot(lines) };

  return requestCart("", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function getCart(cartId: string) {
  return requestCart(`/${cartId}`, {
    method: "GET",
    cache: "no-store",
  });
}
