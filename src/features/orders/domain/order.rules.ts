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
) {
  if (current === next) {
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
