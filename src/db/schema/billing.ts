import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  foreignKey,
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  unique,
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

export type FiscalDocumentType =
  | "factura_a"
  | "factura_b"
  | "factura_c"
  | "recibo_x"
  | "ticket_interno";

export type CustomerDocType =
  | "DNI"
  | "CUIT"
  | "CUIL"
  | "CF"
  | "PASSPORT"
  | "OTHER";

export type FiscalStatus =
  | "internal_issued"
  | "pending_arca"
  | "approved_arca"
  | "rejected_arca";

export const billingDocuments = pgTable(
  "billing_documents",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id").notNull(),
    locationId: uuid("location_id"),
    orderId: uuid("order_id").notNull(),
    documentType: text("document_type")
      .$type<FiscalDocumentType>()
      .default("ticket_interno")
      .notNull(),
    pointOfSale: integer("point_of_sale").default(1).notNull(),
    documentNumber: bigint("document_number", { mode: "bigint" }).notNull(),
    currency: text("currency").default("ARS").notNull(),
    netAmount: numeric("net_amount", { precision: 12, scale: 2 }).notNull(),
    vatAmount: numeric("vat_amount", { precision: 12, scale: 2 })
      .default("0")
      .notNull(),
    discountAmount: numeric("discount_amount", { precision: 12, scale: 2 })
      .default("0")
      .notNull(),
    totalAmount: numeric("total_amount", { precision: 12, scale: 2 }).notNull(),
    customerDocType: text("customer_doc_type")
      .$type<CustomerDocType>()
      .default("CF")
      .notNull(),
    customerDocNumber: text("customer_doc_number"),
    customerName: text("customer_name"),
    fiscalStatus: text("fiscal_status")
      .$type<FiscalStatus>()
      .default("internal_issued")
      .notNull(),
    cae: text("cae"),
    caeExpiresAt: timestamp("cae_expires_at", {
      withTimezone: true,
      mode: "date",
    }),
    arcaError: text("arca_error"),
    issuedAt: timestamp("issued_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    ...timestamps,
  },
  (table) => [
    foreignKey({
      columns: [table.tenantId],
      foreignColumns: [tenants.id],
      name: "billing_documents_tenant_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.tenantId, table.locationId],
      foreignColumns: [tenantLocations.tenantId, tenantLocations.id],
      name: "billing_documents_location_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.tenantId, table.orderId],
      foreignColumns: [tenantOrders.tenantId, tenantOrders.id],
      name: "billing_documents_order_fk",
    }).onDelete("restrict"),
    unique("billing_documents_tenant_id_id_key").on(table.tenantId, table.id),
    unique("billing_documents_tenant_pos_type_number_key").on(
      table.tenantId,
      table.pointOfSale,
      table.documentType,
      table.documentNumber,
    ),
    index("billing_documents_tenant_issued_idx").on(
      table.tenantId,
      table.issuedAt,
    ),
    index("billing_documents_tenant_order_idx").on(
      table.tenantId,
      table.orderId,
    ),
    index("billing_documents_tenant_fiscal_status_idx").on(
      table.tenantId,
      table.fiscalStatus,
    ),
    check(
      "billing_documents_document_type_check",
      sql`${table.documentType} in ('factura_a', 'factura_b', 'factura_c', 'recibo_x', 'ticket_interno')`,
    ),
    check(
      "billing_documents_fiscal_status_check",
      sql`${table.fiscalStatus} in ('internal_issued', 'pending_arca', 'approved_arca', 'rejected_arca')`,
    ),
    check(
      "billing_documents_customer_doc_type_check",
      sql`${table.customerDocType} in ('DNI', 'CUIT', 'CUIL', 'CF', 'PASSPORT', 'OTHER')`,
    ),
    check(
      "billing_documents_amounts_check",
      sql`${table.netAmount} >= 0 and ${table.vatAmount} >= 0 and ${table.discountAmount} >= 0 and ${table.totalAmount} >= 0`,
    ),
    check(
      "billing_documents_currency_check",
      sql`char_length(${table.currency}) = 3`,
    ),
    check("billing_documents_point_of_sale_check", sql`${table.pointOfSale} > 0`),
    check("billing_documents_document_number_check", sql`${table.documentNumber} > 0`),
  ],
);
