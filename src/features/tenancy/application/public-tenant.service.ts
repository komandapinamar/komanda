import { randomUUID } from "node:crypto";
import { and, asc, eq, sql } from "drizzle-orm";
import {
  addonGroups,
  addonOptions,
  catalogCategories,
  catalogCombos,
  catalogItems,
  comboItems,
  itemAddonGroups,
  mediaAssets,
  tenantLocations,
  tenants,
} from "@/db/schema";
import {
  withPlatformServiceTransaction,
  withTenantTransaction,
} from "@/db/tenant-transaction";
import { normalizeTenantSlug } from "@/features/provisioning/domain/provisioning.schemas";
import { createVerifiedTenantContext } from "@/lib/tenant-context/types";

export class PublicTenantNotFoundError extends Error {}

export type PublicTenant = {
  id: string;
  name: string;
  slug: string;
  currency: string;
  locationId: string;
};

export class PublicTenantService {
  async resolve(slug: string): Promise<PublicTenant> {
    const normalizedSlug = normalizeTenantSlug(slug);
    const tenant = await withPlatformServiceTransaction(
      { serviceId: "public-tenant-resolver", correlationId: randomUUID() },
      async (transaction) => {
        const [resolved] = await transaction
          .select()
          .from(tenants)
          .where(
            and(
              eq(tenants.normalizedSlug, normalizedSlug),
              eq(tenants.status, "active"),
            ),
          )
          .limit(1);
        if (!resolved) return null;
        await transaction.execute(
          // Resolution is complete; the location lookup is now tenant scoped.
          sql`select set_config('app.tenant_id', ${resolved.id}, true)`,
        );
        const [location] = await transaction
          .select()
          .from(tenantLocations)
          .where(
            and(
              eq(tenantLocations.tenantId, resolved.id),
              eq(tenantLocations.isPrimary, true),
              eq(tenantLocations.status, "active"),
            ),
          )
          .limit(1);
        return location ? { resolved, location } : null;
      },
    );
    if (!tenant) throw new PublicTenantNotFoundError("Storefront not found.");
    return {
      id: tenant.resolved.id,
      name: tenant.resolved.name,
      slug: tenant.resolved.slug,
      currency: tenant.resolved.defaultCurrency,
      locationId: tenant.location.id,
    };
  }

  async catalog(slug: string) {
    const tenant = await this.resolve(slug);
    const context = createVerifiedTenantContext({
      tenantId: tenant.id,
      correlationId: randomUUID(),
      source: "public",
      actor: { kind: "anonymous", tenantSlug: tenant.slug },
    });
    return withTenantTransaction(context, async (transaction) => {
      const [categories, items, combos, groups, options, itemGroups, comboLines] =
        await Promise.all([
          transaction
            .select()
            .from(catalogCategories)
            .where(
              and(
                eq(catalogCategories.tenantId, tenant.id),
                eq(catalogCategories.status, "active"),
              ),
            )
            .orderBy(asc(catalogCategories.sortOrder)),
          transaction
            .select({ item: catalogItems, media: mediaAssets })
            .from(catalogItems)
            .leftJoin(
              mediaAssets,
              and(
                eq(mediaAssets.tenantId, catalogItems.tenantId),
                eq(mediaAssets.id, catalogItems.imageAssetId),
              ),
            )
            .where(
              and(
                eq(catalogItems.tenantId, tenant.id),
                eq(catalogItems.status, "active"),
              ),
            )
            .orderBy(asc(catalogItems.sortOrder)),
          transaction
            .select({ combo: catalogCombos, media: mediaAssets })
            .from(catalogCombos)
            .leftJoin(
              mediaAssets,
              and(
                eq(mediaAssets.tenantId, catalogCombos.tenantId),
                eq(mediaAssets.id, catalogCombos.imageAssetId),
              ),
            )
            .where(
              and(
                eq(catalogCombos.tenantId, tenant.id),
                eq(catalogCombos.status, "active"),
              ),
            ),
          transaction
            .select()
            .from(addonGroups)
            .where(
              and(eq(addonGroups.tenantId, tenant.id), eq(addonGroups.status, "active")),
            ),
          transaction
            .select()
            .from(addonOptions)
            .where(
              and(eq(addonOptions.tenantId, tenant.id), eq(addonOptions.status, "active")),
            ),
          transaction
            .select()
            .from(itemAddonGroups)
            .where(eq(itemAddonGroups.tenantId, tenant.id)),
          transaction
            .select()
            .from(comboItems)
            .where(eq(comboItems.tenantId, tenant.id)),
        ]);
      return {
        tenant: { name: tenant.name, slug: tenant.slug, currency: tenant.currency },
        revision: Math.max(
          1,
          ...categories.map(({ version }) => version),
          ...items.map(({ item }) => item.version),
          ...combos.map(({ combo }) => combo.version),
        ),
        categories: categories.map((category) => ({
          id: category.id,
          name: category.name,
          items: items
            .filter(({ item }) => item.categoryId === category.id)
            .map(({ item, media }) => ({
              ...item,
              imageUrl: media?.status === "ready" ? media.publicUrl : null,
              addonGroups: itemGroups
                .filter(({ itemId }) => itemId === item.id)
                .map(({ addonGroupId }) => {
                  const group = groups.find(({ id }) => id === addonGroupId)!;
                  return {
                    ...group,
                    options: options.filter(({ groupId }) => groupId === group.id),
                  };
                }),
            })),
          combos: combos
            .filter(({ combo }) => combo.categoryId === category.id)
            .map(({ combo, media }) => ({
              ...combo,
              imageUrl: media?.status === "ready" ? media.publicUrl : null,
              items: comboLines.filter(({ comboId }) => comboId === combo.id),
            })),
        })),
      };
    });
  }
}
