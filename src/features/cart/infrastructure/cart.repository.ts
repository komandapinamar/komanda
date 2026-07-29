import { and, asc, eq, inArray } from "drizzle-orm";
import {
  addonGroups,
  addonOptions,
  cartLineOptions,
  cartLines,
  carts,
  catalogCombos,
  catalogItems,
  comboItems,
  itemAddonGroups,
  mediaAssets,
} from "@/db/schema";
import type { TenantTransaction } from "@/db/tenant-transaction";

export type CartSelectionCatalog = {
  kind: "item" | "combo";
  id: string;
  name: string;
  status: "draft" | "active" | "unavailable" | "archived";
  price: string;
  currency: string;
  imageUrl: string | null;
  addonGroups: Array<{
    id: string;
    minSelected: number;
    maxSelected: number;
    options: Array<{ id: string; name: string; priceDelta: string }>;
  }>;
};

export class CartRepository {
  constructor(
    private readonly transaction: TenantTransaction,
    private readonly tenantId: string,
  ) {}

  async loadSelection(kind: "item" | "combo", id: string) {
    if (kind === "combo") {
      const [row] = await this.transaction
        .select({ resource: catalogCombos, media: mediaAssets })
        .from(catalogCombos)
        .leftJoin(
          mediaAssets,
          and(
            eq(mediaAssets.tenantId, catalogCombos.tenantId),
            eq(mediaAssets.id, catalogCombos.imageAssetId),
          ),
        )
        .where(
          and(eq(catalogCombos.tenantId, this.tenantId), eq(catalogCombos.id, id)),
        )
        .limit(1);
      if (!row) return null;
      const components = await this.transaction
        .select({ status: catalogItems.status })
        .from(comboItems)
        .innerJoin(
          catalogItems,
          and(
            eq(catalogItems.tenantId, comboItems.tenantId),
            eq(catalogItems.id, comboItems.itemId),
          ),
        )
        .where(
          and(eq(comboItems.tenantId, this.tenantId), eq(comboItems.comboId, id)),
        );
      return {
        kind,
        id: row.resource.id,
        name: row.resource.name,
        status:
          components.length > 0 && components.every(({ status }) => status === "active")
            ? row.resource.status
            : ("unavailable" as const),
        price: row.resource.price,
        currency: row.resource.currency,
        imageUrl: row.media?.status === "ready" ? row.media.publicUrl : null,
        addonGroups: [],
      } satisfies CartSelectionCatalog;
    }

    const [row] = await this.transaction
      .select({ resource: catalogItems, media: mediaAssets })
      .from(catalogItems)
      .leftJoin(
        mediaAssets,
        and(
          eq(mediaAssets.tenantId, catalogItems.tenantId),
          eq(mediaAssets.id, catalogItems.imageAssetId),
        ),
      )
      .where(and(eq(catalogItems.tenantId, this.tenantId), eq(catalogItems.id, id)))
      .limit(1);
    if (!row) return null;
    const joins = await this.transaction
      .select()
      .from(itemAddonGroups)
      .where(
        and(
          eq(itemAddonGroups.tenantId, this.tenantId),
          eq(itemAddonGroups.itemId, id),
        ),
      );
    const groupIds = joins.map(({ addonGroupId }) => addonGroupId);
    const [groups, options] = await Promise.all([
      groupIds.length
        ? this.transaction
            .select()
            .from(addonGroups)
            .where(
              and(
                eq(addonGroups.tenantId, this.tenantId),
                inArray(addonGroups.id, groupIds),
                eq(addonGroups.status, "active"),
              ),
            )
        : [],
      groupIds.length
        ? this.transaction
            .select()
            .from(addonOptions)
            .where(
              and(
                eq(addonOptions.tenantId, this.tenantId),
                inArray(addonOptions.groupId, groupIds),
                eq(addonOptions.status, "active"),
              ),
            )
        : [],
    ]);
    return {
      kind,
      id: row.resource.id,
      name: row.resource.name,
      status: row.resource.status,
      price: row.resource.price,
      currency: row.resource.currency,
      imageUrl: row.media?.status === "ready" ? row.media.publicUrl : null,
      addonGroups: groups.map((group) => ({
        id: group.id,
        minSelected: group.minSelected,
        maxSelected: group.maxSelected,
        options: options
          .filter(({ groupId }) => groupId === group.id)
          .map((option) => ({
            id: option.id,
            name: option.name,
            priceDelta: option.priceDelta,
          })),
      })),
    } satisfies CartSelectionCatalog;
  }

  async create(input: {
    locationId: string;
    currency: string;
    subtotal: string;
    total: string;
    expiresAt: Date;
    lines: Array<{
      kind: "item" | "combo";
      resourceId: string;
      quantity: number;
      name: string;
      unitPrice: string;
      lineTotal: string;
      imageUrl: string | null;
      note?: string;
      options: Array<{
        groupId: string;
        optionId: string;
        name: string;
        priceDelta: string;
      }>;
    }>;
  }) {
    const [cart] = await this.transaction
      .insert(carts)
      .values({
        tenantId: this.tenantId,
        locationId: input.locationId,
        status: "validated",
        currency: input.currency,
        subtotal: input.subtotal,
        total: input.total,
        verifiedAt: new Date(),
        expiresAt: input.expiresAt,
      })
      .returning();
    for (const line of input.lines) {
      const [created] = await this.transaction
        .insert(cartLines)
        .values({
          tenantId: this.tenantId,
          cartId: cart!.id,
          itemId: line.kind === "item" ? line.resourceId : null,
          comboId: line.kind === "combo" ? line.resourceId : null,
          quantity: line.quantity,
          nameSnapshot: line.name,
          unitPriceSnapshot: line.unitPrice,
          lineTotal: line.lineTotal,
          imageUrlSnapshot: line.imageUrl,
          note: line.note,
        })
        .returning({ id: cartLines.id });
      if (line.options.length > 0) {
        await this.transaction.insert(cartLineOptions).values(
          line.options.map((option) => ({
            tenantId: this.tenantId,
            cartLineId: created!.id,
            addonGroupId: option.groupId,
            addonOptionId: option.optionId,
            nameSnapshot: option.name,
            priceDeltaSnapshot: option.priceDelta,
          })),
        );
      }
    }
    return this.find(cart!.id);
  }

  async find(cartId: string) {
    const [cart] = await this.transaction
      .select()
      .from(carts)
      .where(and(eq(carts.tenantId, this.tenantId), eq(carts.id, cartId)))
      .limit(1);
    if (!cart) return null;
    const lines = await this.transaction
      .select()
      .from(cartLines)
      .where(
        and(eq(cartLines.tenantId, this.tenantId), eq(cartLines.cartId, cartId)),
      )
      .orderBy(asc(cartLines.createdAt));
    const lineIds = lines.map(({ id }) => id);
    const options = lineIds.length
      ? await this.transaction
          .select()
          .from(cartLineOptions)
          .where(
            and(
              eq(cartLineOptions.tenantId, this.tenantId),
              inArray(cartLineOptions.cartLineId, lineIds),
            ),
          )
      : [];
    return {
      ...cart,
      lines: lines.map((line) => ({
        ...line,
        options: options.filter(({ cartLineId }) => cartLineId === line.id),
      })),
    };
  }
}
