import type { AdminDashboardOrder } from "@/types/types";

export type OrderStage = "payment" | "kitchen" | "delivery" | "finished";

export type KitchenOptionSummary = {
  name: string;
  quantity: number;
};

export type KitchenProductSummary = {
  key: string;
  name: string;
  totalQuantity: number;
  orderCount: number;
  options: KitchenOptionSummary[];
  notes: string[];
};

export function orderStage(order: AdminDashboardOrder): OrderStage {
  if (order.status === "delivered" || order.status === "cancelled") return "finished";
  if (order.paymentStatus !== "paid") return "payment";
  return order.status === "ready" ? "delivery" : "kitchen";
}

export function nextOrderStatus(order: AdminDashboardOrder): "ready" | "delivered" | null {
  const stage = orderStage(order);
  if (stage === "kitchen") return "ready";
  if (stage === "delivery") return "delivered";
  return null;
}

export function aggregateKitchenProducts(
  orders: AdminDashboardOrder[],
): KitchenProductSummary[] {
  const map = new Map<
    string,
    {
      key: string;
      name: string;
      totalQuantity: number;
      orderIds: Set<string>;
      options: Map<string, { name: string; quantity: number }>;
      notes: string[];
    }
  >();

  for (const order of orders) {
    if (orderStage(order) !== "kitchen") continue;

    for (const line of order.lines ?? []) {
      const trimmedName = line.name.trim();
      if (!trimmedName || line.quantity <= 0) continue;
      const key = trimmedName.toLocaleLowerCase("es-AR");

      let entry = map.get(key);
      if (!entry) {
        entry = {
          key,
          name: trimmedName,
          totalQuantity: 0,
          orderIds: new Set<string>(),
          options: new Map(),
          notes: [],
        };
        map.set(key, entry);
      }

      entry.totalQuantity += line.quantity;
      entry.orderIds.add(order.id);

      if (line.note && line.note.trim()) {
        entry.notes.push(`#${order.purchaseNumber}: ${line.note.trim()}`);
      }

      for (const opt of line.options ?? []) {
        const optName = opt.name.trim();
        if (!optName) continue;
        const optKey = optName.toLocaleLowerCase("es-AR");
        const optQty = line.quantity * Math.max(1, opt.quantity ?? 1);
        const existingOpt = entry.options.get(optKey);
        if (existingOpt) {
          existingOpt.quantity += optQty;
        } else {
          entry.options.set(optKey, { name: optName, quantity: optQty });
        }
      }
    }
  }

  return Array.from(map.values())
    .map((entry) => ({
      key: entry.key,
      name: entry.name,
      totalQuantity: entry.totalQuantity,
      orderCount: entry.orderIds.size,
      options: Array.from(entry.options.values()).sort(
        (a, b) => b.quantity - a.quantity || a.name.localeCompare(b.name, "es-AR"),
      ),
      notes: entry.notes,
    }))
    .sort(
      (a, b) =>
        b.totalQuantity - a.totalQuantity || a.name.localeCompare(b.name, "es-AR"),
    );
}
