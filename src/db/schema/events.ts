import { sql } from "drizzle-orm";
import {
  bigint,
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

export const outboxEvents = pgTable(
  "outbox_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "restrict" }),
    aggregateType: text("aggregate_type").notNull(),
    aggregateId: uuid("aggregate_id").notNull(),
    eventType: text("event_type").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().default({}).notNull(),
    sequence: bigint("sequence", { mode: "bigint" }).notNull(),
    availableAt: timestamp("available_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    publishedAt: timestamp("published_at", { withTimezone: true, mode: "date" }),
    attempts: integer("attempts").default(0).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique("outbox_events_tenant_id_id_key").on(table.tenantId, table.id),
    unique("outbox_events_tenant_sequence_key").on(table.tenantId, table.sequence),
    index("outbox_events_delivery_idx").on(table.publishedAt, table.availableAt),
    check("outbox_events_attempts_check", sql`${table.attempts} >= 0`),
  ],
);

export const idempotencyRecords = pgTable(
  "idempotency_records",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "restrict" }),
    scope: text("scope").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    requestHash: text("request_hash").notNull(),
    state: text("state").$type<"processing" | "completed" | "failed">().notNull(),
    responseStatus: integer("response_status"),
    responseBody: jsonb("response_body").$type<unknown>(),
    lockedUntil: timestamp("locked_until", { withTimezone: true, mode: "date" }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique("idempotency_records_tenant_scope_key").on(
      table.tenantId,
      table.scope,
      table.idempotencyKey,
    ).nullsNotDistinct(),
    index("idempotency_records_expiry_idx").on(table.expiresAt),
  ],
);

export const orderEvents = pgTable(
  "order_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id").notNull(),
    orderId: uuid("order_id").notNull(),
    sequence: bigint("sequence", { mode: "bigint" }).notNull(),
    eventType: text("event_type").notNull(),
    fromStatus: text("from_status"),
    toStatus: text("to_status"),
    actorUserId: uuid("actor_user_id"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}).notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.tenantId],
      foreignColumns: [tenants.id],
      name: "order_events_tenant_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.tenantId, table.orderId],
      foreignColumns: [tenantOrders.tenantId, tenantOrders.id],
      name: "order_events_order_fk",
    }).onDelete("restrict"),
    unique("order_events_tenant_id_id_key").on(table.tenantId, table.id),
    unique("order_events_tenant_sequence_key").on(table.tenantId, table.sequence),
    index("order_events_tenant_order_idx").on(table.tenantId, table.orderId),
    index("order_events_tenant_sequence_idx").on(table.tenantId, table.sequence),
  ],
);
