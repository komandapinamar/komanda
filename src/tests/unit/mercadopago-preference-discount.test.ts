import { describe, expect, it } from "vitest";
import { buildMercadoPagoPreferenceItems } from "@/features/payments/application/payment-session.service";

describe("Story 3.2: Mercado Pago Preference Items with Discount", () => {
  it("preserves standard items when cart has no discount", () => {
    const cart = {
      id: "cart-1",
      currency: "ARS",
      subtotal: "10000.00",
      discountTotal: "0",
      total: "10000.00",
      lines: [
        {
          id: "line-1",
          itemId: "item-1",
          comboId: null,
          quantity: 2,
          nameSnapshot: "Burger",
          unitPriceSnapshot: "5000.00",
          lineTotal: "10000.00",
          imageUrlSnapshot: null,
          note: null,
        },
      ],
    } as unknown as Parameters<typeof buildMercadoPagoPreferenceItems>[0];

    const items = buildMercadoPagoPreferenceItems(cart);
    expect(items).toHaveLength(1);
    expect(items[0].quantity).toBe(2);
    expect(items[0].unit_price).toBe(5000);
    const sum = items.reduce((s, it) => s + it.quantity * it.unit_price, 0);
    expect(sum).toBe(10000);
  });

  it("prorates discount across items so total sum matches cart.total exactly", () => {
    const cart = {
      id: "cart-2",
      currency: "ARS",
      subtotal: "10000.00",
      discountTotal: "2000.00", // 20% OFF
      total: "8000.00",
      lines: [
        {
          id: "line-1",
          itemId: "item-1",
          comboId: null,
          quantity: 1,
          nameSnapshot: "Burger A",
          unitPriceSnapshot: "6000.00",
          lineTotal: "6000.00",
          imageUrlSnapshot: null,
          note: null,
        },
        {
          id: "line-2",
          itemId: "item-2",
          comboId: null,
          quantity: 1,
          nameSnapshot: "Drink B",
          unitPriceSnapshot: "4000.00",
          lineTotal: "4000.00",
          imageUrlSnapshot: null,
          note: null,
        },
      ],
    } as unknown as Parameters<typeof buildMercadoPagoPreferenceItems>[0];

    const items = buildMercadoPagoPreferenceItems(cart);
    expect(items).toHaveLength(2);
    const sum = items.reduce((s, it) => s + it.quantity * it.unit_price, 0);
    expect(sum).toBe(8000);
  });

  it("distributes odd cents across multiple quantities without penny drift", () => {
    const cart = {
      id: "cart-3",
      currency: "ARS",
      subtotal: "10000.00",
      discountTotal: "3333.33", // Leaves $6.666,67
      total: "6666.67",
      lines: [
        {
          id: "line-odd",
          itemId: "item-odd",
          comboId: null,
          quantity: 3,
          nameSnapshot: "Triple Item",
          unitPriceSnapshot: "3333.33",
          lineTotal: "10000.00",
          imageUrlSnapshot: null,
          note: null,
        },
      ],
    } as unknown as Parameters<typeof buildMercadoPagoPreferenceItems>[0];

    const items = buildMercadoPagoPreferenceItems(cart);
    expect(items).toHaveLength(3); // Split into 3 units
    const sum = items.reduce((s, it) => s + it.quantity * it.unit_price, 0);
    expect(sum).toBe(6666.67);
  });
});
