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
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { tenants, tenantLocations } from "./platform";
import { cashShifts, tenantOrders } from "./commerce";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
    .defaultNow()
    .notNull(),
};

export type DeviceType = "mobile" | "tablet" | "desktop" | "unknown";

export const storefrontSessions = pgTable(
  "storefront_sessions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id").notNull(),
    sessionKey: text("session_key").notNull(),
    deviceType: text("device_type").$type<DeviceType>().default("unknown").notNull(),
    dwellTimeSeconds: integer("dwell_time_seconds").default(0).notNull(),
    categoryDwellMap: jsonb("category_dwell_map")
      .$type<Record<string, number>>()
      .default({})
      .notNull(),
    itemViewsMap: jsonb("item_views_map")
      .$type<Record<string, number>>()
      .default({})
      .notNull(),
    cartCreated: boolean("cart_created").default(false).notNull(),
    orderPlaced: boolean("order_placed").default(false).notNull(),
    associatedOrderId: uuid("associated_order_id"),
    startedAt: timestamp("started_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    lastActiveAt: timestamp("last_active_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    ...timestamps,
  },
  (table) => [
    foreignKey({
      columns: [table.tenantId],
      foreignColumns: [tenants.id],
      name: "storefront_sessions_tenant_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.tenantId, table.associatedOrderId],
      foreignColumns: [tenantOrders.tenantId, tenantOrders.id],
      name: "storefront_sessions_order_fk",
    }).onDelete("set null"),
    unique("storefront_sessions_tenant_id_id_key").on(table.tenantId, table.id),
    unique("storefront_sessions_tenant_session_key").on(
      table.tenantId,
      table.sessionKey,
    ),
    index("storefront_sessions_tenant_created_idx").on(
      table.tenantId,
      table.createdAt,
    ),
    index("storefront_sessions_tenant_last_active_idx").on(
      table.tenantId,
      table.lastActiveAt,
    ),
    check(
      "storefront_sessions_dwell_time_check",
      sql`${table.dwellTimeSeconds} >= 0`,
    ),
    check(
      "storefront_sessions_device_type_check",
      sql`${table.deviceType} in ('mobile', 'tablet', 'desktop', 'unknown')`,
    ),
  ],
);

export type CashMovementType =
  | "sale_deposit"
  | "cancellation_withdrawal"
  | "opening_float"
  | "manual_cash_in"
  | "cash_drop"
  | "expense_payout";

export const cashRegisterMovements = pgTable(
  "cash_register_movements",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id").notNull(),
    locationId: uuid("location_id").notNull(),
    shiftId: uuid("shift_id"),
    orderId: uuid("order_id"),
    type: text("type")
      .$type<CashMovementType>()
      .notNull(),
    amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    recordedByUserId: text("recorded_by_user_id"),
    reason: text("reason"),
    idempotencyKey: text("idempotency_key"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    foreignKey({
      columns: [t.tenantId],
      foreignColumns: [tenants.id],
      name: "cash_register_movements_tenant_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [t.tenantId, t.locationId],
      foreignColumns: [tenantLocations.tenantId, tenantLocations.id],
      name: "cash_register_movements_location_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [t.tenantId, t.shiftId],
      foreignColumns: [cashShifts.tenantId, cashShifts.id],
      name: "cash_register_movements_shift_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [t.tenantId, t.orderId],
      foreignColumns: [tenantOrders.tenantId, tenantOrders.id],
      name: "cash_register_movements_order_fk",
    }).onDelete("restrict"),
    unique("cash_register_movements_tenant_id_id_key").on(t.tenantId, t.id),
    unique("cash_movements_tenant_idempotency_key").on(t.tenantId, t.idempotencyKey),
    index("cash_movements_tenant_location_idx").on(
      t.tenantId,
      t.locationId,
      t.occurredAt,
    ),
    index("cash_movements_shift_idx").on(t.tenantId, t.shiftId),
    uniqueIndex("cash_movements_order_type_uniq")
      .on(t.tenantId, t.orderId, t.type)
      .where(sql`${t.orderId} is not null`),
    check(
      "cash_movements_type_check",
      sql`${t.type} in ('sale_deposit', 'cancellation_withdrawal', 'opening_float', 'manual_cash_in', 'cash_drop', 'expense_payout')`,
    ),
    check("cash_movements_amount_check", sql`${t.amount} >= 0`),
  ],
);

export const mpFinancialRecords = pgTable(
  "mp_financial_records",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    locationId: uuid("location_id").notNull(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => tenantOrders.id),
    mpPaymentId: text("mp_payment_id").notNull().unique(),
    grossAmount: numeric("gross_amount", { precision: 12, scale: 2 }).notNull(),
    feeAmount: numeric("fee_amount", { precision: 12, scale: 2 }).notNull(),
    feeDetails: jsonb("fee_details")
      .$type<Array<{ type: string; amount: string; feePayer?: string }>>()
      .default([])
      .notNull(),
    taxesAmount: numeric("taxes_amount", { precision: 12, scale: 2 })
      .notNull()
      .default("0.00"),
    taxesDetails: jsonb("taxes_details")
      .$type<Array<{ type: string; amount: string }>>()
      .default([])
      .notNull(),
    netReceivedAmount: numeric("net_received_amount", {
      precision: 12,
      scale: 2,
    }).notNull(),
    isFeeInclusiveOfTax: boolean("is_fee_inclusive_of_tax")
      .default(false)
      .notNull(),
    moneyReleaseStatus: text("money_release_status")
      .$type<"pending" | "released">()
      .notNull()
      .default("pending"),
    moneyReleaseExpectedAt: timestamp("money_release_expected_at", {
      withTimezone: true,
      mode: "date",
    }),
    moneyReleasedAt: timestamp("money_released_at", {
      withTimezone: true,
      mode: "date",
    }),
    settlementDate: timestamp("settlement_date", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    index("mp_financial_tenant_date_idx").on(
      t.tenantId,
      t.locationId,
      t.settlementDate,
    ),
    index("mp_financial_release_expected_idx").on(
      t.tenantId,
      t.moneyReleaseStatus,
      t.moneyReleaseExpectedAt,
    ),
    unique("mp_financial_tenant_payment_uniq").on(t.tenantId, t.mpPaymentId),
    check(
      "mp_financial_release_status_check",
      sql`${t.moneyReleaseStatus} in ('pending', 'released')`,
    ),
  ],
);

export const storefrontItemEvents = pgTable(
  "storefront_item_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    locationId: uuid("location_id").notNull(),
    sessionId: text("session_id").notNull(),
    itemId: uuid("item_id").notNull(),
    surface: text("surface").$type<"classic" | "reels">().notNull(),
    eventType: text("event_type")
      .$type<"impression" | "qualified_view" | "dwell_heartbeat" | "cart_add">()
      .notNull(),
    dwellDurationMs: integer("dwell_duration_ms").default(0).notNull(),
    exposureId: text("exposure_id"),
    occurredAt: timestamp("occurred_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    index("item_events_tenant_item_idx").on(t.tenantId, t.itemId, t.occurredAt),
    index("item_events_tenant_occurred_idx").on(t.tenantId, t.occurredAt),
    index("item_events_purge_idx").on(t.occurredAt),
    check(
      "item_events_surface_check",
      sql`${t.surface} in ('classic', 'reels')`,
    ),
    check(
      "item_events_event_type_check",
      sql`${t.eventType} in ('impression', 'qualified_view', 'dwell_heartbeat', 'cart_add')`,
    ),
    check("item_events_dwell_check", sql`${t.dwellDurationMs} >= 0`),
  ],
);

export type StorefrontItemEvent = typeof storefrontItemEvents.$inferSelect;
export type NewStorefrontItemEvent = typeof storefrontItemEvents.$inferInsert;

