import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import AdminOrdersLive from "@/features/orders/web/AdminOrdersLive";
import {
  aggregateKitchenProducts,
  nextOrderStatus,
  orderStage,
} from "@/features/orders/web/order-workflow";
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

  it("aggregates total product quantities across paid kitchen orders and strips all prices in Modo cocina", () => {
    const kitchenOrder1: AdminDashboardOrder = {
      ...order,
      id: "ord-k1",
      purchaseNumber: "51",
      paymentStatus: "paid",
      status: "approved",
      lines: [
        {
          id: "l1",
          name: "Pollo Sisu",
          quantity: 2,
          unitPrice: "4500.00",
          lineTotal: "9000.00",
          note: "Bien crocante",
          options: [{ name: "Salsa Picante", priceDelta: "500.00", quantity: 1 }],
        },
        {
          id: "l2",
          name: "Cookie",
          quantity: 1,
          unitPrice: "2500.00",
          lineTotal: "2500.00",
          note: null,
          options: [],
        },
      ],
      subtotal: "11500.00",
      discountTotal: "1500.00",
      total: "10000.00",
    };

    const kitchenOrder2: AdminDashboardOrder = {
      ...order,
      id: "ord-k2",
      purchaseNumber: "52",
      paymentStatus: "paid",
      status: "preparing",
      lines: [
        {
          id: "l3",
          name: "Pollo Sisu",
          quantity: 3,
          unitPrice: "4500.00",
          lineTotal: "13500.00",
          note: null,
          options: [{ name: "Salsa Picante", priceDelta: "500.00", quantity: 1 }],
        },
      ],
      subtotal: "13500.00",
      discountTotal: "0.00",
      total: "13500.00",
    };

    const unpaidOrder: AdminDashboardOrder = {
      ...order,
      id: "ord-unpaid",
      purchaseNumber: "53",
      paymentStatus: "pending",
      status: "approved",
      lines: [
        {
          id: "l4",
          name: "Pollo Sisu",
          quantity: 10,
          unitPrice: "4500.00",
          lineTotal: "45000.00",
          note: null,
          options: [],
        },
      ],
    };

    const readyOrder: AdminDashboardOrder = {
      ...order,
      id: "ord-ready",
      purchaseNumber: "54",
      paymentStatus: "paid",
      status: "ready",
      lines: [
        {
          id: "l5",
          name: "Quesadillas",
          quantity: 4,
          unitPrice: "5000.00",
          lineTotal: "20000.00",
          note: null,
          options: [],
        },
      ],
    };

    const allOrders = [kitchenOrder1, kitchenOrder2, unpaidOrder, readyOrder];
    const totals = aggregateKitchenProducts(allOrders);

    expect(totals).toHaveLength(2);
    expect(totals[0]).toMatchObject({
      name: "Pollo Sisu",
      totalQuantity: 5,
      orderCount: 2,
      options: [{ name: "Salsa Picante", quantity: 5 }],
      notes: ["#51: Bien crocante"],
    });
    expect(totals[1]).toMatchObject({
      name: "Cookie",
      totalQuantity: 1,
      orderCount: 1,
      options: [],
      notes: [],
    });

    const kitchenHtml = renderToStaticMarkup(
      createElement(AdminOrdersLive, {
        tenantId: "tenant-1",
        initialOrders: allOrders,
        initialKitchenMode: true,
      }),
    );

    expect(kitchenHtml).toContain("Total de productos");
    expect(kitchenHtml).toContain("Tickets en cocina");
    expect(kitchenHtml).toContain("5x");
    expect(kitchenHtml).toContain("Pollo Sisu");
    expect(kitchenHtml).toContain("Salsa Picante");
    expect(kitchenHtml).toContain("Compra #51");
    expect(kitchenHtml).toContain("Compra #52");
    expect(kitchenHtml).not.toContain("Compra #53");
    expect(kitchenHtml).not.toContain("Compra #54");
    expect(kitchenHtml).not.toContain("$");
    expect(kitchenHtml).not.toContain("9000.00");
    expect(kitchenHtml).not.toContain("13500.00");
    expect(kitchenHtml).not.toContain("10000.00");
    expect(kitchenHtml).not.toContain("500.00");
    expect(kitchenHtml).not.toContain("Subtotal");
  });
});
