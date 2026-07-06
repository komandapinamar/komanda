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
          })
          .strict(),
      )
      .min(1)
      .max(100),
  })
  .strict();

export type CartSelection = z.infer<typeof createCartSchema>["lines"][number];

export type RevalidationCatalog = {
  status: "draft" | "active" | "unavailable" | "archived";
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
  const [whole, fraction] = value.split(".");
  return Number(whole) * 100 + Number(fraction);
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
    options,
    unitPriceCents:
      moneyToCents(catalog.price) +
      options.reduce((sum, option) => sum + moneyToCents(option.priceDelta), 0),
  };
}
