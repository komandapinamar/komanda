import { z } from "zod";

export const fiscalDocumentTypeSchema = z.enum([
  "factura_a",
  "factura_b",
  "factura_c",
  "recibo_x",
  "ticket_interno",
]);

export const customerDocTypeSchema = z.enum([
  "DNI",
  "CUIT",
  "CUIL",
  "CF",
  "PASSPORT",
  "OTHER",
]);

export const fiscalStatusSchema = z.enum([
  "internal_issued",
  "pending_arca",
  "approved_arca",
  "rejected_arca",
]);

export const issueBillingDocumentSchema = z.object({
  orderId: z.string().uuid(),
  locationId: z.string().uuid().optional().nullable(),
  documentType: fiscalDocumentTypeSchema.default("ticket_interno"),
  pointOfSale: z.number().int().positive().default(1),
  customerDocType: customerDocTypeSchema.default("CF"),
  customerDocNumber: z.string().optional().nullable(),
  customerName: z.string().optional().nullable(),
});

export type IssueBillingDocumentInput = z.infer<typeof issueBillingDocumentSchema>;

export const topProductsFilterSchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  categoryId: z.string().uuid().optional(),
  source: z.enum(["all", "mercadopago_webhook", "admin_direct"]).default("all"),
  sortBy: z.enum(["quantity", "revenue"]).default("quantity"),
  limit: z.number().int().min(1).max(100).default(10),
});

export type TopProductsFilterInput = z.infer<typeof topProductsFilterSchema>;
