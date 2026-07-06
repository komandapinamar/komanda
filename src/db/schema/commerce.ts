import { sql } from "drizzle-orm";
import {
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
import {
  addonGroups,
  addonOptions,
  catalogCombos,
  catalogItems,
} from "./catalog";
import { tenantLocations, tenants } from "./platform";
import { integrationAccounts } from "./integrations";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
    .defaultNow()
    .notNull(),
};

export const carts = pgTable(
  "carts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id").notNull(),
    locationId: uuid("location_id").notNull(),
    status: text("status")
      .$type<"open" | "validated" | "checkout_started" | "converted" | "expired">()
      .default("open")
      .notNull(),
    currency: text("currency").notNull(),
    subtotal: numeric("subtotal", { precision: 12, scale: 2 }).notNull(),
    discountTotal: numeric("discount_total", { precision: 12, scale: 2 })
      .default("0")
      .notNull(),
    total: numeric("total", { precision: 12, scale: 2 }).notNull(),
    catalogRevision: integer("catalog_revision").default(1).notNull(),
    verifiedAt: timestamp("verified_at", { withTimezone: true, mode: "date" }),
    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
    version: integer("version").default(1).notNull(),
    ...timestamps,
  },
  (table) => [
    foreignKey({
      columns: [table.tenantId],
      foreignColumns: [tenants.id],
      name: "carts_tenant_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.tenantId, table.locationId],
      foreignColumns: [tenantLocations.tenantId, tenantLocations.id],
      name: "carts_location_fk",
    }).onDelete("restrict"),
    unique("carts_tenant_id_id_key").on(table.tenantId, table.id),
    index("carts_tenant_expires_idx").on(table.tenantId, table.expiresAt),
    index("carts_tenant_status_updated_idx").on(
      table.tenantId,
      table.status,
      table.updatedAt,
    ),
    check("carts_currency_check", sql`char_length(${table.currency}) = 3`),
    check("carts_amounts_check", sql`${table.subtotal} >= 0 and ${table.discountTotal} >= 0 and ${table.total} >= 0`),
    check("carts_version_check", sql`${table.version} > 0`),
  ],
);

export const cartLines = pgTable(
  "cart_lines",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id").notNull(),
    cartId: uuid("cart_id").notNull(),
    itemId: uuid("item_id"),
    comboId: uuid("combo_id"),
    quantity: integer("quantity").notNull(),
    nameSnapshot: text("name_snapshot").notNull(),
    unitPriceSnapshot: numeric("unit_price_snapshot", {
      precision: 12,
      scale: 2,
    }).notNull(),
    lineTotal: numeric("line_total", { precision: 12, scale: 2 }).notNull(),
    imageUrlSnapshot: text("image_url_snapshot"),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.tenantId, table.cartId],
      foreignColumns: [carts.tenantId, carts.id],
      name: "cart_lines_cart_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.tenantId, table.itemId],
      foreignColumns: [catalogItems.tenantId, catalogItems.id],
      name: "cart_lines_item_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.tenantId, table.comboId],
      foreignColumns: [catalogCombos.tenantId, catalogCombos.id],
      name: "cart_lines_combo_fk",
    }).onDelete("restrict"),
    unique("cart_lines_tenant_id_id_key").on(table.tenantId, table.id),
    index("cart_lines_tenant_cart_idx").on(table.tenantId, table.cartId),
    check(
      "cart_lines_one_resource_check",
      sql`((${table.itemId} is not null)::int + (${table.comboId} is not null)::int) = 1`,
    ),
    check("cart_lines_quantity_check", sql`${table.quantity} > 0`),
    check("cart_lines_amount_check", sql`${table.unitPriceSnapshot} >= 0 and ${table.lineTotal} >= 0`),
  ],
);

export const cartLineOptions = pgTable(
  "cart_line_options",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id").notNull(),
    cartLineId: uuid("cart_line_id").notNull(),
    addonGroupId: uuid("addon_group_id").notNull(),
    addonOptionId: uuid("addon_option_id").notNull(),
    nameSnapshot: text("name_snapshot").notNull(),
    priceDeltaSnapshot: numeric("price_delta_snapshot", {
      precision: 12,
      scale: 2,
    }).notNull(),
    quantity: integer("quantity").default(1).notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.tenantId, table.cartLineId],
      foreignColumns: [cartLines.tenantId, cartLines.id],
      name: "cart_line_options_line_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.tenantId, table.addonGroupId],
      foreignColumns: [addonGroups.tenantId, addonGroups.id],
      name: "cart_line_options_group_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.tenantId, table.addonOptionId],
      foreignColumns: [addonOptions.tenantId, addonOptions.id],
      name: "cart_line_options_option_fk",
    }).onDelete("restrict"),
    unique("cart_line_options_tenant_id_id_key").on(table.tenantId, table.id),
    index("cart_line_options_tenant_line_idx").on(
      table.tenantId,
      table.cartLineId,
    ),
    check("cart_line_options_quantity_check", sql`${table.quantity} > 0`),
  ],
);

export const paymentAttempts = pgTable(
  "payment_attempts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id").notNull(),
    cartId: uuid("cart_id").notNull(),
    integrationAccountId: uuid("integration_account_id").notNull(),
    providerPreferenceId: text("provider_preference_id"),
    providerPaymentId: text("provider_payment_id"),
    status: text("status")
      .$type<
        | "initiated"
        | "processing"
        | "pending"
        | "approved"
        | "rejected"
        | "failed"
        | "duplicate"
      >()
      .default("initiated")
      .notNull(),
    amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
    currency: text("currency").notNull(),
    customerSnapshot: jsonb("customer_snapshot").$type<Record<string, unknown>>().notNull(),
    notes: text("notes"),
    idempotencyKey: text("idempotency_key").notNull(),
    processedAt: timestamp("processed_at", { withTimezone: true, mode: "date" }),
    failureCode: text("failure_code"),
    ...timestamps,
  },
  (table) => [
    foreignKey({
      columns: [table.tenantId, table.cartId],
      foreignColumns: [carts.tenantId, carts.id],
      name: "payment_attempts_cart_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.tenantId, table.integrationAccountId],
      foreignColumns: [integrationAccounts.tenantId, integrationAccounts.id],
      name: "payment_attempts_integration_fk",
    }).onDelete("restrict"),
    unique("payment_attempts_tenant_id_id_key").on(table.tenantId, table.id),
    unique("payment_attempts_tenant_idempotency_key").on(
      table.tenantId,
      table.idempotencyKey,
    ),
    index("payment_attempts_tenant_payment_idx").on(
      table.tenantId,
      table.providerPaymentId,
    ),
    check("payment_attempts_amount_check", sql`${table.amount} > 0`),
  ],
);
