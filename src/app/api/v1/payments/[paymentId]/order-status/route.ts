import "server-only";

import { and, eq } from "drizzle-orm";
import { withPlatformServiceTransaction } from "@/db/tenant-transaction";
import { providerResourceRoutes, paymentAttempts, tenantOrders } from "@/db/schema";
import { correlationIdFromRequest } from "@/lib/observability/request-context";

type RouteContext = { params: Promise<{ paymentId: string }> };

export type PaymentOrderStatusResponse = {
  status: "pending" | "completed" | "not_found";
  orderId: string | null;
  purchaseNumber: string | null;
  fulfillmentStatus: string | null;
  paymentStatus: string | null;
};

export async function GET(_request: Request, route: RouteContext) {
  const correlationId = correlationIdFromRequest(_request);
  const { paymentId } = await route.params;

  const result = await withPlatformServiceTransaction(
    { serviceId: "payments:lookup", correlationId },
    async (transaction) => {
      const [route] = await transaction
        .select()
        .from(providerResourceRoutes)
        .where(
          and(
            eq(providerResourceRoutes.provider, "mercadopago"),
            eq(providerResourceRoutes.resourceType, "payment"),
            eq(providerResourceRoutes.externalId, paymentId),
          ),
        )
        .limit(1);

      if (!route) {
        return {
          status: "pending" as const,
          orderId: null,
          purchaseNumber: null,
          fulfillmentStatus: null,
          paymentStatus: null,
        };
      }

      const [attempt] = await transaction
        .select()
        .from(paymentAttempts)
        .where(
          and(
            eq(paymentAttempts.tenantId, route.tenantId),
            eq(paymentAttempts.id, route.localResourceId),
          ),
        )
        .limit(1);

      if (!attempt || attempt.status !== "approved") {
        return {
          status: "pending" as const,
          orderId: null,
          purchaseNumber: null,
          fulfillmentStatus: null,
          paymentStatus: attempt?.status ?? null,
        };
      }

      const [order] = await transaction
        .select({
          id: tenantOrders.id,
          purchaseNumber: tenantOrders.purchaseNumber,
          fulfillmentStatus: tenantOrders.fulfillmentStatus,
          paymentStatus: tenantOrders.paymentStatus,
        })
        .from(tenantOrders)
        .where(
          and(
            eq(tenantOrders.tenantId, route.tenantId),
            eq(tenantOrders.paymentAttemptId, route.localResourceId),
          ),
        )
        .limit(1);

      if (!order) {
        return {
          status: "pending" as const,
          orderId: null,
          purchaseNumber: null,
          fulfillmentStatus: null,
          paymentStatus: attempt.status,
        };
      }

      return {
        status: "completed" as const,
        orderId: order.id,
        purchaseNumber: order.purchaseNumber.toString(),
        fulfillmentStatus: order.fulfillmentStatus,
        paymentStatus: order.paymentStatus,
      };
    },
  );

  return Response.json(result satisfies PaymentOrderStatusResponse, {
    headers: { "X-Correlation-Id": correlationId },
  });
}
