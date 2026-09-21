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
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { tenantOrders } from "./commerce";
import { tenantLocations, tenants } from "./platform";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
    .defaultNow()
    .notNull(),
};

export type PrinterStationType = "kitchen" | "bar" | "cashier" | "runner" | "custom";
export type PrinterConnectionType = "network_tcp" | "usb" | "bluetooth" | "agent";

export const printerDestinations = pgTable(
  "printer_destinations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id").notNull(),
    locationId: uuid("location_id").notNull(),
    name: text("name").notNull(),
    stationType: text("station_type")
      .$type<PrinterStationType>()
      .default("kitchen")
      .notNull(),
    connectionType: text("connection_type")
      .$type<PrinterConnectionType>()
      .default("network_tcp")
      .notNull(),
    ipAddress: text("ip_address"),
    port: integer("port").default(9100).notNull(),
    assignedAgentId: uuid("assigned_agent_id"),
    isActive: boolean("is_active").default(true).notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),
    ...timestamps,
  },
  (table) => [
    foreignKey({
      columns: [table.tenantId],
      foreignColumns: [tenants.id],
      name: "printer_destinations_tenant_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.tenantId, table.locationId],
      foreignColumns: [tenantLocations.tenantId, tenantLocations.id],
      name: "printer_destinations_location_fk",
    }).onDelete("restrict"),
    unique("printer_destinations_tenant_id_id_key").on(table.tenantId, table.id),
    index("printer_destinations_tenant_loc_idx").on(
      table.tenantId,
      table.locationId,
      table.isActive,
    ),
    check(
      "printer_destinations_station_type_check",
      sql`${table.stationType} in ('kitchen', 'bar', 'cashier', 'runner', 'custom')`,
    ),
    check(
      "printer_destinations_connection_type_check",
      sql`${table.connectionType} in ('network_tcp', 'usb', 'bluetooth', 'agent')`,
    ),
    check(
      "printer_destinations_port_check",
      sql`${table.port} > 0 and ${table.port} <= 65535`,
    ),
    check(
      "printer_destinations_sort_order_check",
      sql`${table.sortOrder} >= 0`,
    ),
  ],
);

export const printAgents = pgTable(
  "print_agents",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id").notNull(),
    locationId: uuid("location_id").notNull(),
    name: text("name").notNull(),
    tokenPrefix: text("token_prefix").notNull(),
    tokenDigest: text("token_digest").notNull(),
    status: text("status").$type<"active" | "revoked">().default("active").notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true, mode: "date" }),
    ...timestamps,
  },
  (table) => [
    foreignKey({
      columns: [table.tenantId],
      foreignColumns: [tenants.id],
      name: "print_agents_tenant_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.tenantId, table.locationId],
      foreignColumns: [tenantLocations.tenantId, tenantLocations.id],
      name: "print_agents_location_fk",
    }).onDelete("restrict"),
    unique("print_agents_tenant_id_id_key").on(table.tenantId, table.id),
    uniqueIndex("print_agents_token_prefix_uidx").on(table.tokenPrefix),
    index("print_agents_tenant_location_status_idx").on(
      table.tenantId,
      table.locationId,
      table.status,
    ),
  ],
);

export const printAgentPairings = pgTable(
  "print_agent_pairings",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id").notNull(),
    locationId: uuid("location_id").notNull(),
    codeDigest: text("code_digest").notNull(),
    status: text("status").$type<"pending" | "claimed" | "expired">().default("pending").notNull(),
    attempts: integer("attempts").default(0).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
    claimedAgentId: uuid("claimed_agent_id"),
    ...timestamps,
  },
  (table) => [
    foreignKey({ columns: [table.tenantId], foreignColumns: [tenants.id], name: "print_pairings_tenant_fk" }).onDelete("restrict"),
    foreignKey({ columns: [table.tenantId, table.locationId], foreignColumns: [tenantLocations.tenantId, tenantLocations.id], name: "print_pairings_location_fk" }).onDelete("restrict"),
    foreignKey({ columns: [table.tenantId, table.claimedAgentId], foreignColumns: [printAgents.tenantId, printAgents.id], name: "print_pairings_agent_fk" }).onDelete("restrict"),
    unique("print_pairings_tenant_id_id_key").on(table.tenantId, table.id),
    uniqueIndex("print_pairings_code_digest_uidx").on(table.codeDigest),
    index("print_pairings_tenant_location_status_idx").on(table.tenantId, table.locationId, table.status),
    check("print_pairings_attempts_check", sql`${table.attempts} >= 0 AND ${table.attempts} <= 5`),
    check("print_pairings_status_check", sql`${table.status} in ('pending', 'claimed', 'expired')`),
  ],
);

export const tenantPrintJobs = pgTable(
  "print_jobs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id").notNull(),
    locationId: uuid("location_id").notNull(),
    orderId: uuid("order_id").notNull(),
    destinationStationId: uuid("destination_station_id"),
    stationType: text("station_type")
      .$type<PrinterStationType | "all">()
      .default("all")
      .notNull(),
    status: text("status")
      .$type<"pending" | "processing" | "printed" | "failed" | "cancelled">()
      .default("pending")
      .notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    attemptCount: integer("attempt_count").default(0).notNull(),
    claimedByAgentId: uuid("claimed_by_agent_id"),
    leaseExpiresAt: timestamp("lease_expires_at", {
      withTimezone: true,
      mode: "date",
    }),
    nextAttemptAt: timestamp("next_attempt_at", {
      withTimezone: true,
      mode: "date",
    }),
    printedAt: timestamp("printed_at", { withTimezone: true, mode: "date" }),
    lastErrorCode: text("last_error_code"),
    lastErrorMessage: text("last_error_message"),
    ...timestamps,
  },
  (table) => [
    foreignKey({
      columns: [table.tenantId],
      foreignColumns: [tenants.id],
      name: "print_jobs_tenant_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.tenantId, table.locationId],
      foreignColumns: [tenantLocations.tenantId, tenantLocations.id],
      name: "print_jobs_location_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.tenantId, table.orderId],
      foreignColumns: [tenantOrders.tenantId, tenantOrders.id],
      name: "print_jobs_order_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.tenantId, table.claimedByAgentId],
      foreignColumns: [printAgents.tenantId, printAgents.id],
      name: "print_jobs_agent_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.tenantId, table.destinationStationId],
      foreignColumns: [printerDestinations.tenantId, printerDestinations.id],
      name: "print_jobs_station_fk",
    }).onDelete("set null"),
    unique("print_jobs_tenant_id_id_key").on(table.tenantId, table.id),
    unique("print_jobs_tenant_idempotency_key").on(
      table.tenantId,
      table.idempotencyKey,
    ),
    index("print_jobs_tenant_location_status_idx").on(
      table.tenantId,
      table.locationId,
      table.status,
      table.nextAttemptAt,
    ),
    check("print_jobs_attempt_count_check", sql`${table.attemptCount} >= 0`),
    check(
      "print_jobs_station_type_check",
      sql`${table.stationType} in ('kitchen', 'bar', 'cashier', 'runner', 'custom', 'all')`,
    ),
  ],
);

export const printJobAttempts = pgTable(
  "print_job_attempts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id").notNull(),
    printJobId: uuid("print_job_id").notNull(),
    agentId: uuid("agent_id").notNull(),
    attemptNumber: integer("attempt_number").notNull(),
    status: text("status")
      .$type<"claimed" | "printed" | "failed" | "lease_expired">()
      .notNull(),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    startedAt: timestamp("started_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    finishedAt: timestamp("finished_at", { withTimezone: true, mode: "date" }),
  },
  (table) => [
    foreignKey({
      columns: [table.tenantId, table.printJobId],
      foreignColumns: [tenantPrintJobs.tenantId, tenantPrintJobs.id],
      name: "print_job_attempts_job_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.tenantId, table.agentId],
      foreignColumns: [printAgents.tenantId, printAgents.id],
      name: "print_job_attempts_agent_fk",
    }).onDelete("restrict"),
    unique("print_job_attempts_tenant_id_id_key").on(table.tenantId, table.id),
    unique("print_job_attempts_job_attempt_key").on(
      table.tenantId,
      table.printJobId,
      table.attemptNumber,
      table.status,
    ),
    index("print_job_attempts_tenant_job_idx").on(
      table.tenantId,
      table.printJobId,
    ),
    check("print_job_attempts_number_check", sql`${table.attemptNumber} > 0`),
  ],
);
