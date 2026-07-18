import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
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

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
    .defaultNow()
    .notNull(),
};

export type TenantStatus = "onboarding" | "active" | "suspended";
export type UserStatus = "pending_verification" | "active" | "disabled";
export type MembershipStatus = "active" | "revoked";

export const tenants = pgTable(
  "tenants",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    normalizedSlug: text("normalized_slug").notNull(),
    status: text("status").$type<TenantStatus>().default("onboarding").notNull(),
    defaultCurrency: text("default_currency").default("ARS").notNull(),
    defaultTimezone: text("default_timezone")
      .default("America/Argentina/Buenos_Aires")
      .notNull(),
    version: integer("version").default(1).notNull(),
    activatedAt: timestamp("activated_at", { withTimezone: true, mode: "date" }),
    suspendedAt: timestamp("suspended_at", { withTimezone: true, mode: "date" }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("tenants_normalized_slug_uidx").on(table.normalizedSlug),
    unique("tenants_id_tenant_key").on(table.id, table.id),
    check("tenants_currency_format_check", sql`char_length(${table.defaultCurrency}) = 3`),
    check("tenants_version_positive_check", sql`${table.version} > 0`),
  ],
);

export const tenantLocations = pgTable(
  "tenant_locations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id").notNull(),
    name: text("name").notNull(),
    timezone: text("timezone").notNull(),
    status: text("status").$type<"active" | "inactive">().default("active").notNull(),
    isPrimary: boolean("is_primary").default(false).notNull(),
    address: jsonb("address").$type<Record<string, unknown> | null>(),
    ...timestamps,
  },
  (table) => [
    foreignKey({
      columns: [table.tenantId],
      foreignColumns: [tenants.id],
      name: "tenant_locations_tenant_fk",
    }).onDelete("restrict"),
    unique("tenant_locations_tenant_id_id_key").on(table.tenantId, table.id),
    uniqueIndex("tenant_locations_one_primary_uidx")
      .on(table.tenantId)
      .where(sql`${table.isPrimary} = true`),
    index("tenant_locations_tenant_status_idx").on(table.tenantId, table.status),
  ],
);

export const users = pgTable(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    email: text("email").notNull(),
    normalizedEmail: text("normalized_email").notNull(),
    passwordHash: text("password_hash").notNull(),
    status: text("status")
      .$type<UserStatus>()
      .default("pending_verification")
      .notNull(),
    emailVerifiedAt: timestamp("email_verified_at", {
      withTimezone: true,
      mode: "date",
    }),
    ...timestamps,
  },
  (table) => [uniqueIndex("users_normalized_email_uidx").on(table.normalizedEmail)],
);

export const userSessions = pgTable(
  "user_sessions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenDigest: text("token_digest").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true, mode: "date" }),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("user_sessions_token_digest_uidx").on(table.tokenDigest),
    index("user_sessions_user_active_idx").on(table.userId, table.expiresAt),
  ],
);

export const identityVerificationChallenges = pgTable(
  "identity_verification_challenges",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    purpose: text("purpose").default("email_verification").notNull(),
    tokenDigest: text("token_digest").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true, mode: "date" }),
    attemptCount: integer("attempt_count").default(0).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("identity_challenges_token_digest_uidx").on(table.tokenDigest),
    uniqueIndex("identity_challenges_one_active_uidx")
      .on(table.userId, table.purpose)
      .where(sql`${table.consumedAt} is null`),
    check("identity_challenges_attempt_count_check", sql`${table.attemptCount} >= 0`),
  ],
);

export const onboardingHandoffs = pgTable(
  "onboarding_handoffs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id").notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenDigest: text("token_digest").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true, mode: "date" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.tenantId],
      foreignColumns: [tenants.id],
      name: "onboarding_handoffs_tenant_fk",
    }).onDelete("restrict"),
    uniqueIndex("onboarding_handoffs_token_digest_uidx").on(table.tokenDigest),
    uniqueIndex("onboarding_handoffs_one_active_uidx")
      .on(table.tenantId, table.userId)
      .where(sql`${table.consumedAt} is null`),
  ],
);

export const tenantMemberships = pgTable(
  "tenant_memberships",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id").notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    role: text("role").$type<"owner">().default("owner").notNull(),
    status: text("status").$type<MembershipStatus>().default("active").notNull(),
    ...timestamps,
  },
  (table) => [
    foreignKey({
      columns: [table.tenantId],
      foreignColumns: [tenants.id],
      name: "tenant_memberships_tenant_fk",
    }).onDelete("restrict"),
    unique("tenant_memberships_tenant_id_id_key").on(table.tenantId, table.id),
    unique("tenant_memberships_tenant_user_key").on(table.tenantId, table.userId),
    index("tenant_memberships_user_status_idx").on(table.userId, table.status),
  ],
);

export const tenantSettings = pgTable(
  "tenant_settings",
  {
    tenantId: uuid("tenant_id").primaryKey(),
    contactName: text("contact_name"),
    contactEmail: text("contact_email"),
    contactPhone: text("contact_phone"),
    salesEnabled: boolean("sales_enabled").default(false).notNull(),
    printingEnabled: boolean("printing_enabled").default(false).notNull(),
    orderPrefix: text("order_prefix").default("K").notNull(),
    branding: jsonb("branding").$type<Record<string, unknown>>().default({}).notNull(),
    version: integer("version").default(1).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.tenantId],
      foreignColumns: [tenants.id],
      name: "tenant_settings_tenant_fk",
    }).onDelete("restrict"),
    check("tenant_settings_version_positive_check", sql`${table.version} > 0`),
    check(
      "tenant_settings_order_prefix_check",
      sql`${table.orderPrefix} ~ '^[A-Z0-9]{1,8}$'`,
    ),
  ],
);

export const tenantCounters = pgTable(
  "tenant_counters",
  {
    tenantId: uuid("tenant_id").notNull(),
    counterType: text("counter_type").notNull(),
    currentValue: bigint("current_value", { mode: "bigint" })
      .default(sql`0`)
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.tenantId, table.counterType] }),
    foreignKey({
      columns: [table.tenantId],
      foreignColumns: [tenants.id],
      name: "tenant_counters_tenant_fk",
    }).onDelete("restrict"),
    check("tenant_counters_nonnegative_check", sql`${table.currentValue} >= 0`),
  ],
);
