import { describe, expect, it } from "vitest";
import { InvalidPickupPinError } from "@/features/orders/application/order-errors";
import { orderErrorResponse } from "@/features/orders/web/order-http";
import { transitionOrderSchema } from "@/features/orders/application/transition-order.service";
import { tenantOrders } from "@/db/schema/commerce";

describe("Order Pickup PIN and ETA Specification", () => {
  it("transitionOrderSchema parses valid statuses and pickupPin", () => {
    const valid = transitionOrderSchema.parse({
      fulfillmentStatus: "delivered",
      pickupPin: "7428",
    });
    expect(valid.fulfillmentStatus).toBe("delivered");
    expect(valid.pickupPin).toBe("7428");

    const withoutPin = transitionOrderSchema.parse({
      fulfillmentStatus: "preparing",
    });
    expect(withoutPin.fulfillmentStatus).toBe("preparing");
    expect(withoutPin.pickupPin).toBeUndefined();
  });

  it("orderErrorResponse handles InvalidPickupPinError with 422 and code INVALID_PICKUP_PIN", async () => {
    const correlationId = "corr-test-123";
    const error = new InvalidPickupPinError("El código PIN de retiro es inválido.");
    const response = orderErrorResponse(error, correlationId);

    expect(response.status).toBe(422);
    const body = (await response.json()) as {
      status: number;
      code: string;
      title: string;
      detail: string;
      correlationId: string;
    };
    expect(body.code).toBe("INVALID_PICKUP_PIN");
    expect(body.title).toBe("Invalid pickup PIN");
    expect(body.detail).toBe("El código PIN de retiro es inválido.");
    expect(body.correlationId).toBe(correlationId);
  });

  it("tenantOrders schema defines pickupPin, estimatedWaitMinutes and estimatedReadyAt", () => {
    expect(tenantOrders.pickupPin).toBeDefined();
    expect(tenantOrders.estimatedWaitMinutes).toBeDefined();
    expect(tenantOrders.estimatedReadyAt).toBeDefined();
  });
});
