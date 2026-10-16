import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import CartItem from "@/features/shop/cart/components/item/CartItem";
import type { CartLine } from "@/types/types";

vi.mock("@/features/shop/cart/context/cart.context", () => ({
  useCart: () => ({
    addItem: vi.fn(),
    decrementItem: vi.fn(),
    removeItem: vi.fn(),
  }),
}));

const line: CartLine = {
  quantity: 2,
  item: {
    documentId: "wrap",
    name: "Wrap de pollo",
    price: 2500,
    description: null,
    image: "https://example.com/wrap.jpg",
    videoUrl: "https://example.com/wrap.mp4",
    category: null,
    combos: null,
  },
};

describe("Cart ticket product media", () => {
  it("renders a controllable inline video with the product photo as poster", () => {
    const markup = renderToStaticMarkup(createElement(CartItem, { cartLine: line }));
    expect(markup).toContain('<video');
    expect(markup).toContain('src="https://example.com/wrap.mp4"');
    expect(markup).toContain('poster="https://example.com/wrap.jpg"');
    expect(markup).toContain('controls=""');
    expect(markup).toContain('playsInline=""');
    expect(markup).not.toContain('autoPlay');
    expect(markup).toContain('2 × Wrap de pollo');
    expect(markup).toContain('$5.000');
  });

  it("shows the product photo when there is no video", () => {
    const markup = renderToStaticMarkup(createElement(CartItem, {
      cartLine: { ...line, item: { ...line.item, videoUrl: null } },
    }));
    expect(markup).not.toContain('<video');
    expect(markup).toContain('<img');
    expect(markup).toContain('alt="Wrap de pollo"');
    expect(markup).toContain('src="https://example.com/wrap.jpg"');
  });

  it("uses a placeholder without empty media sources for products without media", () => {
    const markup = renderToStaticMarkup(createElement(CartItem, {
      cartLine: { ...line, item: { ...line.item, videoUrl: null, image: "" } },
    }));
    expect(markup).toContain('Producto sin imagen');
    expect(markup).not.toContain('<video');
    expect(markup).not.toContain('<img');
    expect(markup).not.toContain('src=""');
  });
});
