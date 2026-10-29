import { describe, expect, it } from "vitest";
import {
  formatScheduledForDisplay,
  generateScheduledDaysAndSlots,
  OrderSchedulingError,
  validateScheduledPickupTime,
} from "@/features/orders/domain/order-scheduling";
import { buildCheckoutPayload } from "@/features/shop/checkout/components/checkout-payload";

describe("Programar Pedidos (Scheduled Pickup Orders)", () => {
  const fixedNow = new Date("2026-10-29T15:00:00.000Z"); // 12:00 Argentina (UTC-3)

  it("returns null when scheduledFor is null, undefined, or blank (ASAP mode)", () => {
    expect(validateScheduledPickupTime(null, { now: fixedNow })).toBeNull();
    expect(validateScheduledPickupTime(undefined, { now: fixedNow })).toBeNull();
    expect(validateScheduledPickupTime("   ", { now: fixedNow })).toBeNull();
  });

  it("accepts a valid future scheduled timestamp between 15m and 7d ahead", () => {
    const validTarget = "2026-10-29T18:30:00.000Z";
    const result = validateScheduledPickupTime(validTarget, { now: fixedNow });
    expect(result).toBeInstanceOf(Date);
    expect(result?.toISOString()).toBe(validTarget);
  });

  it("rejects scheduled timestamps in the past or less than 10m in the future", () => {
    expect(() =>
      validateScheduledPickupTime("2026-10-29T15:05:00.000Z", {
        now: fixedNow,
      }),
    ).toThrow(OrderSchedulingError);

    expect(() =>
      validateScheduledPickupTime("2026-10-29T14:00:00.000Z", {
        now: fixedNow,
      }),
    ).toThrow(OrderSchedulingError);
  });

  it("rejects scheduled timestamps more than 7 days in the future", () => {
    expect(() =>
      validateScheduledPickupTime("2026-11-10T15:00:00.000Z", {
        now: fixedNow,
      }),
    ).toThrow(OrderSchedulingError);
  });

  it("enforces store openingHours when provided", () => {
    const openingHours = {
      thursday: [{ open: "12:00", close: "16:00" }],
    };

    // 13:30 ART (16:30 UTC) on Thursday -> inside 12:00..16:00
    const inside = validateScheduledPickupTime("2026-10-29T16:30:00.000Z", {
      now: fixedNow,
      openingHours,
      timezone: "America/Argentina/Buenos_Aires",
    });
    expect(inside?.toISOString()).toBe("2026-10-29T16:30:00.000Z");

    // 20:00 ART (23:00 UTC) on Thursday -> outside 12:00..16:00
    expect(() =>
      validateScheduledPickupTime("2026-10-29T23:00:00.000Z", {
        now: fixedNow,
        openingHours,
        timezone: "America/Argentina/Buenos_Aires",
      }),
    ).toThrow(OrderSchedulingError);
  });

  it("generates grouped 15-minute pickup slots for Hoy and Mañana", () => {
    const groups = generateScheduledDaysAndSlots({
      now: fixedNow,
      timezone: "America/Argentina/Buenos_Aires",
    });

    expect(groups.length).toBeGreaterThanOrEqual(2);
    expect(groups[0]?.label).toBe("Hoy");
    expect(groups[0]?.slots.length).toBeGreaterThan(0);
    expect(groups[1]?.label).toBe("Mañana");
  });

  it("formats scheduled timestamps in readable Spanish", () => {
    const formattedToday = formatScheduledForDisplay(
      "2026-10-29T18:30:00.000Z",
      {
        now: fixedNow,
        timezone: "America/Argentina/Buenos_Aires",
      },
    );
    expect(formattedToday).toBe("Hoy 15:30");

    const formattedTomorrow = formatScheduledForDisplay(
      "2026-10-30T16:15:00.000Z",
      {
        now: fixedNow,
        timezone: "America/Argentina/Buenos_Aires",
      },
    );
    expect(formattedTomorrow).toBe("Mañana 13:15");
  });

  it("includes scheduledFor in buildCheckoutPayload when provided", () => {
    const payload = buildCheckoutPayload({
      cartId: "cart-123",
      cartVersion: 1,
      customer: { name: "Martín", phone: "1123456789" },
      notes: "Sin sal",
      scheduledFor: "2026-10-29T18:30:00.000Z",
    });

    expect(payload.scheduledFor).toBe("2026-10-29T18:30:00.000Z");
  });
});
