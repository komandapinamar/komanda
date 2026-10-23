import { describe, expect, it } from "vitest";
import {
  formatOpeningHoursLines,
  hasOpeningHours,
  normalizeOpeningHours,
  openingHoursSchema,
} from "@/features/tenancy/domain/opening-hours";

describe("opening hours domain", () => {
  it("normalizes ranges, drops empty days and sorts by opening time", () => {
    const normalized = normalizeOpeningHours({
      monday: [
        { open: "17:00", close: "23:00" },
        { open: "09:00", close: "13:00" },
      ],
      tuesday: [],
      wednesday: [{ open: "10:00", close: "20:00" }],
    });

    expect(normalized).toEqual({
      monday: [
        { open: "09:00", close: "13:00" },
        { open: "17:00", close: "23:00" },
      ],
      wednesday: [{ open: "10:00", close: "20:00" }],
    });
  });

  it("rejects invalid values and times", () => {
    expect(normalizeOpeningHours({ monday: [{ open: "25:00", close: "10:00" }] })).toEqual({});
    expect(normalizeOpeningHours("09 a 18")).toEqual({});
    expect(openingHoursSchema.safeParse({ monday: [{ open: "9:00", close: "18:00" }] }).success).toBe(false);
    expect(openingHoursSchema.safeParse({ monday: [{ open: "09:00", close: "18:00" }] }).success).toBe(true);
  });

  it("groups consecutive days with the same schedule", () => {
    const lines = formatOpeningHoursLines({
      monday: [{ open: "09:00", close: "18:00" }],
      tuesday: [{ open: "09:00", close: "18:00" }],
      wednesday: [{ open: "09:00", close: "18:00" }],
      thursday: [{ open: "09:00", close: "18:00" }],
      friday: [{ open: "09:00", close: "18:00" }],
      saturday: [{ open: "10:00", close: "14:00" }],
    });

    expect(lines).toEqual([
      { days: "Lun a Vie", schedule: "09:00 a 18:00" },
      { days: "Sáb", schedule: "10:00 a 14:00" },
      { days: "Dom", schedule: "Cerrado" },
    ]);
  });

  it("reports whether any opening hours are configured", () => {
    expect(hasOpeningHours({})).toBe(false);
    expect(hasOpeningHours({ sunday: [{ open: "12:00", close: "16:00" }] })).toBe(true);
  });
});
