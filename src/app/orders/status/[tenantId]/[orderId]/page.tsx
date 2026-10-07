import { and, eq } from "drizzle-orm";
import { tenantOrders } from "@/db/schema";
import { withTenantIdTransaction } from "@/db/tenant-transaction";
import { PublicOrderStatus } from "@/features/orders/web/PublicOrderStatus";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default async function OrderStatusPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenantId: string; orderId: string }>;
  searchParams?: Promise<{ pin?: string | string[] }>;
}) {
  const { tenantId, orderId } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const pinParam = Array.isArray(resolvedSearchParams?.pin)
    ? resolvedSearchParams.pin[0]
    : resolvedSearchParams?.pin;

  let initialOrder: {
    purchaseNumber: string;
    fulfillmentStatus: string;
    paymentStatus?: string | null;
    tender?: string | null;
    paymentExpiresAt?: string | null;
    pickupPin?: string | null;
  } | null = null;

  if (uuidPattern.test(tenantId) && uuidPattern.test(orderId)) {
    try {
      const order = await withTenantIdTransaction(tenantId, async (transaction) => {
        const [result] = await transaction
          .select({
            purchaseNumber: tenantOrders.purchaseNumber,
            fulfillmentStatus: tenantOrders.fulfillmentStatus,
            paymentStatus: tenantOrders.paymentStatus,
            tender: tenantOrders.tender,
            paymentExpiresAt: tenantOrders.paymentExpiresAt,
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
          paymentStatus: order.paymentStatus ?? null,
          tender: order.tender ?? null,
          paymentExpiresAt: order.paymentExpiresAt
            ? new Date(order.paymentExpiresAt).toISOString()
            : null,
          pickupPin: pinParam || null,
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
      initialPin={pinParam}
    />
  );
}
