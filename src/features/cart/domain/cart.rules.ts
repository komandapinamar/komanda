import { z } from "zod";

export class CartRevalidationError extends Error {}

export const createCartSchema = z
  .object({
    lines: z
      .array(
        z
          .object({
            kind: z.enum(["item", "combo"]),
            resourceId: z.uuid(),
            quantity: z.number().int().positive().max(50),
            optionIds: z.array(z.uuid()).max(50).default([]),
            note: z.string().trim().max(500).optional(),
            confirmedUnitPrice: z.string().regex(/^\d{1,10}\.\d{2}$/).optional(),
            calculatedSubtotal: z.string().regex(/^\d{1,10}\.\d{2}$/).optional(),
          })
          .strict(),
      )
      .min(1)
      .max(100),
    discountCode: z.string().trim().optional(),
  })
  .strict();

export type CartSelection = z.infer<typeof createCartSchema>["lines"][number];

export type RevalidationCatalog = {
  status: "draft" | "active" | "unavailable" | "archived";
  itemType?: "unit" | "weighted";
  price: string;
  currency: string;
  addonGroups: Array<{
    id: string;
    minSelected: number;
    maxSelected: number;
    options: Array<{ id: string; name: string; priceDelta: string }>;
  }>;
};

export function moneyToCents(value: string) {
  const [whole, fraction = "00"] = value.split(".");
  const paddedFraction = fraction.padEnd(2, "0").slice(0, 2);
  return Number(whole) * 100 + Number(paddedFraction);
}

export function centsToMoney(value: number) {
  return `${Math.floor(value / 100)}.${String(value % 100).padStart(2, "0")}`;
}

export function revalidateCartSelection(
  selection: CartSelection,
  catalog: RevalidationCatalog,
) {
  if (catalog.status !== "active") {
    throw new CartRevalidationError("Catalog resource is unavailable.");
  }
  const catalogItemType = catalog.itemType ?? "unit";
  if (catalogItemType === "unit" && selection.calculatedSubtotal !== undefined) {
    throw new CartRevalidationError(
      "calculatedSubtotal is not allowed for unit items.",
    );
  }
  if (catalogItemType === "weighted") {
    if (!selection.calculatedSubtotal || !/^\d{1,10}\.\d{2}$/.test(selection.calculatedSubtotal)) {
      throw new CartRevalidationError(
        "calculatedSubtotal is required for weighted items.",
      );
    }
    const subtotalCents = moneyToCents(selection.calculatedSubtotal);
    if (subtotalCents <= 0) {
      throw new CartRevalidationError(
        "calculatedSubtotal must be greater than zero.",
      );
    }
    if (selection.quantity !== 1) {
      throw new CartRevalidationError(
        "Weighted items must have quantity = 1.",
      );
    }
    if (selection.optionIds.length > 0) {
      throw new CartRevalidationError(
        "Weighted items do not support options.",
      );
    }
    return {
      itemType: "weighted" as const,
      options: [],
      unitPriceCents: subtotalCents,
    };
  }
  if (
    selection.confirmedUnitPrice &&
    selection.confirmedUnitPrice !== catalog.price
  ) {
    throw new CartRevalidationError("Catalog price changed.");
  }
  const optionIds = new Set(selection.optionIds);
  const knownOptions = new Set(
    catalog.addonGroups.flatMap((group) => group.options.map(({ id }) => id)),
  );
  if ([...optionIds].some((id) => !knownOptions.has(id))) {
    throw new CartRevalidationError("Selected add-on is unavailable.");
  }
  for (const group of catalog.addonGroups) {
    const selected = group.options.filter(({ id }) => optionIds.has(id));
    if (selected.length < group.minSelected || selected.length > group.maxSelected) {
      throw new CartRevalidationError("Add-on selection is outside allowed bounds.");
    }
  }
  const options = catalog.addonGroups.flatMap((group) =>
    group.options
      .filter(({ id }) => optionIds.has(id))
      .map((option) => ({
        groupId: group.id,
        optionId: option.id,
        name: option.name,
        priceDelta: option.priceDelta,
      })),
  );
  return {
    itemType: "unit" as const,
    options,
    unitPriceCents:
      moneyToCents(catalog.price) +
      options.reduce((sum, option) => sum + moneyToCents(option.priceDelta), 0),
  };
}
