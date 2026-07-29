import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  foreignKey,
  index,
  integer,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { tenants } from "./platform";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
    .defaultNow()
    .notNull(),
};

export type CatalogStatus = "draft" | "active" | "unavailable" | "archived";
export type MediaStatus = "pending" | "ready" | "failed" | "archived";

export const mediaAssets = pgTable(
  "media_assets",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id").notNull(),
    storageKey: text("storage_key").notNull(),
    publicUrl: text("public_url"),
    checksumSha256: text("checksum_sha256").notNull(),
    mimeType: text("mime_type").notNull(),
    byteSize: bigint("byte_size", { mode: "number" }).notNull(),
    status: text("status").$type<MediaStatus>().default("pending").notNull(),
    ...timestamps,
  },
  (table) => [
    foreignKey({
      columns: [table.tenantId],
      foreignColumns: [tenants.id],
      name: "media_assets_tenant_fk",
    }).onDelete("restrict"),
    unique("media_assets_tenant_id_id_key").on(table.tenantId, table.id),
    uniqueIndex("media_assets_storage_key_uidx").on(table.storageKey),
    index("media_assets_tenant_status_idx").on(table.tenantId, table.status),
    check("media_assets_checksum_check", sql`${table.checksumSha256} ~ '^[a-f0-9]{64}$'`),
    check("media_assets_size_check", sql`${table.byteSize} > 0`),
  ],
);

export const catalogCategories = pgTable(
  "catalog_categories",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id").notNull(),
    name: text("name").notNull(),
    normalizedName: text("normalized_name").notNull(),
    description: text("description"),
    sortOrder: integer("sort_order").default(0).notNull(),
    status: text("status")
      .$type<"draft" | "active" | "archived">()
      .default("draft")
      .notNull(),
    version: integer("version").default(1).notNull(),
    archivedAt: timestamp("archived_at", { withTimezone: true, mode: "date" }),
    ...timestamps,
  },
  (table) => [
    foreignKey({
      columns: [table.tenantId],
      foreignColumns: [tenants.id],
      name: "catalog_categories_tenant_fk",
    }).onDelete("restrict"),
    unique("catalog_categories_tenant_id_id_key").on(table.tenantId, table.id),
    uniqueIndex("catalog_categories_tenant_name_active_uidx")
      .on(table.tenantId, table.normalizedName)
      .where(sql`${table.archivedAt} is null`),
    index("catalog_categories_tenant_status_sort_idx").on(
      table.tenantId,
      table.status,
      table.sortOrder,
    ),
    check("catalog_categories_sort_check", sql`${table.sortOrder} >= 0`),
    check("catalog_categories_version_check", sql`${table.version} > 0`),
  ],
);

export const catalogItems = pgTable(
  "catalog_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id").notNull(),
    categoryId: uuid("category_id").notNull(),
    name: text("name").notNull(),
    normalizedName: text("normalized_name").notNull(),
    description: text("description"),
    price: numeric("price", { precision: 12, scale: 2 }).notNull(),
    currency: text("currency").notNull(),
    imageAssetId: uuid("image_asset_id"),
    status: text("status").$type<CatalogStatus>().default("draft").notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),
    version: integer("version").default(1).notNull(),
    archivedAt: timestamp("archived_at", { withTimezone: true, mode: "date" }),
    ...timestamps,
  },
  (table) => [
    foreignKey({
      columns: [table.tenantId],
      foreignColumns: [tenants.id],
      name: "catalog_items_tenant_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.tenantId, table.categoryId],
      foreignColumns: [catalogCategories.tenantId, catalogCategories.id],
      name: "catalog_items_category_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.tenantId, table.imageAssetId],
      foreignColumns: [mediaAssets.tenantId, mediaAssets.id],
      name: "catalog_items_media_fk",
    }).onDelete("restrict"),
    unique("catalog_items_tenant_id_id_key").on(table.tenantId, table.id),
    uniqueIndex("catalog_items_tenant_name_active_uidx")
      .on(table.tenantId, table.normalizedName)
      .where(sql`${table.archivedAt} is null`),
    index("catalog_items_tenant_category_status_sort_idx").on(
      table.tenantId,
      table.categoryId,
      table.status,
      table.sortOrder,
    ),
    check("catalog_items_price_check", sql`${table.price} > 0`),
    check("catalog_items_currency_check", sql`char_length(${table.currency}) = 3`),
    check("catalog_items_sort_check", sql`${table.sortOrder} >= 0`),
    check("catalog_items_version_check", sql`${table.version} > 0`),
  ],
);

export const addonGroups = pgTable(
  "addon_groups",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id").notNull(),
    name: text("name").notNull(),
    minSelected: integer("min_selected").default(0).notNull(),
    maxSelected: integer("max_selected").notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),
    status: text("status")
      .$type<"draft" | "active" | "archived">()
      .default("draft")
      .notNull(),
    version: integer("version").default(1).notNull(),
    archivedAt: timestamp("archived_at", { withTimezone: true, mode: "date" }),
    ...timestamps,
  },
  (table) => [
    foreignKey({
      columns: [table.tenantId],
      foreignColumns: [tenants.id],
      name: "addon_groups_tenant_fk",
    }).onDelete("restrict"),
    unique("addon_groups_tenant_id_id_key").on(table.tenantId, table.id),
    index("addon_groups_tenant_status_sort_idx").on(
      table.tenantId,
      table.status,
      table.sortOrder,
    ),
    check(
      "addon_groups_bounds_check",
      sql`${table.minSelected} >= 0 and ${table.maxSelected} >= ${table.minSelected}`,
    ),
    check("addon_groups_version_check", sql`${table.version} > 0`),
  ],
);

export const addonOptions = pgTable(
  "addon_options",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id").notNull(),
    groupId: uuid("group_id").notNull(),
    name: text("name").notNull(),
    priceDelta: numeric("price_delta", { precision: 12, scale: 2 })
      .default("0")
      .notNull(),
    status: text("status")
      .$type<"active" | "unavailable" | "archived">()
      .default("active")
      .notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),
    version: integer("version").default(1).notNull(),
    archivedAt: timestamp("archived_at", { withTimezone: true, mode: "date" }),
    ...timestamps,
  },
  (table) => [
    foreignKey({
      columns: [table.tenantId, table.groupId],
      foreignColumns: [addonGroups.tenantId, addonGroups.id],
      name: "addon_options_group_fk",
    }).onDelete("restrict"),
    unique("addon_options_tenant_id_id_key").on(table.tenantId, table.id),
    index("addon_options_tenant_group_sort_idx").on(
      table.tenantId,
      table.groupId,
      table.sortOrder,
    ),
    check("addon_options_price_check", sql`${table.priceDelta} >= 0`),
    check("addon_options_version_check", sql`${table.version} > 0`),
  ],
);

export const itemAddonGroups = pgTable(
  "item_addon_groups",
  {
    tenantId: uuid("tenant_id").notNull(),
    itemId: uuid("item_id").notNull(),
    addonGroupId: uuid("addon_group_id").notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.tenantId, table.itemId, table.addonGroupId] }),
    foreignKey({
      columns: [table.tenantId, table.itemId],
      foreignColumns: [catalogItems.tenantId, catalogItems.id],
      name: "item_addon_groups_item_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.tenantId, table.addonGroupId],
      foreignColumns: [addonGroups.tenantId, addonGroups.id],
      name: "item_addon_groups_group_fk",
    }).onDelete("restrict"),
    check("item_addon_groups_sort_check", sql`${table.sortOrder} >= 0`),
  ],
);

export const catalogCombos = pgTable(
  "catalog_combos",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id").notNull(),
    categoryId: uuid("category_id").notNull(),
    name: text("name").notNull(),
    normalizedName: text("normalized_name").notNull(),
    description: text("description"),
    price: numeric("price", { precision: 12, scale: 2 }).notNull(),
    currency: text("currency").notNull(),
    imageAssetId: uuid("image_asset_id"),
    status: text("status").$type<CatalogStatus>().default("draft").notNull(),
    version: integer("version").default(1).notNull(),
    archivedAt: timestamp("archived_at", { withTimezone: true, mode: "date" }),
    ...timestamps,
  },
  (table) => [
    foreignKey({
      columns: [table.tenantId, table.categoryId],
      foreignColumns: [catalogCategories.tenantId, catalogCategories.id],
      name: "catalog_combos_category_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.tenantId, table.imageAssetId],
      foreignColumns: [mediaAssets.tenantId, mediaAssets.id],
      name: "catalog_combos_media_fk",
    }).onDelete("restrict"),
    unique("catalog_combos_tenant_id_id_key").on(table.tenantId, table.id),
    uniqueIndex("catalog_combos_tenant_name_active_uidx")
      .on(table.tenantId, table.normalizedName)
      .where(sql`${table.archivedAt} is null`),
    index("catalog_combos_tenant_category_status_idx").on(
      table.tenantId,
      table.categoryId,
      table.status,
    ),
    check("catalog_combos_price_check", sql`${table.price} > 0`),
    check("catalog_combos_currency_check", sql`char_length(${table.currency}) = 3`),
    check("catalog_combos_version_check", sql`${table.version} > 0`),
  ],
);

export const comboItems = pgTable(
  "combo_items",
  {
    tenantId: uuid("tenant_id").notNull(),
    comboId: uuid("combo_id").notNull(),
    itemId: uuid("item_id").notNull(),
    quantity: integer("quantity").notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.tenantId, table.comboId, table.itemId] }),
    foreignKey({
      columns: [table.tenantId, table.comboId],
      foreignColumns: [catalogCombos.tenantId, catalogCombos.id],
      name: "combo_items_combo_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.tenantId, table.itemId],
      foreignColumns: [catalogItems.tenantId, catalogItems.id],
      name: "combo_items_item_fk",
    }).onDelete("restrict"),
    check("combo_items_quantity_check", sql`${table.quantity} > 0`),
    check("combo_items_sort_check", sql`${table.sortOrder} >= 0`),
  ],
);
