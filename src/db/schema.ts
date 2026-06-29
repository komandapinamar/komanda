import {
  integer,
  index,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import type {
  CheckoutPaymentPrintStatus,
  CheckoutPaymentStatus,
  CustomerInfo,
  OfficialCartLine,
  OrderRequestMetadata,
  OrderStatus,
  PrintJobPayload,
  PrintJobStatus,
} from "@/types/types";

// for now, neondb will only store temporary carts that are already validated
// this is the drizzle table with the attributes for the temporary carts
export const temporaryCarts = pgTable(
  "temporary_carts",
  {
    id: uuid("id").primaryKey(),
    currency: text("currency").notNull(),
    items: jsonb("items").$type<OfficialCartLine[]>().notNull(),
    subtotal: numeric("subtotal", { precision: 10, scale: 2 }).notNull(),
    discountTotal: numeric("discount_total", { precision: 10, scale: 2 }).notNull(),
    total: numeric("total", { precision: 10, scale: 2 }).notNull(),
    verifiedAt: timestamp("verified_at", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
    expiresAt: timestamp("expires_at", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
    createdAt: timestamp("created_at", {
      withTimezone: true,
      mode: "date",
    }).defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", {
      withTimezone: true,
      mode: "date",
    }).defaultNow()
      .notNull(),
  },
  (table) => [index("temporary_carts_expires_at_idx").on(table.expiresAt)],
);

export const checkoutPayments = pgTable(
  "checkout_payments",
  {
    id: uuid("id").primaryKey(),
    cartId: uuid("cart_id").notNull(),
    preferenceId: text("preference_id").notNull(),
    paymentId: text("payment_id"),
    status: text("status").$type<CheckoutPaymentStatus>().notNull(),
    customer: jsonb("customer").$type<CustomerInfo>().notNull(),
    notes: text("notes"),
    amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
    currency: text("currency").notNull(),
    orderId: text("order_id"),
    orderRequestIdempotencyKey: text("order_request_idempotency_key"),
    printJobId: uuid("print_job_id"),
    printStatus: text("print_status")
      .$type<CheckoutPaymentPrintStatus>()
      .default("not_requested")
      .notNull(),
    printRequestedAt: timestamp("print_requested_at", {
      withTimezone: true,
      mode: "date",
    }),
    printCompletedAt: timestamp("print_completed_at", {
      withTimezone: true,
      mode: "date",
    }),
    lastPrintError: text("last_print_error"),
    processedAt: timestamp("processed_at", {
      withTimezone: true,
      mode: "date",
    }),
    rawPayload: jsonb("raw_payload").$type<Record<string, unknown> | null>(),
    createdAt: timestamp("created_at", {
      withTimezone: true,
      mode: "date",
    })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", {
      withTimezone: true,
      mode: "date",
    })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("checkout_payments_cart_id_idx").on(table.cartId),
    index("checkout_payments_preference_id_idx").on(table.preferenceId),
    index("checkout_payments_payment_id_idx").on(table.paymentId),
    index("checkout_payments_print_status_idx").on(table.printStatus),
    uniqueIndex("checkout_payments_order_request_idempotency_key_idx").on(
      table.orderRequestIdempotencyKey,
    ),
  ],
);

export const orders = pgTable(
  "orders",
  {
    id: uuid("id").primaryKey(),
    cartId: uuid("cart_id").notNull(),
    customer: jsonb("customer").$type<CustomerInfo>().notNull(),
    notes: text("notes"),
    status: text("status").$type<OrderStatus>().default("approved").notNull(),
    idempotencyKey: text("idempotency_key"),
    checkoutPaymentId: uuid("checkout_payment_id"),
    paymentId: text("payment_id"),
    preferenceId: text("preference_id"),
    source: text("source"),
    approvedAt: timestamp("approved_at", {
      withTimezone: true,
      mode: "date",
    }),
    metadata: jsonb("metadata").$type<OrderRequestMetadata | null>(),
    createdAt: timestamp("created_at", {
      withTimezone: true,
      mode: "date",
    }).defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", {
      withTimezone: true,
      mode: "date",
    }).defaultNow()
      .notNull(),
  },
  (table) => [
    index("orders_cart_id_idx").on(table.cartId),
    index("orders_checkout_payment_id_idx").on(table.checkoutPaymentId),
    index("orders_payment_id_idx").on(table.paymentId),
    uniqueIndex("orders_idempotency_key_idx").on(table.idempotencyKey),
  ],
);

export const printJobs = pgTable(
  "print_jobs",
  {
    id: uuid("id").primaryKey(),
    checkoutPaymentId: uuid("checkout_payment_id").notNull(),
    orderId: text("order_id").notNull(),
    cartId: uuid("cart_id").notNull(),
    paymentId: text("payment_id").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    status: text("status").$type<PrintJobStatus>().notNull(),
    payload: jsonb("payload").$type<PrintJobPayload>().notNull(),
    attemptCount: integer("attempt_count").default(0).notNull(),
    claimedAt: timestamp("claimed_at", {
      withTimezone: true,
      mode: "date",
    }),
    nextAttemptAt: timestamp("next_attempt_at", {
      withTimezone: true,
      mode: "date",
    }),
    printedAt: timestamp("printed_at", {
      withTimezone: true,
      mode: "date",
    }),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", {
      withTimezone: true,
      mode: "date",
    })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", {
      withTimezone: true,
      mode: "date",
    })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("print_jobs_status_idx").on(table.status),
    index("print_jobs_checkout_payment_id_idx").on(table.checkoutPaymentId),
    index("print_jobs_order_id_idx").on(table.orderId),
    index("print_jobs_next_attempt_at_idx").on(table.nextAttemptAt),
    uniqueIndex("print_jobs_idempotency_key_idx").on(table.idempotencyKey),
  ],
);

export const adminUsers = pgTable(
  "admin_users",
  {
    username: text("username").notNull().primaryKey(),
    passwordHash: text("password_hash").notNull(),
  },
);