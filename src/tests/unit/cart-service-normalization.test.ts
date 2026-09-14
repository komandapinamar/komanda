import { describe, expect, it } from "vitest";
import {
  normalizeCartLine,
  normalizeCartResponse,
} from "@/features/shop/cart/services/cart.service";

describe("cart.service normalization", () => {
  it("normalizes database snapshot fields correctly into OfficialCartLine", () => {
    const dbCartLine = {
      id: "line-uuid-1",
      cartId: "cart-uuid-1",
      itemId: "item-uuid-123",
      comboId: null,
      quantity: 2,
      nameSnapshot: "Hamburguesa Completa",
      unitPriceSnapshot: "4500.00",
      lineTotal: "9000.00",
      imageUrlSnapshot: "https://cdn.example.com/burger.png",
      note: "Sin cebolla",
    };

    const line = normalizeCartLine(dbCartLine);

    expect(line.documentId).toBe("item-uuid-123");
    expect(line.name).toBe("Hamburguesa Completa");
    expect(line.unitPrice).toBe(4500);
    expect(line.lineTotal).toBe(9000);
    expect(line.image).toBe("https://cdn.example.com/burger.png");
    expect(line.note).toBe("Sin cebolla");
  });

  it("normalizes a full cart response with database snapshot lines", () => {
    const rawCart = {
      id: "cart-123",
      currency: "ARS",
      lines: [
        {
          id: "line-1",
          itemId: "item-1",
          quantity: 1,
          nameSnapshot: "Papas Fritas",
          unitPriceSnapshot: "2200.00",
          lineTotal: "2200.00",
          imageUrlSnapshot: null,
        },
      ],
      subtotal: "2200.00",
      total: "2200.00",
      version: 1,
    };

    const cart = normalizeCartResponse(rawCart);

    expect(cart.id).toBe("cart-123");
    expect(cart.total).toBe(2200);
    expect(cart.items).toHaveLength(1);
    expect(cart.items[0].documentId).toBe("item-1");
    expect(cart.items[0].name).toBe("Papas Fritas");
    expect(cart.items[0].unitPrice).toBe(2200);
  });
});
