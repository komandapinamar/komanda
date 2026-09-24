import "server-only";

import { and, eq } from "drizzle-orm";
import { tenantOrders } from "@/db/schema";
import { withTenantIdTransaction } from "@/db/tenant-transaction";
import { correlationIdFromRequest } from "@/lib/observability/request-context";

type RouteContext = { params: Promise<{ tenantId: string; orderId: string }> };
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(request: Request, route: RouteContext) {
  const { tenantId, orderId } = await route.params;
  const headers = { "Cache-Control": "no-store", "X-Correlation-Id": correlationIdFromRequest(request) };
  if (!uuidPattern.test(tenantId) || !uuidPattern.test(orderId)) {
    return Response.json({ error: "Order not found" }, { status: 404, headers });
  }

  const order = await withTenantIdTransaction(
    tenantId,
    async (transaction) => {
      const [result] = await transaction
        .select({
          purchaseNumber: tenantOrders.purchaseNumber,
          fulfillmentStatus: tenantOrders.fulfillmentStatus,
        })
        .from(tenantOrders)
        .where(and(eq(tenantOrders.tenantId, tenantId), eq(tenantOrders.id, orderId)))
        .limit(1);
      return result;
    },
  );

  if (!order) return Response.json({ error: "Order not found" }, { status: 404, headers });
  return Response.json(
    {
      purchaseNumber: order.purchaseNumber.toString(),
      fulfillmentStatus: order.fulfillmentStatus,
    },
    { headers },
  );
}
