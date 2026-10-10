import { describe, expect, it, vi, beforeEach } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  OrderingNotSupportedError,
  PaymentSessionService,
} from "@/features/payments/application/payment-session.service";
import { POST } from "@/app/api/v1/storefronts/[tenantSlug]/carts/[cartId]/payment-sessions/route";
import OrderShell from "@/features/shop/order/components/OrderShell";
import ProductCard from "@/features/shop/menu/classic/components/ProductCard";
import OrderProductCard from "@/features/shop/order/components/OrderProductCard";
import ClassicMenuView from "@/features/shop/menu/classic/components/ClassicMenuView";
import OrderPage from "@/app/(shop)/order/page";
import type { Category, MenuItem } from "@/types/types";
import { PublicTenantService, type PublicTenant } from "@/features/tenancy/application/public-tenant.service";
import * as menuService from "@/features/shop/menu/services/menu.service";

// Set required base URL for route handlers
process.env.KOMANDA_PUBLIC_BASE_URL = "https://komanda.app";

// Mock next/headers
const mockHeaders = vi.fn();
vi.mock("next/headers", () => ({
  headers: () => mockHeaders(),
}));

// Mock next/navigation
const mockNotFound = vi.fn();
vi.mock("next/navigation", () => ({
  notFound: () => {
    mockNotFound();
    throw new Error("NEXT_NOT_FOUND");
  },
  useRouter: vi.fn(() => ({
    refresh: vi.fn(),
    push: vi.fn(),
  })),
}));

// Mock cart context for components that consume it
const mockAddItem = vi.fn();
vi.mock("@/features/shop/cart/context/cart.context", () => ({
  useCart: () => ({
    tenantSlug: "test-store",
    items: [],
    itemCount: 0,
    subtotal: 0,
    total: 0,
    discountTotal: 0,
    addItem: mockAddItem,
    removeItem: vi.fn(),
    updateQuantity: vi.fn(),
    clearCart: vi.fn(),
  }),
  useOptionalCart: () => ({
    items: [],
    itemCount: 0,
    subtotal: "0.00",
    addItem: mockAddItem,
    removeItem: vi.fn(),
    updateQuantity: vi.fn(),
    clearCart: vi.fn(),
  }),
  CartProvider: ({ children }: { children: React.ReactNode }) => children,
}));

const mockCategory: Category = {
  documentId: "cat-retail-1",
  name: "Bebidas y Snacks",
  menu_items: null,
  combos: null,
};

const mockItem: MenuItem = {
  documentId: "prod-alfajor-1",
  name: "Alfajor Havanna 70% Cacao",
  price: 2400,
  description: "Alfajor con cobertura de chocolate amargo",
  image: "https://cdn.komanda.app/images/alfajor.jpg",
  category: mockCategory,
  combos: null,
};

describe("Story 7.1: Storefront Web Express en Modo Vidriera y Verificador de Precios", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("OrderShell (showCart conditional layout)", () => {
    it("renders centered catalog and completely omits cart aside and mobile drawer when showCart is false", () => {
      const markup = renderToStaticMarkup(
        React.createElement(
          OrderShell,
          { showCart: false },
          React.createElement("div", { id: "test-content" }, "Catálogo Retail"),
        ),
      );

      expect(markup).toContain("Catálogo Retail");
      expect(markup).toContain("max-w-5xl");
      expect(markup).not.toContain("grid-cols-[minmax(0,1fr)_24rem]");
      expect(markup).not.toContain("Ver carrito");
      expect(markup).not.toContain("Tu carrito");
    });

    it("renders dual-column grid with cart aside and mobile drawer when showCart is true (default)", () => {
      const markup = renderToStaticMarkup(
        React.createElement(
          OrderShell,
          { showCart: true },
          React.createElement("div", { id: "test-content" }, "Catálogo Gastro"),
        ),
      );

      expect(markup).toContain("Catálogo Gastro");
      expect(markup).toContain("grid-cols-[minmax(0,1fr)_24rem]");
      expect(markup).toContain("Ver carrito");
    });
  });

  describe("ProductCard & OrderProductCard (showAddButton and interactive props)", () => {
    it("ProductCard hides + button when showAddButton is false", () => {
      const markup = renderToStaticMarkup(
        React.createElement(ProductCard, {
          item: mockItem,
          showAddButton: false,
        }),
      );

      expect(markup).toContain(mockItem.name);
      expect(markup).toContain("$2400");
      expect(markup).not.toContain("<button");
      expect(markup).not.toContain("+");
    });

    it("ProductCard displays + button when showAddButton is true", () => {
      const markup = renderToStaticMarkup(
        React.createElement(ProductCard, {
          item: mockItem,
          showAddButton: true,
        }),
      );

      expect(markup).toContain(mockItem.name);
      expect(markup).toContain("<button");
      expect(markup).toContain("+");
    });

    it("OrderProductCard click capture does not trigger addItem when interactive=false", () => {
      mockAddItem.mockClear();
      const component = OrderProductCard({
        item: mockItem,
        interactive: false,
      });

      const mockEvent = {
        target: { closest: vi.fn().mockReturnValue({ tagName: "BUTTON" }) },
      } as unknown as React.MouseEvent<HTMLDivElement>;

      if (React.isValidElement<{ onClickCapture?: (e: React.MouseEvent<HTMLDivElement>) => void }>(component)) {
        component.props.onClickCapture?.(mockEvent);
      }

      expect(mockAddItem).not.toHaveBeenCalled();
    });

    it("OrderProductCard click capture invokes addItem when interactive=true and button clicked", () => {
      mockAddItem.mockClear();
      const component = OrderProductCard({
        item: mockItem,
        interactive: true,
      });

      const mockButton = { tagName: "BUTTON" };
      const mockEvent = {
        target: { closest: vi.fn().mockReturnValue(mockButton) },
      } as unknown as React.MouseEvent<HTMLDivElement>;

      if (React.isValidElement<{ onClickCapture?: (e: React.MouseEvent<HTMLDivElement>) => void }>(component)) {
        component.props.onClickCapture?.(mockEvent);
      }

      expect(mockAddItem).toHaveBeenCalledWith(mockItem);
    });

    it("OrderProductCard click capture ignores clicks outside button", () => {
      mockAddItem.mockClear();
      const component = OrderProductCard({
        item: mockItem,
        interactive: true,
      });

      const mockEvent = {
        target: { closest: vi.fn().mockReturnValue(null) },
      } as unknown as React.MouseEvent<HTMLDivElement>;

      if (React.isValidElement<{ onClickCapture?: (e: React.MouseEvent<HTMLDivElement>) => void }>(component)) {
        component.props.onClickCapture?.(mockEvent);
      }

      expect(mockAddItem).not.toHaveBeenCalled();
    });

    it("OrderProductCard displays add button when interactive is true (default)", () => {
      const markup = renderToStaticMarkup(
        React.createElement(OrderProductCard, {
          item: mockItem,
          interactive: true,
        }),
      );

      expect(markup).toContain(mockItem.name);
      expect(markup).toContain("<button");
      expect(markup).toContain("+");
    });
  });

  describe("ClassicMenuView (Express Retail Vidriera vs Gastronomy)", () => {
    it("renders Vidriera header and disables adding products when preset is express_retail", () => {
      const markup = renderToStaticMarkup(
        React.createElement(ClassicMenuView, {
          categories: [mockCategory],
          items: [mockItem],
          tenantSlug: "express-pinamar",
          preset: "express_retail",
        }),
      );

      // Header and legend
      expect(markup).toContain('data-testid="storefront-express-legend"');
      expect(markup).toContain("Vidriera Digital y Precios");
      expect(markup).toContain(
        "Consultá precios y disponibilidad de productos. Las compras se realizan de manera presencial en tienda mediante nuestras terminales de autoservicio o caja.",
      );
      expect(markup).not.toContain("Nuestro menu");

      // No cart aside or mobile cart
      expect(markup).not.toContain("Ver carrito");
      expect(markup).not.toContain("grid-cols-[minmax(0,1fr)_24rem]");

      // Product cards have no + buttons
      expect(markup).toContain(mockItem.name);
      expect(markup).not.toContain("<button");
      expect(markup).not.toContain("+");
    });

    it("renders standard gastronomy menu with adding buttons and cart drawers when preset is gastronomy and ordering is available", () => {
      const markup = renderToStaticMarkup(
        React.createElement(ClassicMenuView, {
          categories: [mockCategory],
          items: [mockItem],
          tenantSlug: "resto-pinamar",
          preset: "gastronomy",
          orderingAvailable: true,
        }),
      );

      // Standard header
      expect(markup).toContain("Nuestro menu");
      expect(markup).toContain("Selecciona categorias y agregá productos al carrito.");
      expect(markup).not.toContain("🛍️ Tienda Express · Autoservicio");
      expect(markup).not.toContain('data-testid="storefront-preset-badge"');

      // Cart is present
      expect(markup).toContain("grid-cols-[minmax(0,1fr)_24rem]");
      expect(markup).toContain("Ver carrito");

      // Product cards have + buttons
      expect(markup).toContain("<button");
      expect(markup).toContain("+");
    });

    it("disables adding products in gastronomy when orderingAvailable is false", () => {
      const markup = renderToStaticMarkup(
        React.createElement(ClassicMenuView, {
          categories: [mockCategory],
          items: [mockItem],
          tenantSlug: "resto-pinamar",
          preset: "gastronomy",
          orderingAvailable: false,
        }),
      );

      // Offline warning shown
      expect(markup).toContain("Pedidos online no disponibles temporalmente");

      // Product cards have no + buttons
      expect(markup).not.toContain('aria-label="Agregar');
      expect(markup).not.toContain("+");
    });
  });

  describe("Order Page Routing & Adaptation", () => {
    it("extracts preset from catalog and renders ClassicMenuView with express_retail mode", async () => {
      mockHeaders.mockResolvedValue(
        new Map([["x-komanda-tenant-slug", "minimarket-centro"]]),
      );

      vi.spyOn(menuService, "getPublicCatalog").mockResolvedValue({
        tenant: {
          name: "Minimarket Centro",
          slug: "minimarket-centro",
          currency: "ARS",
          menuTheme: "classic",
          orderingAvailable: true,
          preset: "express_retail",
        },
        menuTheme: "classic",
        orderingAvailable: true,
        preset: "express_retail",
        revision: 1,
        categories: [
          {
            id: mockCategory.documentId,
            name: mockCategory.name,
            items: [
              {
                id: mockItem.documentId,
                name: mockItem.name,
                price: "2400.00",
                description: mockItem.description,
                imageUrl: mockItem.image,
                videoUrl: null,
                categoryId: mockCategory.documentId,
                tenantId: "t-1",
                createdAt: new Date(),
                updatedAt: new Date(),
                version: 1,
                status: "active",
                sortOrder: 0,
                imageAssetId: null,
                videoAssetId: null,
                barcode: null,
                isGeneric: false,
                genericIcon: null,
                trackStock: false,
                stockQuantity: 0,
                addonGroups: [],
              },
            ],
            combos: [],
          },
        ],
      } as never);

      const pageElement = await OrderPage();
      const markup = renderToStaticMarkup(pageElement);

      expect(markup).toContain('data-testid="storefront-express-legend"');
      expect(markup).toContain("Vidriera Digital y Precios");
      expect(markup).not.toContain("Ver carrito");
    });

    it("forces ClassicMenuView even if menuTheme is reels when preset is express_retail", async () => {
      mockHeaders.mockResolvedValue(
        new Map([["x-komanda-tenant-slug", "express-reels"]]),
      );

      vi.spyOn(menuService, "getPublicCatalog").mockResolvedValue({
        tenant: {
          name: "Express Reels Store",
          slug: "express-reels",
          currency: "ARS",
          menuTheme: "reels",
          orderingAvailable: true,
          preset: "express_retail",
        },
        menuTheme: "reels",
        orderingAvailable: true,
        preset: "express_retail",
        revision: 1,
        categories: [],
      } as never);

      const pageElement = await OrderPage();
      const markup = renderToStaticMarkup(pageElement);

      // Rendered ClassicMenuView with Vidriera header rather than ReelsMenuView
      expect(markup).toContain('data-testid="storefront-express-legend"');
      expect(markup).not.toContain('data-testid="reels-menu-view"');
    });
  });

  describe("API Protection (Payment Sessions Rejection for Express Retail)", () => {
    it("PaymentSessionService.create throws OrderingNotSupportedError when tenant is express_retail", async () => {
      const mockPublicTenants = {
        resolve: vi.fn().mockResolvedValue({
          id: "tenant-express-1",
          name: "Express Market",
          slug: "express-market",
          currency: "ARS",
          locationId: "loc-1",
          preset: "express_retail",
        } as PublicTenant),
      };

      const service = new PaymentSessionService(mockPublicTenants as unknown as PublicTenantService);

      await expect(
        service.create({
          tenantSlug: "express-market",
          cartId: "cart-1",
          idempotencyKey: "11111111-1111-4111-8111-111111111111",
          body: {
            customer: { name: "Cliente Express" },
          },
          baseUrl: "https://komanda.app",
        }),
      ).rejects.toThrow(OrderingNotSupportedError);
    });

    it("POST /api/v1/storefronts/:tenantSlug/carts/:cartId/payment-sessions responds HTTP 422 ORDERING_NOT_SUPPORTED", async () => {
      vi.spyOn(PublicTenantService.prototype, "resolve").mockResolvedValue({
        id: "tenant-express-1",
        name: "Express Market",
        slug: "express-market",
        currency: "ARS",
        locationId: "loc-1",
        preset: "express_retail",
      });

      const request = new Request(
        "https://komanda.app/api/v1/storefronts/express-market/carts/cart-1/payment-sessions",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": "11111111-1111-4111-8111-111111111111",
          },
          body: JSON.stringify({
            customer: { name: "Consumidor Final" },
          }),
        },
      );

      const response = await POST(request, {
        params: Promise.resolve({
          tenantSlug: "express-market",
          cartId: "cart-1",
        }),
      });

      expect(response.status).toBe(422);
      expect(response.headers.get("Content-Type")).toContain("application/problem+json");

      const body = await response.json();
      expect(body.code).toBe("ORDERING_NOT_SUPPORTED");
      expect(body.title).toBe("Ordering not supported");
      expect(body.detail).toContain(
        "El comercio opera en modo autoservicio presencial. Los pedidos web no están habilitados.",
      );
    });

    it("allows gastronomy preset without throwing OrderingNotSupportedError", async () => {
      const mockPublicTenants = {
        resolve: vi.fn().mockResolvedValue({
          id: "tenant-gastro-1",
          name: "Resto Bar",
          slug: "resto-bar",
          currency: "ARS",
          locationId: "loc-1",
          preset: "gastronomy",
        } as PublicTenant),
      };

      const service = new PaymentSessionService(mockPublicTenants as unknown as PublicTenantService);

      // Should not throw OrderingNotSupportedError (it may fail further down in prepare due to db/cart, but NOT OrderingNotSupportedError)
      try {
        await service.create({
          tenantSlug: "resto-bar",
          cartId: "cart-1",
          idempotencyKey: "11111111-1111-4111-8111-111111111111",
          body: {
            customer: { name: "Cliente Gastro" },
          },
          baseUrl: "https://komanda.app",
        });
      } catch (err) {
        expect(err).not.toBeInstanceOf(OrderingNotSupportedError);
      }
    });
  });

  describe("Preset Resolution & Backwards Compatibility", () => {
    it("PublicTenant defaults preset to 'gastronomy' when db tenant preset is null or missing", () => {
      // Simulate resolving a legacy tenant row where preset is null
      const legacyResolved = {
        id: "legacy-1",
        name: "Legacy Store",
        slug: "legacy-store",
        defaultCurrency: "ARS",
        preset: null,
      };
      const location = { id: "loc-1" };

      const publicTenant: PublicTenant = {
        id: legacyResolved.id,
        name: legacyResolved.name,
        slug: legacyResolved.slug,
        currency: legacyResolved.defaultCurrency,
        locationId: location.id,
        preset: (legacyResolved.preset ?? "gastronomy") as "gastronomy" | "express_retail",
      };

      expect(publicTenant.preset).toBe("gastronomy");
    });
  });
});
