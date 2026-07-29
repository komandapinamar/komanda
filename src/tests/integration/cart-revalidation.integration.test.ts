import { describe, expect, it } from "vitest";
import {
  CartRevalidationError,
  revalidateCartSelection,
} from "@/features/cart/domain/cart.rules";

describe("cart revalidation", () => {
  const selection = {
    kind: "item" as const,
    resourceId: "00000000-0000-4000-8000-000000000001",
    quantity: 1,
    optionIds: [] as string[],
  };

  it("rejects unavailable resources and stale customer-confirmed prices", () => {
    expect(() =>
      revalidateCartSelection(selection, {
        status: "unavailable",
        price: "10.00",
        currency: "ARS",
        addonGroups: [],
      }),
    ).toThrow(CartRevalidationError);
    expect(() =>
      revalidateCartSelection(
        { ...selection, confirmedUnitPrice: "9.00" },
        {
          status: "active",
          price: "10.00",
          currency: "ARS",
          addonGroups: [],
        },
      ),
    ).toThrow(CartRevalidationError);
  });

  it("rejects options outside their group bounds", () => {
    expect(() =>
      revalidateCartSelection(
        { ...selection, optionIds: [] },
        {
          status: "active",
          price: "10.00",
          currency: "ARS",
          addonGroups: [
            {
              id: "10000000-0000-4000-8000-000000000001",
              minSelected: 1,
              maxSelected: 1,
              options: [
                {
                  id: "20000000-0000-4000-8000-000000000001",
                  name: "Required option",
                  priceDelta: "0.00",
                },
              ],
            },
          ],
        },
      ),
    ).toThrow(CartRevalidationError);
  });
});
