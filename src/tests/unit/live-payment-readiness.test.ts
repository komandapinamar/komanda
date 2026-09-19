import { describe, expect, it, vi } from "vitest";
import { fetchTenantReadiness } from "@/features/tenancy/application/tenant-readiness.service";
import type { TenantTransaction } from "@/db/tenant-transaction";
import { CartService, CartRevalidationError } from "@/features/cart/application/cart.service";

describe("live payment readiness and ordering availability", () => {
  it("evaluates orderingAvailable: true when tenant is active, sales enabled and MP connected", async () => {
    const tx = {
      select: vi.fn()
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValueOnce({
            where: vi.fn().mockReturnValueOnce({
              limit: vi.fn().mockResolvedValueOnce([
                {
                  id: "t1",
                  name: "T1",
                  slug: "t1",
                  normalizedSlug: "t1",
                  defaultCurrency: "ARS",
                  status: "active",
                },
              ]),
            }),
          }),
        })
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValueOnce({
            where: vi.fn().mockReturnValueOnce({
              limit: vi.fn().mockResolvedValueOnce([
                { id: "loc1", name: "Main", address: "Calle 1" },
              ]),
            }),
          }),
        })
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValueOnce({
            where: vi.fn().mockReturnValueOnce({
              limit: vi.fn().mockResolvedValueOnce([{ id: "item1" }]),
            }),
          }),
        })
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValueOnce({
            where: vi.fn().mockReturnValueOnce({
              limit: vi.fn().mockResolvedValueOnce([{ id: "mp1" }]),
            }),
          }),
        })
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValueOnce({
            where: vi.fn().mockReturnValueOnce({
              limit: vi.fn().mockResolvedValueOnce([{ salesEnabled: true }]),
            }),
          }),
        }),
    } as unknown as TenantTransaction;

    const result = await fetchTenantReadiness(tx, "t1");
    expect(result.ready).toBe(true);
    expect(result.orderingAvailable).toBe(true);
    expect(result.checks.find((c) => c.code === "payment_connected")?.complete).toBe(true);
  });

  it("evaluates ready: false and orderingAvailable: false when Mercado Pago is not connected", async () => {
    const tx = {
      select: vi.fn()
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValueOnce({
            where: vi.fn().mockReturnValueOnce({
              limit: vi.fn().mockResolvedValueOnce([
                {
                  id: "t1",
                  name: "T1",
                  slug: "t1",
                  normalizedSlug: "t1",
                  defaultCurrency: "ARS",
                  status: "active",
                },
              ]),
            }),
          }),
        })
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValueOnce({
            where: vi.fn().mockReturnValueOnce({
              limit: vi.fn().mockResolvedValueOnce([
                { id: "loc1", name: "Main", address: "Calle 1" },
              ]),
            }),
          }),
        })
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValueOnce({
            where: vi.fn().mockReturnValueOnce({
              limit: vi.fn().mockResolvedValueOnce([{ id: "item1" }]),
            }),
          }),
        })
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValueOnce({
            where: vi.fn().mockReturnValueOnce({
              limit: vi.fn().mockResolvedValueOnce([]), // MP missing/revoked
            }),
          }),
        })
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValueOnce({
            where: vi.fn().mockReturnValueOnce({
              limit: vi.fn().mockResolvedValueOnce([{ salesEnabled: true }]),
            }),
          }),
        }),
    } as unknown as TenantTransaction;

    const result = await fetchTenantReadiness(tx, "t1");
    expect(result.ready).toBe(false);
    expect(result.orderingAvailable).toBe(false);
    expect(result.checks.find((c) => c.code === "payment_connected")?.complete).toBe(false);
  });

  it("evaluates ready: true but orderingAvailable: false when tenant is still in onboarding", async () => {
    const tx = {
      select: vi.fn()
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValueOnce({
            where: vi.fn().mockReturnValueOnce({
              limit: vi.fn().mockResolvedValueOnce([
                {
                  id: "t1",
                  name: "T1",
                  slug: "t1",
                  normalizedSlug: "t1",
                  defaultCurrency: "ARS",
                  status: "onboarding",
                },
              ]),
            }),
          }),
        })
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValueOnce({
            where: vi.fn().mockReturnValueOnce({
              limit: vi.fn().mockResolvedValueOnce([
                { id: "loc1", name: "Main", address: "Calle 1" },
              ]),
            }),
          }),
        })
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValueOnce({
            where: vi.fn().mockReturnValueOnce({
              limit: vi.fn().mockResolvedValueOnce([{ id: "item1" }]),
            }),
          }),
        })
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValueOnce({
            where: vi.fn().mockReturnValueOnce({
              limit: vi.fn().mockResolvedValueOnce([{ id: "mp1" }]),
            }),
          }),
        })
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValueOnce({
            where: vi.fn().mockReturnValueOnce({
              limit: vi.fn().mockResolvedValueOnce([{ salesEnabled: false }]),
            }),
          }),
        }),
    } as unknown as TenantTransaction;

    const result = await fetchTenantReadiness(tx, "t1");
    expect(result.ready).toBe(true);
    expect(result.orderingAvailable).toBe(false);
  });

  it("evaluates ready: true but orderingAvailable: false when salesEnabled is false", async () => {
    const tx = {
      select: vi.fn()
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValueOnce({
            where: vi.fn().mockReturnValueOnce({
              limit: vi.fn().mockResolvedValueOnce([
                {
                  id: "t1",
                  name: "T1",
                  slug: "t1",
                  normalizedSlug: "t1",
                  defaultCurrency: "ARS",
                  status: "active",
                },
              ]),
            }),
          }),
        })
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValueOnce({
            where: vi.fn().mockReturnValueOnce({
              limit: vi.fn().mockResolvedValueOnce([
                { id: "loc1", name: "Main", address: "Calle 1" },
              ]),
            }),
          }),
        })
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValueOnce({
            where: vi.fn().mockReturnValueOnce({
              limit: vi.fn().mockResolvedValueOnce([{ id: "item1" }]),
            }),
          }),
        })
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValueOnce({
            where: vi.fn().mockReturnValueOnce({
              limit: vi.fn().mockResolvedValueOnce([{ id: "mp1" }]),
            }),
          }),
        })
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValueOnce({
            where: vi.fn().mockReturnValueOnce({
              limit: vi.fn().mockResolvedValueOnce([{ salesEnabled: false }]),
            }),
          }),
        }),
    } as unknown as TenantTransaction;

    const result = await fetchTenantReadiness(tx, "t1");
    expect(result.ready).toBe(true);
    expect(result.orderingAvailable).toBe(false);
  });
});
