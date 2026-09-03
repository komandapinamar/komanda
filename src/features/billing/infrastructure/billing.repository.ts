import { and, eq, gte, inArray, lte, sql } from "drizzle-orm";
import {
  billingDocuments,
  catalogCategories,
  catalogItems,
  orderLines,
  tenantOrders,
  type FiscalDocumentType,
  type CustomerDocType,
} from "@/db/schema";
import type { TenantTransaction } from "@/db/tenant-transaction";

export class BillingRepository {
  constructor(
    private readonly transaction: TenantTransaction,
    private readonly tenantId: string,
  ) {}

  async getNextDocumentNumber(
    pointOfSale: number,
    documentType: FiscalDocumentType,
  ): Promise<bigint> {
    const [row] = await this.transaction
      .select({
        maxNumber: sql<string | null>`max(${billingDocuments.documentNumber})::text`,
      })
      .from(billingDocuments)
      .where(
        and(
          eq(billingDocuments.tenantId, this.tenantId),
          eq(billingDocuments.pointOfSale, pointOfSale),
          eq(billingDocuments.documentType, documentType),
        ),
      );

    const current = row?.maxNumber ? BigInt(row.maxNumber) : BigInt(0);
    return current + BigInt(1);
  }

  async issueDocument(
    input: {
      orderId: string;
      locationId?: string | null;
      documentType?: FiscalDocumentType;
      pointOfSale?: number;
      customerDocType?: CustomerDocType;
      customerDocNumber?: string | null;
      customerName?: string | null;
    },
  ) {
    const [order] = await this.transaction
      .select()
      .from(tenantOrders)
      .where(
        and(
          eq(tenantOrders.tenantId, this.tenantId),
          eq(tenantOrders.id, input.orderId),
        ),
      )
      .limit(1);

    if (!order) {
      throw new Error(`Order ${input.orderId} not found for billing issuance.`);
    }

    const documentType = input.documentType ?? "ticket_interno";
    const pointOfSale = input.pointOfSale ?? 1;

    const documentNumber = await this.getNextDocumentNumber(
      pointOfSale,
      documentType,
    );

    const total = Number(order.total);
    const discount = Number(order.discountTotal);
    // Standard VAT assumption for Argentina (21% or 0% depending on setup, default net + vat = total)
    const net = Number((total / 1.21).toFixed(2));
    const vat = Number((total - net).toFixed(2));

    const [document] = await this.transaction
      .insert(billingDocuments)
      .values({
        tenantId: this.tenantId,
        locationId: input.locationId ?? order.locationId,
        orderId: order.id,
        documentType,
        pointOfSale,
        documentNumber,
        currency: order.currency,
        netAmount: net.toFixed(2),
        vatAmount: vat.toFixed(2),
        discountAmount: discount.toFixed(2),
        totalAmount: order.total,
        customerDocType: input.customerDocType ?? "CF",
        customerDocNumber: input.customerDocNumber ?? null,
        customerName: input.customerName ?? null,
        fiscalStatus: "internal_issued",
        issuedAt: new Date(),
      })
      .returning();

    return document;
  }

  async getFinancialSummary(from: Date, to: Date, sourceFilter?: string) {
    const conditions = [
      eq(tenantOrders.tenantId, this.tenantId),
      gte(tenantOrders.createdAt, from),
      lte(tenantOrders.createdAt, to),
      inArray(tenantOrders.paymentStatus, ["paid"]),
      sql`${tenantOrders.fulfillmentStatus} != 'cancelled'`,
    ];

    if (sourceFilter && sourceFilter !== "all") {
      conditions.push(eq(tenantOrders.source, sourceFilter as "mercadopago_webhook" | "admin_direct"));
    }

    const [orderSummary] = await this.transaction
      .select({
        totalRevenue: sql<string>`coalesce(sum(${tenantOrders.total}), '0')::text`,
        subtotal: sql<string>`coalesce(sum(${tenantOrders.subtotal}), '0')::text`,
        totalDiscounts: sql<string>`coalesce(sum(${tenantOrders.discountTotal}), '0')::text`,
        paidOrdersCount: sql<number>`count(*)::int`,
        avgOrderValue: sql<string>`coalesce(round(avg(${tenantOrders.total}), 2), '0')::text`,
      })
      .from(tenantOrders)
      .where(and(...conditions));

    const revenueBySource = await this.transaction
      .select({
        source: tenantOrders.source,
        totalRevenue: sql<string>`coalesce(sum(${tenantOrders.total}), '0')::text`,
        orderCount: sql<number>`count(*)::int`,
      })
      .from(tenantOrders)
      .where(and(...conditions))
      .groupBy(tenantOrders.source);

    return {
      totalRevenue: orderSummary?.totalRevenue ?? "0",
      subtotal: orderSummary?.subtotal ?? "0",
      totalDiscounts: orderSummary?.totalDiscounts ?? "0",
      paidOrdersCount: orderSummary?.paidOrdersCount ?? 0,
      avgOrderValue: orderSummary?.avgOrderValue ?? "0",
      revenueBySource: revenueBySource.map((r) => ({
        source: r.source,
        revenue: r.totalRevenue,
        orders: r.orderCount,
      })),
    };
  }

  async getRevenueTimeline(
    from: Date,
    to: Date,
    granularity: "hour" | "day" = "day",
    sourceFilter?: string,
  ) {
    const dateTruncField = granularity === "hour" ? "hour" : "day";
    const bucketSql = sql<string>`to_char(date_trunc(${dateTruncField}, ${tenantOrders.createdAt}), 'YYYY-MM-DD"T"HH24:MI:SS"Z"')`;

    const conditions = [
      eq(tenantOrders.tenantId, this.tenantId),
      gte(tenantOrders.createdAt, from),
      lte(tenantOrders.createdAt, to),
      eq(tenantOrders.paymentStatus, "paid"),
      sql`${tenantOrders.fulfillmentStatus} != 'cancelled'`,
    ];

    if (sourceFilter && sourceFilter !== "all") {
      conditions.push(eq(tenantOrders.source, sourceFilter as "mercadopago_webhook" | "admin_direct"));
    }

    const rows = await this.transaction
      .select({
        bucket: bucketSql,
        revenue: sql<string>`coalesce(sum(${tenantOrders.total}), '0')::text`,
        ordersCount: sql<number>`count(*)::int`,
      })
      .from(tenantOrders)
      .where(and(...conditions))
      .groupBy(sql`date_trunc(${dateTruncField}, ${tenantOrders.createdAt})`)
      .orderBy(sql`date_trunc(${dateTruncField}, ${tenantOrders.createdAt}) asc`);

    return rows;
  }

  async getTopSellingProducts(input: {
    from: Date;
    to: Date;
    categoryId?: string;
    source?: string;
    sortBy?: "quantity" | "revenue";
    limit?: number;
  }) {
    const conditions = [
      eq(tenantOrders.tenantId, this.tenantId),
      gte(tenantOrders.createdAt, input.from),
      lte(tenantOrders.createdAt, input.to),
      eq(tenantOrders.paymentStatus, "paid"),
      sql`${tenantOrders.fulfillmentStatus} != 'cancelled'`,
    ];

    if (input.source && input.source !== "all") {
      conditions.push(eq(tenantOrders.source, input.source as "mercadopago_webhook" | "admin_direct"));
    }

    if (input.categoryId) {
      conditions.push(eq(catalogItems.categoryId, input.categoryId));
    }

    const orderColumn =
      input.sortBy === "revenue"
        ? sql`sum(${orderLines.lineTotal}) desc`
        : sql`sum(${orderLines.quantity}) desc`;

    const rows = await this.transaction
      .select({
        productName: orderLines.name,
        sourceItemId: orderLines.sourceItemId,
        sourceComboId: orderLines.sourceComboId,
        categoryName: catalogCategories.name,
        totalQuantity: sql<number>`sum(${orderLines.quantity})::int`,
        totalRevenue: sql<string>`coalesce(sum(${orderLines.lineTotal}), '0')::text`,
      })
      .from(orderLines)
      .innerJoin(
        tenantOrders,
        and(
          eq(tenantOrders.tenantId, orderLines.tenantId),
          eq(tenantOrders.id, orderLines.orderId),
        ),
      )
      .leftJoin(
        catalogItems,
        and(
          eq(catalogItems.tenantId, orderLines.tenantId),
          eq(catalogItems.id, orderLines.sourceItemId),
        ),
      )
      .leftJoin(
        catalogCategories,
        and(
          eq(catalogCategories.tenantId, catalogItems.tenantId),
          eq(catalogCategories.id, catalogItems.categoryId),
        ),
      )
      .where(and(...conditions))
      .groupBy(
        orderLines.name,
        orderLines.sourceItemId,
        orderLines.sourceComboId,
        catalogCategories.name,
      )
      .orderBy(orderColumn)
      .limit(input.limit ?? 10);

    return rows;
  }
}
