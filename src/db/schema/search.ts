import {
  boolean,
  foreignKey,
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { tenants } from "./platform";
import { catalogItems } from "./catalog";

export const publicSearchTenants = pgTable(
  "public_search_tenants",
  {
    tenantId: uuid("tenant_id")
      .primaryKey()
      .references(() => tenants.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    slug: text("slug").notNull().unique(),
    locationName: text("location_name"),
    locationAddress: text("location_address"),
    lat: numeric("lat", { precision: 9, scale: 6 }),
    lng: numeric("lng", { precision: 9, scale: 6 }),
    categoriesCount: integer("categories_count").default(0).notNull(),
    isPubliclyEligible: boolean("is_publicly_eligible").default(false).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("public_search_tenants_eligible_idx").on(table.isPubliclyEligible),
    uniqueIndex("public_search_tenants_slug_uidx").on(table.slug),
  ],
);

export const catalogSearchEntries = pgTable(
  "catalog_search_entries",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    tenantSlug: text("tenant_slug").notNull(),
    tenantName: text("tenant_name").notNull(),
    itemId: uuid("item_id").notNull(),
    itemName: text("item_name").notNull(),
    categoryId: uuid("category_id").notNull(),
    categoryName: text("category_name").notNull(),
    description: text("description"),
    price: numeric("price", { precision: 12, scale: 2 }).notNull(),
    currency: text("currency").notNull(),
    imageUrl: text("image_url"),
    isAvailable: boolean("is_available").default(true).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique("catalog_search_entries_item_id_key").on(table.itemId),
    unique("catalog_search_entries_tenant_item_unique").on(
      table.tenantId,
      table.itemId,
    ),
    foreignKey({
      columns: [table.tenantId, table.itemId],
      foreignColumns: [catalogItems.tenantId, catalogItems.id],
      name: "catalog_search_entries_tenant_item_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.tenantId],
      foreignColumns: [publicSearchTenants.tenantId],
      name: "catalog_search_entries_public_tenant_fk",
    }).onDelete("cascade"),
    index("catalog_search_entries_tenant_idx").on(table.tenantId),
    index("catalog_search_entries_category_idx").on(table.categoryId),
    index("catalog_search_entries_available_idx").on(table.isAvailable),
  ],
);
