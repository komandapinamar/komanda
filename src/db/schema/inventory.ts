import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { catalogItems } from "./catalog";
import { tenantLocations, tenants } from "./platform";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
    .defaultNow()
    .notNull(),
};

export type InventoryMovementReason =
  | "sale"
  | "cancellation_restock"
  | "manual_adjustment"
  | "waste_spoilage"
  | "initial_intake"
  | "transfer";

export const inventoryLevels = pgTable(
  "inventory_levels",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id").notNull(),
    locationId: uuid("location_id").notNull(),
    itemId: uuid("item_id").notNull(),
    availableQuantity: integer("available_quantity").default(0).notNull(),
    reservedQuantity: integer("reserved_quantity").default(0).notNull(),
    minAlertQuantity: integer("min_alert_quantity").default(0).notNull(),
    ...timestamps,
  },
  (table) => [
    foreignKey({
      columns: [table.tenantId],
      foreignColumns: [tenants.id],
      name: "inventory_levels_tenant_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.tenantId, table.locationId],
      foreignColumns: [tenantLocations.tenantId, tenantLocations.id],
      name: "inventory_levels_location_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.tenantId, table.itemId],
      foreignColumns: [catalogItems.tenantId, catalogItems.id],
      name: "inventory_levels_item_fk",
    }).onDelete("restrict"),
    unique("inventory_levels_tenant_id_id_key").on(table.tenantId, table.id),
    uniqueIndex("inventory_levels_location_item_uidx").on(
      table.tenantId,
      table.locationId,
      table.itemId,
    ),
    check(
      "inventory_levels_available_check",
      sql`${table.availableQuantity} >= 0`,
    ),
    check(
      "inventory_levels_reserved_check",
      sql`${table.reservedQuantity} >= 0`,
    ),
    check(
      "inventory_levels_alert_check",
      sql`${table.minAlertQuantity} >= 0`,
    ),
  ],
);

export const inventoryMovements = pgTable(
  "inventory_movements",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id").notNull(),
    locationId: uuid("location_id").notNull(),
    itemId: uuid("item_id").notNull(),
    quantityDelta: integer("quantity_delta").notNull(),
    reason: text("reason").$type<InventoryMovementReason>().notNull(),
    referenceOrderId: uuid("reference_order_id"),
    actorUserId: text("actor_user_id"),
    notes: text("notes"),
    occurredAt: timestamp("occurred_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.tenantId],
      foreignColumns: [tenants.id],
      name: "inventory_movements_tenant_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.tenantId, table.locationId],
      foreignColumns: [tenantLocations.tenantId, tenantLocations.id],
      name: "inventory_movements_location_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.tenantId, table.itemId],
      foreignColumns: [catalogItems.tenantId, catalogItems.id],
      name: "inventory_movements_item_fk",
    }).onDelete("restrict"),
    unique("inventory_movements_tenant_id_id_key").on(table.tenantId, table.id),
    index("inventory_movements_lookup_idx").on(
      table.tenantId,
      table.locationId,
      table.itemId,
      table.occurredAt,
    ),
    check(
      "inventory_movements_reason_check",
      sql`${table.reason} in ('sale', 'cancellation_restock', 'manual_adjustment', 'waste_spoilage', 'initial_intake', 'transfer')`,
    ),
    check(
      "inventory_movements_delta_check",
      sql`${table.quantityDelta} != 0`,
    ),
  ],
);
