import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import AdminOrdersLive from "@/features/orders/web/AdminOrdersLive";
import { nextOrderStatus, orderStage } from "@/features/orders/web/order-workflow";
import type { AdminDashboardOrder } from "@/types/types";

const order: AdminDashboardOrder = {
  id: "order-1", purchaseNumber: "42", status: "approved", paymentStatus: "pending",
  customer: { name: "Cliente" }, notes: null, source: "storefront_cash", tender: "cash",
  lines: [], subtotal: "4500", discountTotal: "0", total: "4500", currency: "ARS",
  approvedAt: null, createdAt: "2026-10-08T12:00:00Z", updatedAt: "2026-10-08T12:00:00Z", version: 1,
};

const render = (value: AdminDashboardOrder) => renderToStaticMarkup(createElement(AdminOrdersLive, { tenantId: "tenant-1", initialOrders: [value] }));

describe("Backoffice payment → kitchen → delivery", () => {
  it.each(["storefront_cash", "admin_direct"] as const)("requires collection before kitchen for %s cash orders", (source) => {
    const pending = { ...order, source };
    expect(orderStage(pending)).toBe("payment");
    expect(nextOrderStatus(pending)).toBeNull();
    const html = render(pending);
    expect(html).toContain("Marcar como pagado · Efectivo");
    expect(html).not.toContain("Marcar listo en cocina");
    expect(html).not.toContain("Marcar como entregado");
  });

  it("allows only ready after payment, then delivery after kitchen", () => {
    const paid = { ...order, paymentStatus: "paid" as const };
    expect(orderStage(paid)).toBe("kitchen");
    expect(nextOrderStatus(paid)).toBe("ready");
    expect(render(paid)).toContain("Marcar listo en cocina");
    expect(render(paid)).not.toContain("Marcar como entregado");
    const ready = { ...paid, status: "ready" as const };
    expect(orderStage(ready)).toBe("delivery");
    expect(nextOrderStatus(ready)).toBe("delivered");
    expect(render(ready)).toContain("Marcar como entregado");
    expect(render(ready)).not.toContain("Marcar listo en cocina");
  });

  it("waits for provider confirmation on unpaid digital orders", () => {
    const digital = { ...order, tender: null, source: "mercadopago_webhook" as const };
    expect(nextOrderStatus(digital)).toBeNull();
    expect(render(digital)).toContain("Esperando la confirmación del pago");
    expect(render(digital)).not.toContain("Marcar como pagado · Efectivo");
  });

  it.each(["delivered", "cancelled"] as const)("removes %s orders from the active queue", (status) => {
    const finished = { ...order, status, paymentStatus: "paid" as const };
    expect(orderStage(finished)).toBe("finished");
    expect(nextOrderStatus(finished)).toBeNull();
    expect(render(finished)).not.toContain("Pedido interno: order-1");
  });
});
