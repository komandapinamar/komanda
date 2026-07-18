import { sql } from "drizzle-orm";
import {
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

export const tenantPrintJobs = pgTable(
  "print_jobs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id").notNull(),
    locationId: uuid("location_id").notNull(),
    orderId: uuid("order_id").notNull(),
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
