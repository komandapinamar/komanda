import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const initialTenantItem = {
  documentId: "burger-classic",
  name: "Hamburguesa clasica",
  price: "8500",
  description: "Carne, queso y salsa",
  image: "/uploads/classic.jpg",
  category: { documentId: "burgers", name: "Hamburguesas" },
  combos: [],
};

describe("initial single-tenant storefront characterization", () => {
  beforeEach(() => {
    vi.stubEnv("STRAPI_URL", "https://cms.initial-tenant.test");
    vi.stubEnv("STRAPI_FULL_ACCESS_TOKEN", "characterization-token");
  });

  afterEach(() => {
    vi.resetModules();
  });

  it("loads and maps the public menu from the globally configured Strapi", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({ data: [initialTenantItem] }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { getMenuItems } = await import(
      "@/features/shop/menu/services/menu.service"
    );

    await expect(getMenuItems()).resolves.toEqual([
      expect.objectContaining({
        documentId: "burger-classic",
        name: "Hamburguesa clasica",
        price: 8500,
        image: "https://cms.initial-tenant.test/uploads/classic.jpg",
      }),
    ]);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(
        /^https:\/\/cms\.initial-tenant\.test\/api\/menu-items\?/,
      ),
      expect.objectContaining({
        headers: {
          Authorization: "Bearer characterization-token",
        },
        next: { revalidate: 60 },
      }),
    );
  });

  it("submits only item identity and quantity, then accepts the server cart totals", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({
        cartId: "cart-initial",
        currency: "ARS",
        lines: [
          {
            item_id: "burger-classic",
            quantity: 2,
            title: "Hamburguesa clasica",
            price: "8500",
            total: "17000",
          },
        ],
        subtotal: "17000",
        discountTotal: "0",
        total: "17000",
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { createCart } = await import(
      "@/features/shop/cart/services/cart.service"
    );

    const cart = await createCart([
      {
        documentId: "burger-classic",
        quantity: 2,
        name: "precio no confiable",
        unitPrice: 1,
        image: "untrusted.jpg",
      },
    ]);

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/cart",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          items: [{ documentId: "burger-classic", quantity: 2 }],
        }),
      }),
    );
    expect(cart).toEqual(
      expect.objectContaining({
        id: "cart-initial",
        currency: "ARS",
        subtotal: 17000,
        total: 17000,
      }),
    );
  });
});

describe("initial checkout and administration characterization", () => {
  it("creates an order through the single global orders route", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({
        orderId: "order-initial",
        purchaseNumber: "42",
        status: "approved",
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { createOrder } = await import(
      "@/features/shop/checkout/services/checkout.service"
    );
    const payload = {
      cartId: "cart-initial",
      customer: { name: "Cliente" },
      notes: "Sin cebolla",
    };

    await expect(createOrder(payload)).resolves.toEqual({
      id: "order-initial",
      purchaseNumber: "42",
      status: "approved",
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/orders",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify(payload),
      }),
    );
  });

  it("keeps the current admin session signed and bounded to eight hours", async () => {
    vi.stubEnv(
      "ADMIN_JWT_SECRET",
      "characterization-secret-at-least-32-bytes-long",
    );
    const {
      ADMIN_SESSION_MAX_AGE_SECONDS,
      createAdminSessionToken,
      verifyAdminSessionToken,
    } = await import("@/features/admin-panel/lib/admin-session");

    const token = await createAdminSessionToken("initial-admin");

    await expect(verifyAdminSessionToken(token)).resolves.toEqual({
      username: "initial-admin",
      role: "admin",
    });
    expect(ADMIN_SESSION_MAX_AGE_SECONDS).toBe(60 * 60 * 8);
  });
});

describe("initial payment, dashboard and print integration seams", () => {
  it("documents the global endpoints that must become tenant-qualified", async () => {
    const paymentSessionRoute = await readFile(
      resolve(process.cwd(), "app/api/payments/session/route.ts"),
      "utf8",
    );
    const paymentProvider = await readFile(
      resolve(
        process.cwd(),
        "features/shop/payments/server/mercadopago.service.ts",
      ),
      "utf8",
    );
    const dashboardStreamRoute = await readFile(
      resolve(process.cwd(), "app/api/admin/orders/stream/route.ts"),
      "utf8",
    );
    const printClaimRoute = await readFile(
      resolve(process.cwd(), "app/api/print-jobs/claim/route.ts"),
      "utf8",
    );
    const printServiceAuth = await readFile(
      resolve(
        process.cwd(),
        "features/shop/payments/server/print-service-auth.ts",
      ),
      "utf8",
    );

    expect(paymentSessionRoute).toContain("createMercadoPagoPreference");
    expect(paymentProvider).toContain("process.env.MP_ACCESS_TOKEN");
    expect(dashboardStreamRoute).toContain("getAuthenticatedAdminSession");
    expect(printClaimRoute).toContain("verifyPrintServiceRequest");
    expect(printServiceAuth).toContain("process.env.PRINT_SERVICE_TOKEN");
  });

  it("documents the initial tenant branding embedded in the print worker", async () => {
    const worker = await readFile(
      resolve(process.cwd(), "../print-service/print_worker.py"),
      "utf8",
    );

    expect(worker).toContain('printer.text("HAMBURGUESAS DE AUTOR\\n")');
    expect(worker).toContain("/api/print-jobs/claim");
  });
});
