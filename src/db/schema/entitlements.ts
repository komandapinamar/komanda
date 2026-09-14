import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { tenants } from "./platform";

export type OperationalEntitlements = {
  catalog_management: boolean;
  online_payments: boolean;
  printing: boolean;
};

export const planDefinitions = pgTable(
  "plan_definitions",
  {
    planId: text("plan_id").notNull(),
    version: integer("version").notNull(),
    status: text("status").$type<"active" | "inactive">().notNull(),
    entitlements: jsonb("entitlements").$type<OperationalEntitlements>().notNull(),
    effectiveFrom: timestamp("effective_from", { withTimezone: true, mode: "date" }).notNull(),
    retiredAt: timestamp("retired_at", { withTimezone: true, mode: "date" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.planId, table.version] }),
    check("plan_definitions_version_check", sql`${table.version} > 0`),
  ],
);

export const tenantEntitlementSnapshots = pgTable(
  "tenant_entitlement_snapshots",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "restrict" }),
    planId: text("plan_id").notNull(),
    planVersion: integer("plan_version").notNull(),
    entitlements: jsonb("entitlements").$type<OperationalEntitlements>().notNull(),
    sourceRequestId: text("source_request_id").notNull(),
    effectiveAt: timestamp("effective_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    supersededAt: timestamp("superseded_at", { withTimezone: true, mode: "date" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.planId, table.planVersion],
      foreignColumns: [planDefinitions.planId, planDefinitions.version],
      name: "tenant_entitlement_snapshots_plan_fk",
    }).onDelete("restrict"),
    unique("tenant_entitlement_snapshots_tenant_id_id_key").on(
      table.tenantId,
      table.id,
    ),
    unique("tenant_entitlement_snapshots_source_request_key").on(
      table.tenantId,
      table.sourceRequestId,
    ),
    uniqueIndex("tenant_entitlement_snapshots_one_current_uidx")
      .on(table.tenantId)
      .where(sql`${table.supersededAt} is null`),
    index("tenant_entitlement_snapshots_tenant_effective_idx").on(
      table.tenantId,
      table.effectiveAt,
    ),
  ],
);
