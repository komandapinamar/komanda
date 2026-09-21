import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { tenants } from "./platform";
import { tenantOrders } from "./commerce";

export type DiscountType = "percentage" | "fixed_amount";
export type DiscountScope = "global" | "category" | "item";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
    .defaultNow()
    .notNull(),
};

export const discounts = pgTable(
  "discounts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id").notNull(),
    code: text("code").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    discountType: text("discount_type").$type<DiscountType>().notNull(),
    discountValue: numeric("discount_value", { precision: 12, scale: 2 }).notNull(),
    minOrderAmount: numeric("min_order_amount", { precision: 12, scale: 2 })
      .default("0")
      .notNull(),
    maxRedemptions: integer("max_redemptions"),
    redemptionsCount: integer("redemptions_count").default(0).notNull(),
    startsAt: timestamp("starts_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true, mode: "date" }),
    scope: text("scope").$type<DiscountScope>().default("global").notNull(),
    targetCategoryIds: jsonb("target_category_ids").$type<string[]>().default([]).notNull(),
    targetItemIds: jsonb("target_item_ids").$type<string[]>().default([]).notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    version: integer("version").default(1).notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true, mode: "date" }),
    ...timestamps,
  },
  (table) => [
    foreignKey({
      columns: [table.tenantId],
      foreignColumns: [tenants.id],
      name: "discounts_tenant_fk",
    }).onDelete("restrict"),
    unique("discounts_tenant_id_id_key").on(table.tenantId, table.id),
    unique("discounts_tenant_code_key").on(table.tenantId, table.code),
    index("discounts_tenant_active_idx").on(
      table.tenantId,
      table.isActive,
      table.startsAt,
      table.endsAt,
    ),
    check(
      "discounts_type_check",
      sql`${table.discountType} in ('percentage', 'fixed_amount')`,
    ),
    check(
      "discounts_scope_check",
      sql`${table.scope} in ('global', 'category', 'item')`,
    ),
    check(
      "discounts_value_positive_check",
      sql`${table.discountValue} > 0 and ${table.minOrderAmount} >= 0`,
    ),
    check(
      "discounts_percentage_bounds_check",
      sql`${table.discountType} != 'percentage' or ${table.discountValue} <= 100`,
    ),
    check(
      "discounts_dates_order_check",
      sql`${table.endsAt} is null or ${table.endsAt} >= ${table.startsAt}`,
    ),
    check(
      "discounts_redemptions_bounds_check",
      sql`${table.redemptionsCount} >= 0 and (${table.maxRedemptions} is null or ${table.maxRedemptions} >= ${table.redemptionsCount})`,
    ),
    check("discounts_version_positive_check", sql`${table.version} > 0`),
  ],
);

export const discountRedemptions = pgTable(
  "discount_redemptions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id").notNull(),
    discountId: uuid("discount_id").notNull(),
    orderId: uuid("order_id").notNull(),
    cartId: uuid("cart_id").notNull(),
    amountDeducted: numeric("amount_deducted", { precision: 12, scale: 2 }).notNull(),
    codeSnapshot: text("code_snapshot").notNull(),
    status: text("status")
      .$type<"redeemed" | "order_cancelled">()
      .default("redeemed")
      .notNull(),
    redeemedAt: timestamp("redeemed_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.tenantId],
      foreignColumns: [tenants.id],
      name: "discount_redemptions_tenant_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.tenantId, table.discountId],
      foreignColumns: [discounts.tenantId, discounts.id],
      name: "discount_redemptions_discount_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.tenantId, table.orderId],
      foreignColumns: [tenantOrders.tenantId, tenantOrders.id],
      name: "discount_redemptions_order_fk",
    }).onDelete("restrict"),
    unique("discount_redemptions_order_key").on(table.tenantId, table.orderId),
    index("discount_redemptions_discount_idx").on(table.tenantId, table.discountId),
  ],
);
