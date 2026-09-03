import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { tenants } from "./platform";
import { tenantOrders } from "./commerce";

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
