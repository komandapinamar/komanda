import { randomUUID } from "node:crypto";
import { withPlatformServiceTransaction } from "@/db/tenant-transaction";
import {
  assertValidItemTenant,
  buildStorefrontProductAnchor,
  sanitizeSearchQuery,
  SEARCH_CONFIG,
} from "@/features/search/domain/search.rules";
import type {
  SearchQueryParams,
  SearchResultData,
} from "@/features/search/domain/search.schemas";
import { SearchRepository } from "@/features/search/infrastructure/search.repository";

export class SearchQueryService {
  async search(params: SearchQueryParams): Promise<SearchResultData> {
    const sanitizedQuery = sanitizeSearchQuery(params.q);

    // Empty query returns early with empty collections without DB scan (FR-7 / AD-5)
    if (!sanitizedQuery) {
      return {
        query: "",
        products: [],
        businesses: [],
      };
    }

    const productsLimit = Math.min(
      params.productsLimit ?? SEARCH_CONFIG.DEFAULT_PRODUCTS_LIMIT,
      SEARCH_CONFIG.MAX_LIMIT,
    );
    const businessesLimit = Math.min(
      params.businessesLimit ?? SEARCH_CONFIG.DEFAULT_BUSINESSES_LIMIT,
      SEARCH_CONFIG.MAX_LIMIT,
    );

    return withPlatformServiceTransaction(
      { serviceId: "public-search-resolver", correlationId: randomUUID() },
      async (transaction) => {
        const repository = new SearchRepository(transaction);

        const [rawProducts, businesses] = await Promise.all([
          repository.searchProducts(sanitizedQuery, productsLimit),
          repository.searchBusinesses(sanitizedQuery, businessesLimit),
        ]);

        const products = rawProducts.map((p) => {
          assertValidItemTenant(p.itemId, p.tenant.id, p.tenant.id);
          return {
            ...p,
            storefrontPath: buildStorefrontProductAnchor(p.itemId),
          };
        });

        return {
          query: sanitizedQuery,
          products,
          businesses,
        };
      },
    );
  }
}

export const searchQueryService = new SearchQueryService();
