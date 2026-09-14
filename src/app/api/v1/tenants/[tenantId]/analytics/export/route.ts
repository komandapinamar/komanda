import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { withTenantTransaction } from "@/db/tenant-transaction";
import { orderLines, tenantOrders } from "@/db/schema";
import { administrativeTenantContext } from "@/features/identity/web/tenant-authority";
import { requireOwnerOrAdmin } from "@/lib/authorization/role-guard";
import { correlationIdFromRequest } from "@/lib/observability/request-context";

type RouteContext = { params: Promise<{ tenantId: string }> };

export async function GET(request: Request, route: RouteContext) {
  const correlationId = correlationIdFromRequest(request);
  try {
    const { tenantId } = await route.params;
    const context = await administrativeTenantContext(request, tenantId, correlationId);
    requireOwnerOrAdmin(context);

    const { searchParams } = new URL(request.url);
    const fromParam = searchParams.get("from");
    const toParam = searchParams.get("to");

    const now = new Date();
    const to = toParam ? new Date(toParam) : now;
    const from = fromParam
      ? new Date(fromParam)
      : new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const csvData = await withTenantTransaction(context, async (transaction) => {
      const orders = await transaction
        .select({
          id: tenantOrders.id,
          purchaseNumber: tenantOrders.purchaseNumber,
          tender: tenantOrders.tender,
          paymentStatus: tenantOrders.paymentStatus,
          fulfillmentStatus: tenantOrders.fulfillmentStatus,
          total: tenantOrders.total,
          currency: tenantOrders.currency,
          createdAt: tenantOrders.createdAt,
        })
        .from(tenantOrders)
        .where(
          and(
            eq(tenantOrders.tenantId, tenantId),
            sql`${tenantOrders.createdAt} >= ${from}`,
            sql`${tenantOrders.createdAt} <= ${to}`,
          ),
        )
        .orderBy(desc(tenantOrders.createdAt));

      const orderIds = orders.map((o) => o.id);
      const lines = orderIds.length > 0
        ? await transaction
            .select({
              orderId: orderLines.orderId,
              name: orderLines.name,
              quantity: orderLines.quantity,
              lineTotal: orderLines.lineTotal,
            })
            .from(orderLines)
            .where(
              and(
                eq(orderLines.tenantId, tenantId),
                inArray(orderLines.orderId, orderIds),
              ),
            )
        : [];

      const linesByOrder = new Map<string, string[]>();
      for (const line of lines) {
        const current = linesByOrder.get(line.orderId) ?? [];
        current.push(`${line.quantity}x ${line.name}`);
        linesByOrder.set(line.orderId, current);
      }

      // Build CSV rows
      const header = ["Fecha y Hora", "Ticket", "Medio de Pago", "Estado de Pago", "Productos", "Total", "Moneda"];
      const rows = orders.map((o) => {
        const dateStr = o.createdAt.toISOString().replace("T", " ").substring(0, 19);
        const tenderLabel = o.tender === "cash" ? "Efectivo" : "Posnet / Tarjeta";
        const itemsStr = (linesByOrder.get(o.id) ?? []).join("; ");
        return [
          `"${dateStr}"`,
          `"${o.purchaseNumber}"`,
          `"${tenderLabel}"`,
          `"${o.paymentStatus}"`,
          `"${itemsStr.replace(/"/g, '""')}"`,
          `"${o.total}"`,
          `"${o.currency}"`,
        ].join(",");
      });

      return [header.join(","), ...rows].join("\n");
    });

    const filename = `ventas-${tenantId.slice(0, 8)}-${from.toISOString().slice(0, 10)}-${to.toISOString().slice(0, 10)}.csv`;

    return new Response(csvData, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "X-Correlation-Id": correlationId,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error al exportar datos.";
    return Response.json({ title: message }, { status: 500 });
  }
}
