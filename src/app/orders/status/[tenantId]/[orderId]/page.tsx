import { and, eq } from "drizzle-orm";
import { tenantOrders } from "@/db/schema";
import { withTenantIdTransaction } from "@/db/tenant-transaction";
import { PublicOrderStatus } from "@/features/orders/web/PublicOrderStatus";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default async function OrderStatusPage({
  params,
}: {
  params: Promise<{ tenantId: string; orderId: string }>;
}) {
  const { tenantId, orderId } = await params;

  let initialOrder: { purchaseNumber: string; fulfillmentStatus: string } | null = null;

  if (uuidPattern.test(tenantId) && uuidPattern.test(orderId)) {
    try {
      const order = await withTenantIdTransaction(tenantId, async (transaction) => {
        const [result] = await transaction
          .select({
            purchaseNumber: tenantOrders.purchaseNumber,
            fulfillmentStatus: tenantOrders.fulfillmentStatus,
          })
          .from(tenantOrders)
          .where(and(eq(tenantOrders.tenantId, tenantId), eq(tenantOrders.id, orderId)))
          .limit(1);
        return result;
      });
      if (order) {
        initialOrder = {
          purchaseNumber: order.purchaseNumber.toString(),
          fulfillmentStatus: order.fulfillmentStatus,
        };
      }
    } catch {
      // Fallback to client-side polling if SSR query encounters an issue
    }
  }

  return (
    <PublicOrderStatus
      tenantId={tenantId}
      orderId={orderId}
      initialOrder={initialOrder}
    />
  );
}
