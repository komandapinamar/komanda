import { and, asc, count, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import {
  addonGroups,
  addonOptions,
  catalogCategories,
  catalogCombos,
  catalogItems,
  comboItems,
  itemAddonGroups,
  mediaAssets,
  tenantEntitlementSnapshots,
} from "@/db/schema";
import type { TenantTransaction } from "@/db/tenant-transaction";

export class CatalogRepository {
  constructor(
    private readonly transaction: TenantTransaction,
    private readonly tenantId: string,
  ) {}

  async hasCatalogEntitlement() {
    const [snapshot] = await this.transaction
      .select({ entitlements: tenantEntitlementSnapshots.entitlements })
      .from(tenantEntitlementSnapshots)
      .where(
        and(
          eq(tenantEntitlementSnapshots.tenantId, this.tenantId),
          isNull(tenantEntitlementSnapshots.supersededAt),
        ),
      )
      .limit(1);
    return snapshot?.entitlements.catalog_management === true;
  }

  listCategories() {
    return this.transaction
      .select()
      .from(catalogCategories)
      .where(eq(catalogCategories.tenantId, this.tenantId))
      .orderBy(asc(catalogCategories.sortOrder), asc(catalogCategories.name));
  }

  async findCategory(id: string) {
    const [category] = await this.transaction
      .select()
      .from(catalogCategories)
      .where(
        and(
          eq(catalogCategories.tenantId, this.tenantId),
          eq(catalogCategories.id, id),
        ),
      )
      .limit(1);
    return category ?? null;
  }

  async createCategory(
    values: Omit<typeof catalogCategories.$inferInsert, "tenantId">,
  ) {
    const [category] = await this.transaction
      .insert(catalogCategories)
      .values({ ...values, tenantId: this.tenantId })
      .returning();
    return category!;
  }

  async updateCategory(
    id: string,
    version: number,
    values: Partial<typeof catalogCategories.$inferInsert>,
  ) {
    const [category] = await this.transaction
      .update(catalogCategories)
      .set({
        ...values,
        version: sql`${catalogCategories.version} + 1`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(catalogCategories.tenantId, this.tenantId),
          eq(catalogCategories.id, id),
          eq(catalogCategories.version, version),
        ),
      )
      .returning();
    return category ?? null;
  }

  async countCategoryChildren(categoryId: string) {
    const [items] = await this.transaction
      .select({ value: count() })
      .from(catalogItems)
      .where(
        and(
          eq(catalogItems.tenantId, this.tenantId),
          eq(catalogItems.categoryId, categoryId),
          ne(catalogItems.status, "archived"),
        ),
      );
    const [combos] = await this.transaction
      .select({ value: count() })
      .from(catalogCombos)
      .where(
        and(
          eq(catalogCombos.tenantId, this.tenantId),
          eq(catalogCombos.categoryId, categoryId),
          ne(catalogCombos.status, "archived"),
        ),
      );
    return Number(items?.value ?? 0) + Number(combos?.value ?? 0);
  }

  async findMedia(id: string | null | undefined) {
    if (!id) return null;
    const [media] = await this.transaction
      .select()
      .from(mediaAssets)
      .where(and(eq(mediaAssets.tenantId, this.tenantId), eq(mediaAssets.id, id)))
      .limit(1);
    return media ?? null;
  }

  listItems() {
    return this.transaction
      .select()
      .from(catalogItems)
      .where(eq(catalogItems.tenantId, this.tenantId))
      .orderBy(asc(catalogItems.sortOrder), asc(catalogItems.name));
  }

  async findItem(id: string) {
    const [item] = await this.transaction
      .select()
      .from(catalogItems)
      .where(and(eq(catalogItems.tenantId, this.tenantId), eq(catalogItems.id, id)))
      .limit(1);
    return item ?? null;
  }

  async findItems(ids: string[]) {
    if (ids.length === 0) return [];
    return this.transaction
      .select()
      .from(catalogItems)
      .where(
        and(
          eq(catalogItems.tenantId, this.tenantId),
          inArray(catalogItems.id, ids),
        ),
      );
  }

  async createItem(
    values: Omit<typeof catalogItems.$inferInsert, "tenantId">,
    addonGroupIds: string[],
  ) {
    const [item] = await this.transaction
      .insert(catalogItems)
      .values({ ...values, tenantId: this.tenantId })
      .returning();
    if (addonGroupIds.length > 0) {
      await this.transaction.insert(itemAddonGroups).values(
        addonGroupIds.map((addonGroupId, sortOrder) => ({
          tenantId: this.tenantId,
          itemId: item!.id,
          addonGroupId,
          sortOrder,
        })),
      );
    }
    return item!;
  }

  async updateItem(
    id: string,
    version: number,
    values: Partial<typeof catalogItems.$inferInsert>,
    addonGroupIds?: string[],
  ) {
    const [item] = await this.transaction
      .update(catalogItems)
      .set({
        ...values,
        version: sql`${catalogItems.version} + 1`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(catalogItems.tenantId, this.tenantId),
          eq(catalogItems.id, id),
          eq(catalogItems.version, version),
        ),
      )
      .returning();
    if (!item) return null;
    if (addonGroupIds) {
      await this.transaction
        .delete(itemAddonGroups)
        .where(
          and(
            eq(itemAddonGroups.tenantId, this.tenantId),
            eq(itemAddonGroups.itemId, id),
          ),
        );
      if (addonGroupIds.length > 0) {
        await this.transaction.insert(itemAddonGroups).values(
          addonGroupIds.map((addonGroupId, sortOrder) => ({
            tenantId: this.tenantId,
            itemId: id,
            addonGroupId,
            sortOrder,
          })),
        );
      }
    }
    return item;
  }

  async findAddonGroups(ids: string[]) {
    if (ids.length === 0) return [];
    return this.transaction
      .select()
      .from(addonGroups)
      .where(
        and(eq(addonGroups.tenantId, this.tenantId), inArray(addonGroups.id, ids)),
      );
  }

  async findAddonGroup(id: string) {
    const [group] = await this.transaction
      .select()
      .from(addonGroups)
      .where(and(eq(addonGroups.tenantId, this.tenantId), eq(addonGroups.id, id)))
      .limit(1);
    return group ?? null;
  }

  async createAddonGroup(input: {
    group: Omit<typeof addonGroups.$inferInsert, "tenantId">;
    options: Array<Omit<typeof addonOptions.$inferInsert, "groupId" | "tenantId">>;
  }) {
    const [group] = await this.transaction
      .insert(addonGroups)
      .values({ ...input.group, tenantId: this.tenantId })
      .returning();
    await this.transaction.insert(addonOptions).values(
      input.options.map((option) => ({
        ...option,
        tenantId: this.tenantId,
        groupId: group!.id,
      })),
    );
    return group!;
  }

  async updateAddonGroup(
    id: string,
    version: number,
    values: Partial<typeof addonGroups.$inferInsert>,
    options?: Array<Omit<typeof addonOptions.$inferInsert, "groupId" | "tenantId">>,
  ) {
    const [group] = await this.transaction
      .update(addonGroups)
      .set({
        ...values,
        version: sql`${addonGroups.version} + 1`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(addonGroups.tenantId, this.tenantId),
          eq(addonGroups.id, id),
          eq(addonGroups.version, version),
        ),
      )
      .returning();
    if (!group) return null;
    if (options) {
      await this.transaction
        .update(addonOptions)
        .set({ status: "archived", archivedAt: new Date(), updatedAt: new Date() })
        .where(
          and(
            eq(addonOptions.tenantId, this.tenantId),
            eq(addonOptions.groupId, id),
            ne(addonOptions.status, "archived"),
          ),
        );
      await this.transaction.insert(addonOptions).values(
        options.map((option) => ({
          ...option,
          tenantId: this.tenantId,
          groupId: id,
        })),
      );
    }
    return group;
  }

  async createCombo(
    values: Omit<typeof catalogCombos.$inferInsert, "tenantId">,
    items: Array<{ itemId: string; quantity: number; sortOrder: number }>,
  ) {
    const [combo] = await this.transaction
      .insert(catalogCombos)
      .values({ ...values, tenantId: this.tenantId })
      .returning();
    await this.transaction.insert(comboItems).values(
      items.map((item) => ({ ...item, tenantId: this.tenantId, comboId: combo!.id })),
    );
    return combo!;
  }

  async findCombo(id: string) {
    const [combo] = await this.transaction
      .select()
      .from(catalogCombos)
      .where(
        and(eq(catalogCombos.tenantId, this.tenantId), eq(catalogCombos.id, id)),
      )
      .limit(1);
    return combo ?? null;
  }

  async updateCombo(
    id: string,
    version: number,
    values: Partial<typeof catalogCombos.$inferInsert>,
    items?: Array<{ itemId: string; quantity: number; sortOrder: number }>,
  ) {
    const [combo] = await this.transaction
      .update(catalogCombos)
      .set({
        ...values,
        version: sql`${catalogCombos.version} + 1`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(catalogCombos.tenantId, this.tenantId),
          eq(catalogCombos.id, id),
          eq(catalogCombos.version, version),
        ),
      )
      .returning();
    if (!combo) return null;
    if (items) {
      await this.transaction
        .delete(comboItems)
        .where(
          and(
            eq(comboItems.tenantId, this.tenantId),
            eq(comboItems.comboId, id),
          ),
        );
      await this.transaction.insert(comboItems).values(
        items.map((item) => ({ ...item, tenantId: this.tenantId, comboId: id })),
      );
    }
    return combo;
  }
}
