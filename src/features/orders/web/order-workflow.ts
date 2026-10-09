import type { AdminDashboardOrder } from "@/types/types";

export type OrderStage = "payment" | "kitchen" | "delivery" | "finished";

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
