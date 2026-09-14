export type FulfillmentStatus =
  | "approved"
  | "preparing"
  | "ready"
  | "delivered"
  | "cancelled";

export type PaymentStatus = "pending" | "paid" | "failed" | "refunded";

export class OrderTransitionError extends Error {}

const allowedTransitions: Record<FulfillmentStatus, FulfillmentStatus[]> = {
  approved: ["preparing", "cancelled"],
  preparing: ["ready", "cancelled"],
  ready: ["delivered"],
  delivered: [],
  cancelled: [],
};

export function isTerminalFulfillmentStatus(status: FulfillmentStatus) {
  return status === "delivered" || status === "cancelled";
}

export function assertFulfillmentTransition(
  current: FulfillmentStatus,
  next: FulfillmentStatus,
  source?: "mercadopago_webhook" | "admin_direct" | string | null,
) {
  if (current === next) {
    return;
  }

  // admin_direct manual orders can be cancelled from any non-cancelled state, including ready and delivered
  if (source === "admin_direct" && next === "cancelled" && current !== "cancelled") {
    return;
  }

  if (!allowedTransitions[current]?.includes(next)) {
    throw new OrderTransitionError(
      `Cannot transition order from ${current} to ${next}.`,
    );
  }
}

export function visibleOrderStatuses() {
  return ["approved", "preparing", "ready", "delivered", "cancelled"] as const;
}
