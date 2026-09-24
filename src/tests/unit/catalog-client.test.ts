import { afterEach, describe, expect, it, vi } from "vitest";
import { catalogFetch, CatalogRequestError, normalizeMoneyInput } from "@/features/catalog/web/catalog-client";
import { CatalogRuleViolationError, mediaUploadInputSchema } from "@/features/catalog/domain/catalog.rules";
import { CatalogConflictError } from "@/features/catalog/application/catalog.service";
import { catalogErrorResponse } from "@/features/catalog/web/catalog-http";

afterEach(() => vi.unstubAllGlobals());

describe("product publishing conflicts", () => {
  it("explains an unpublished category instead of blaming another operator", async () => {
    const response = catalogErrorResponse(
      new CatalogRuleViolationError("Item category must be active."), "test-correlation",
    );
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));
    await expect(catalogFetch("/api/catalog/items/item-id", { method: "PATCH" }))
      .rejects.toMatchObject({
        status: 409,
        code: "CATALOG_CONFLICT",
        message: "Publicá la categoría antes de publicar este producto.",
      } satisfies Partial<CatalogRequestError>);
  });

  it("distinguishes processing media from a stale product version", async () => {
    for (const [error, message] of [
      [new CatalogRuleViolationError("Item media must be ready."), "Esperá a que termine de procesarse la imagen o el video antes de publicar el producto."],
      [new CatalogConflictError("Item version conflict."), "El producto cambió desde que abriste la página. Recargá la página y volvé a intentar."],
    ] as const) {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(catalogErrorResponse(error, "test")));
      await expect(catalogFetch("/api/catalog/items/item-id", { method: "PATCH" }))
        .rejects.toThrow(message);
    }
  });

  it("does not display arbitrary server details for unknown catalog conflicts", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({
      code: "CATALOG_CONFLICT", detail: "internal diagnostics",
    }, { status: 409 })));
    await expect(catalogFetch("/api/catalog/items/item-id", { method: "PATCH" }))
      .rejects.toThrow("No se pudo aplicar el cambio:");
  });
});

describe("normalizeMoneyInput", () => {
  it("accepta enteros y les agrega decimales", () => {
    expect(normalizeMoneyInput("3500")).toBe("3500.00");
  });

  it("normaliza decimales con punto", () => {
    expect(normalizeMoneyInput("3500.5")).toBe("3500.50");
    expect(normalizeMoneyInput("3500.55")).toBe("3500.55");
  });

  it("normaliza decimales con coma", () => {
    expect(normalizeMoneyInput("3500,50")).toBe("3500.50");
  });

  it("interpreta formato es-AR con miles y decimales", () => {
    expect(normalizeMoneyInput("3.500,50")).toBe("3500.50");
    expect(normalizeMoneyInput("$ 12.000")).toBe("12000.00");
  });

  it("interpreta grupos de 3 dígitos con punto como miles", () => {
    expect(normalizeMoneyInput("10.555")).toBe("10555.00");
    expect(normalizeMoneyInput("1.234.567")).toBe("1234567.00");
  });

  it("rechaza valores inválidos", () => {
    expect(normalizeMoneyInput("")).toBeNull();
    expect(normalizeMoneyInput("abc")).toBeNull();
    expect(normalizeMoneyInput("1.0.0")).toBeNull();
    expect(normalizeMoneyInput("12345678901")).toBeNull();
  });
});

describe("mediaUploadInputSchema", () => {
  const base = {
    fileName: "foto.jpg",
    checksumSha256: "a".repeat(64),
  };

  it("acepta imágenes hasta 10 MB", () => {
    const result = mediaUploadInputSchema.safeParse({
      ...base,
      mimeType: "image/webp",
      byteSize: 10 * 1024 * 1024,
    });
    expect(result.success).toBe(true);
  });

  it("rechaza imágenes de más de 10 MB", () => {
    const result = mediaUploadInputSchema.safeParse({
      ...base,
      mimeType: "image/png",
      byteSize: 10 * 1024 * 1024 + 1,
    });
    expect(result.success).toBe(false);
  });

  it("acepta videos mp4/webm hasta 50 MB", () => {
    for (const mimeType of ["video/mp4", "video/webm"] as const) {
      const result = mediaUploadInputSchema.safeParse({
        ...base,
        mimeType,
        byteSize: 50 * 1024 * 1024,
      });
      expect(result.success).toBe(true);
    }
  });

  it("rechaza videos de más de 50 MB y tipos no soportados", () => {
    expect(
      mediaUploadInputSchema.safeParse({
        ...base,
        mimeType: "video/mp4",
        byteSize: 50 * 1024 * 1024 + 1,
      }).success,
    ).toBe(false);
    expect(
      mediaUploadInputSchema.safeParse({
        ...base,
        mimeType: "image/gif",
        byteSize: 1024,
      }).success,
    ).toBe(false);
  });
});
