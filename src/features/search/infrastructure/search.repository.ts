import { and, asc, desc, eq, sql } from "drizzle-orm";
import {
  catalogSearchEntries,
  publicSearchTenants,
} from "@/db/schema/search";
import type { TenantTransaction } from "@/db/tenant-transaction";
import { SEARCH_CONFIG } from "@/features/search/domain/search.rules";
import type {
  SearchBusinessResult,
  SearchProductResult,
} from "@/features/search/domain/search.schemas";

export type PublicSearchTenantRow = typeof publicSearchTenants.$inferSelect;
export type CatalogSearchEntryRow = typeof catalogSearchEntries.$inferSelect;

export class SearchRepository {
  constructor(private readonly transaction: TenantTransaction) {}

  async searchProducts(
    query: string,
    limit: number = SEARCH_CONFIG.DEFAULT_PRODUCTS_LIMIT,
  ): Promise<SearchProductResult[]> {
    const term = query.trim();
    if (!term) return [];

    const effectiveLimit = Math.min(limit, SEARCH_CONFIG.MAX_LIMIT);
    const likePattern = `%${term}%`;
    const prefixPattern = `${term}%`;

    const rows = await this.transaction
      .select({
        itemId: catalogSearchEntries.itemId,
        name: catalogSearchEntries.itemName,
        price: catalogSearchEntries.price,
        currency: catalogSearchEntries.currency,
        category: catalogSearchEntries.categoryName,
        imageUrl: catalogSearchEntries.imageUrl,
        tenantId: catalogSearchEntries.tenantId,
        tenantSlug: catalogSearchEntries.tenantSlug,
        tenantName: catalogSearchEntries.tenantName,
      })
      .from(catalogSearchEntries)
      .innerJoin(
        publicSearchTenants,
        eq(publicSearchTenants.tenantId, catalogSearchEntries.tenantId),
      )
      .where(
        and(
          eq(publicSearchTenants.isPubliclyEligible, true),
          eq(catalogSearchEntries.isAvailable, true),
          sql`(
            ${catalogSearchEntries.itemName} ILIKE ${likePattern}
            OR similarity(${catalogSearchEntries.itemName}, ${term}) >= ${SEARCH_CONFIG.MIN_SIMILARITY_THRESHOLD}
            OR ${catalogSearchEntries.categoryName} ILIKE ${likePattern}
            OR similarity(${catalogSearchEntries.categoryName}, ${term}) >= ${SEARCH_CONFIG.MIN_SIMILARITY_THRESHOLD}
          )`,
        ),
      )
      .orderBy(
        // Rank exact match on item name highest
        desc(sql`case when ${catalogSearchEntries.itemName} = ${term} then 1 else 0 end`),
        // Then prefix match on item name
        desc(sql`case when ${catalogSearchEntries.itemName} ILIKE ${prefixPattern} then 1 else 0 end`),
        // Then similarity score
        desc(sql`similarity(${catalogSearchEntries.itemName}, ${term})`),
        // Then alphabetical tenant name
        asc(catalogSearchEntries.tenantName),
      )
      .limit(effectiveLimit);

    return rows.map((row) => ({
      itemId: row.itemId,
      name: row.name,
      price: row.price,
      currency: row.currency,
      category: row.category,
      imageUrl: row.imageUrl,
      tenant: {
        id: row.tenantId,
        slug: row.tenantSlug,
        name: row.tenantName,
      },
      storefrontPath: `?item=${encodeURIComponent(row.itemId)}`,
    }));
  }

  async searchBusinesses(
    query: string,
    limit: number = SEARCH_CONFIG.DEFAULT_BUSINESSES_LIMIT,
  ): Promise<SearchBusinessResult[]> {
    const term = query.trim();
    if (!term) return [];

    const effectiveLimit = Math.min(limit, SEARCH_CONFIG.MAX_LIMIT);
    const likePattern = `%${term}%`;
    const prefixPattern = `${term}%`;

    const rows = await this.transaction
      .select({
        id: publicSearchTenants.tenantId,
        name: publicSearchTenants.name,
        slug: publicSearchTenants.slug,
        locationName: publicSearchTenants.locationName,
        locationAddress: publicSearchTenants.locationAddress,
        lat: publicSearchTenants.lat,
        lng: publicSearchTenants.lng,
        categoriesCount: publicSearchTenants.categoriesCount,
      })
      .from(publicSearchTenants)
      .where(
        and(
          eq(publicSearchTenants.isPubliclyEligible, true),
          sql`(
            ${publicSearchTenants.name} ILIKE ${likePattern}
            OR ${publicSearchTenants.slug} ILIKE ${likePattern}
            OR similarity(${publicSearchTenants.name}, ${term}) >= ${SEARCH_CONFIG.MIN_SIMILARITY_THRESHOLD}
            OR (${publicSearchTenants.locationName} IS NOT NULL AND (
                ${publicSearchTenants.locationName} ILIKE ${likePattern}
                OR similarity(${publicSearchTenants.locationName}, ${term}) >= ${SEARCH_CONFIG.MIN_SIMILARITY_THRESHOLD}
            ))
            OR (${publicSearchTenants.locationAddress} IS NOT NULL AND (
                ${publicSearchTenants.locationAddress} ILIKE ${likePattern}
                OR similarity(${publicSearchTenants.locationAddress}, ${term}) >= ${SEARCH_CONFIG.MIN_SIMILARITY_THRESHOLD}
            ))
          )`,
        ),
      )
      .orderBy(
        desc(sql`case when ${publicSearchTenants.name} = ${term} then 1 else 0 end`),
        desc(sql`case when ${publicSearchTenants.name} ILIKE ${prefixPattern} then 1 else 0 end`),
        desc(sql`similarity(${publicSearchTenants.name}, ${term})`),
        asc(publicSearchTenants.name),
      )
      .limit(effectiveLimit);

    return rows.map((row) => {
      const lat = row.lat ? Number(row.lat) : 0;
      const lng = row.lng ? Number(row.lng) : 0;
      return {
        id: row.id,
        name: row.name,
        slug: row.slug,
        currency: "ARS",
        locationName: row.locationName,
        locationAddress: row.locationAddress,
        lat,
        lng,
        mapQuery: `${lat},${lng}`,
        categoriesCount: row.categoriesCount,
      };
    });
  }

  async listAllEligibleBusinesses(): Promise<SearchBusinessResult[]> {
    const rows = await this.transaction
      .select({
        id: publicSearchTenants.tenantId,
        name: publicSearchTenants.name,
        slug: publicSearchTenants.slug,
        locationName: publicSearchTenants.locationName,
        locationAddress: publicSearchTenants.locationAddress,
        lat: publicSearchTenants.lat,
        lng: publicSearchTenants.lng,
        categoriesCount: publicSearchTenants.categoriesCount,
      })
      .from(publicSearchTenants)
      .where(eq(publicSearchTenants.isPubliclyEligible, true))
      .orderBy(asc(publicSearchTenants.name));

    return rows.map((row) => {
      const lat = row.lat ? Number(row.lat) : 0;
      const lng = row.lng ? Number(row.lng) : 0;
      return {
        id: row.id,
        name: row.name,
        slug: row.slug,
        currency: "ARS",
        locationName: row.locationName,
        locationAddress: row.locationAddress,
        lat,
        lng,
        mapQuery: `${lat},${lng}`,
        categoriesCount: row.categoriesCount,
      };
    });
  }

  async upsertSearchTenant(
    tenant: typeof publicSearchTenants.$inferInsert,
  ): Promise<void> {
    await this.transaction
      .insert(publicSearchTenants)
      .values(tenant)
      .onConflictDoUpdate({
        target: publicSearchTenants.tenantId,
        set: {
          name: tenant.name,
          slug: tenant.slug,
          locationName: tenant.locationName,
          locationAddress: tenant.locationAddress,
          lat: tenant.lat,
          lng: tenant.lng,
          categoriesCount: tenant.categoriesCount,
          isPubliclyEligible: tenant.isPubliclyEligible,
          updatedAt: new Date(),
        },
      });
  }

  async upsertSearchEntry(
    entry: typeof catalogSearchEntries.$inferInsert,
  ): Promise<void> {
    await this.transaction
      .insert(catalogSearchEntries)
      .values(entry)
      .onConflictDoUpdate({
        target: catalogSearchEntries.itemId,
        set: {
          tenantSlug: entry.tenantSlug,
          tenantName: entry.tenantName,
          itemName: entry.itemName,
          categoryId: entry.categoryId,
          categoryName: entry.categoryName,
          description: entry.description,
          price: entry.price,
          currency: entry.currency,
          imageUrl: entry.imageUrl,
          isAvailable: entry.isAvailable,
          updatedAt: new Date(),
        },
      });
  }

  async deleteSearchEntry(itemId: string): Promise<void> {
    await this.transaction
      .delete(catalogSearchEntries)
      .where(eq(catalogSearchEntries.itemId, itemId));
  }

  async deleteSearchEntriesByTenant(tenantId: string): Promise<void> {
    await this.transaction
      .delete(catalogSearchEntries)
      .where(eq(catalogSearchEntries.tenantId, tenantId));
  }

  async updateCategoryNameForEntries(
    tenantId: string,
    categoryId: string,
    newCategoryName: string,
  ): Promise<void> {
    await this.transaction
      .update(catalogSearchEntries)
      .set({
        categoryName: newCategoryName,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(catalogSearchEntries.tenantId, tenantId),
          eq(catalogSearchEntries.categoryId, categoryId),
        ),
      );
  }
}
