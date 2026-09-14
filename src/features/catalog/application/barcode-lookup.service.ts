import { eq } from "drizzle-orm";
import { withTenantTransaction } from "@/db/tenant-transaction";
import { globalProductCatalog } from "@/db/schema/catalog";
import { CatalogRepository } from "@/features/catalog/infrastructure/catalog.repository";
import type { TenantContext } from "@/lib/tenant-context/types";

export type BarcodeLookupResult =
  | {
      source: "tenant";
      item: {
        id: string;
        name: string;
        price: string;
        currency: string;
        barcode: string | null;
        isGeneric: boolean;
        genericIcon: string | null;
        trackStock: boolean;
        stockQuantity: number;
        status: string;
      };
    }
  | {
      source: "global" | "external";
      suggestion: {
        name: string;
        suggestedCategory: string | null;
        imageUrl: string | null;
        brand: string | null;
      };
    }
  | {
      source: "none";
      suggestion: null;
    };

export class BarcodeLookupService {
  async lookup(context: TenantContext, barcode: string): Promise<BarcodeLookupResult> {
    const cleanBarcode = barcode.trim();
    if (!cleanBarcode) {
      return { source: "none", suggestion: null };
    }

    return withTenantTransaction(context, async (transaction) => {
      const repository = new CatalogRepository(transaction, context.tenantId);

      // Level 1: Tenant local check
      const localItem = await repository.findItemByBarcode(cleanBarcode);
      if (localItem) {
        return {
          source: "tenant",
          item: {
            id: localItem.id,
            name: localItem.name,
            price: localItem.price,
            currency: localItem.currency,
            barcode: localItem.barcode,
            isGeneric: localItem.isGeneric,
            genericIcon: localItem.genericIcon,
            trackStock: localItem.trackStock,
            stockQuantity: localItem.stockQuantity,
            status: localItem.status,
          },
        };
      }

      // Level 2: Platform global catalog cache
      const [globalItem] = await transaction
        .select()
        .from(globalProductCatalog)
        .where(eq(globalProductCatalog.barcode, cleanBarcode))
        .limit(1);

      if (globalItem) {
        return {
          source: "global",
          suggestion: {
            name: globalItem.name,
            suggestedCategory: globalItem.suggestedCategory,
            imageUrl: globalItem.imageUrl,
            brand: globalItem.brand,
          },
        };
      }

      // Level 3: External public API (Open Food Facts)
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 3500);

        const response = await fetch(
          `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(cleanBarcode)}.json`,
          {
            signal: controller.signal,
            headers: { "User-Agent": "Komanda-Espresso/1.0" },
          },
        );
        clearTimeout(timeout);

        if (response.ok) {
          const data = (await response.json()) as {
            status?: number;
            product?: {
              product_name_es?: string;
              product_name?: string;
              generic_name_es?: string;
              generic_name?: string;
              categories_tags?: string[];
              image_front_url?: string;
              image_url?: string;
              brands?: string;
            };
          };

          if (data.status === 1 && data.product) {
            const product = data.product;
            const name =
              product.product_name_es ||
              product.product_name ||
              product.generic_name_es ||
              product.generic_name ||
              "";

            if (name.trim()) {
              const categoryTag = product.categories_tags?.[0];
              const suggestedCategory = categoryTag
                ? categoryTag.replace(/^.*?:/, "").replace(/-/g, " ")
                : null;
              const imageUrl = product.image_front_url || product.image_url || null;
              const brand = product.brands || null;

              await transaction
                .insert(globalProductCatalog)
                .values({
                  barcode: cleanBarcode,
                  name: name.trim(),
                  suggestedCategory,
                  imageUrl,
                  brand,
                })
                .onConflictDoNothing();

              return {
                source: "external",
                suggestion: {
                  name: name.trim(),
                  suggestedCategory,
                  imageUrl,
                  brand,
                },
              };
            }
          }
        }
      } catch {
        // Fallback gracefully on timeout or network issues
      }

      return { source: "none", suggestion: null };
    });
  }
}
