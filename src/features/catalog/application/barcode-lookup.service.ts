import { eq } from "drizzle-orm";
import { withTenantTransaction } from "@/db/tenant-transaction";
import { globalProductCatalog, type CatalogItemType } from "@/db/schema/catalog";
import { CatalogRepository } from "@/features/catalog/infrastructure/catalog.repository";
import {
  isScaleEan13Prefix,
  parseScaleEan13,
} from "@/features/catalog/domain/catalog.rules";
import type { TenantContext } from "@/lib/tenant-context/types";

export type BarcodeLookupResult =
  | {
      source: "tenant";
      item: {
        id: string;
        name: string;
        price: string;
        currency: string;
        itemType: CatalogItemType;
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

      // Scale EAN-13 (20..29 prefix): lookup weighted PLU in tenant and never call global/external APIs
      if (isScaleEan13Prefix(cleanBarcode)) {
        const parsedScale = parseScaleEan13(cleanBarcode);
        if (!parsedScale) {
          return { source: "none", suggestion: null };
        }
        const weightedItem = await repository.findWeightedItemByPlu(
          parsedScale.pluCode,
        );
        if (weightedItem && weightedItem.itemType === "weighted") {
          return {
            source: "tenant",
            item: {
              id: weightedItem.id,
              name: weightedItem.name,
              price: weightedItem.price,
              currency: weightedItem.currency,
              itemType: weightedItem.itemType,
              barcode: weightedItem.barcode,
              isGeneric: weightedItem.isGeneric,
              genericIcon: weightedItem.genericIcon,
              trackStock: weightedItem.trackStock,
              stockQuantity: weightedItem.stockQuantity,
              status: weightedItem.status,
            },
          };
        }
        return { source: "none", suggestion: null };
      }

      // Level 1: Tenant local check (standard unit items only)
      const localItem = await repository.findItemByBarcode(cleanBarcode);
      if (localItem && localItem.itemType !== "weighted") {
        return {
          source: "tenant",
          item: {
            id: localItem.id,
            name: localItem.name,
            price: localItem.price,
            currency: localItem.currency,
            itemType: localItem.itemType,
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
