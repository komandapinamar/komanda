import { sql } from "drizzle-orm";
import {
  check,
  boolean,
  customType,
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

const bytea = customType<{ data: Buffer }>({
  dataType() {
    return "bytea";
  },
});

export const integrationAccounts = pgTable(
  "integration_accounts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "restrict" }),
    provider: text("provider").$type<"mercadopago">().notNull(),
    providerAccountId: text("provider_account_id").notNull(),
    status: text("status")
      .$type<"pending" | "active" | "expired" | "revoked" | "error">()
      .notNull(),
    encryptedPayload: bytea("encrypted_payload").notNull(),
    encryptionIv: bytea("encryption_iv").notNull(),
    authTag: bytea("auth_tag").notNull(),
    keyVersion: integer("key_version").notNull(),
    scopes: text("scopes").array().default([]).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }),
    lastVerifiedAt: timestamp("last_verified_at", {
      withTimezone: true,
      mode: "date",
    }),
    webhookRoutingKey: uuid("webhook_routing_key").defaultRandom().notNull(),
    version: integer("version").default(1).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique("integration_accounts_tenant_id_id_key").on(table.tenantId, table.id),
    uniqueIndex("integration_accounts_provider_account_uidx").on(
      table.provider,
      table.providerAccountId,
    ),
    uniqueIndex("integration_accounts_routing_key_uidx").on(table.webhookRoutingKey),
    uniqueIndex("integration_accounts_one_active_provider_uidx")
      .on(table.tenantId, table.provider)
      .where(sql`${table.status} in ('pending', 'active', 'expired', 'error')`),
    index("integration_accounts_tenant_status_idx").on(
      table.tenantId,
      table.status,
    ),
    check("integration_accounts_key_version_check", sql`${table.keyVersion} > 0`),
    check("integration_accounts_version_check", sql`${table.version} > 0`),
  ],
);

export const providerResourceRoutes = pgTable(
  "provider_resource_routes",
  {
    provider: text("provider").notNull(),
    resourceType: text("resource_type").notNull(),
    externalId: text("external_id").notNull(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "restrict" }),
    integrationAccountId: uuid("integration_account_id").notNull(),
    localResourceId: uuid("local_resource_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.provider, table.resourceType, table.externalId] }),
    index("provider_resource_routes_tenant_idx").on(table.tenantId),
  ],
);

export const webhookEvents = pgTable(
  "webhook_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "restrict" }),
    provider: text("provider").notNull(),
    providerEventId: text("provider_event_id").notNull(),
    topic: text("topic").notNull(),
    signatureValid: boolean("signature_valid").notNull(),
    status: text("status")
      .$type<"received" | "processing" | "processed" | "ignored" | "failed">()
      .default("received")
      .notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().default({}).notNull(),
    correlationId: uuid("correlation_id").notNull(),
    attempts: integer("attempts").default(0).notNull(),
    processedAt: timestamp("processed_at", { withTimezone: true, mode: "date" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique("webhook_events_tenant_provider_event_topic_key").on(
      table.tenantId,
      table.provider,
      table.providerEventId,
      table.topic,
    ),
    index("webhook_events_tenant_status_idx").on(table.tenantId, table.status),
    check("webhook_events_attempts_check", sql`${table.attempts} >= 0`),
  ],
);
