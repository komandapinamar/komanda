import { describe, expect, it } from "vitest";
import {
  isValidLocation,
  locationSchema,
} from "@/features/location/application/location.schemas";
import { parseConfirmedLocation } from "@/features/directory/utils/directory-maps";

describe("location contracts", () => {
  it("accepts paired finite coordinates with six decimals", () => {
    const location = locationSchema.parse({
      lat: -37.1075,
      lng: -56.8614,
      formattedAddress: "Pinamar, Buenos Aires",
      geocoderProvider: "photon",
    });

    expect(location.lat).toBe(-37.1075);
    expect(isValidLocation(location)).toBe(true);
  });

  it.each([
    { lat: -37.1075 },
    { lat: Number.NaN, lng: -56.8614 },
    { lat: -37.1075, lng: Number.POSITIVE_INFINITY },
    { lat: 90.000001, lng: 0 },
    { lat: 0, lng: 180.000001 },
    { lat: -37.1075001, lng: -56.8614 },
  ])("rejects invalid coordinate shape %#", (location) => {
    expect(() => locationSchema.parse(location)).toThrow();
    expect(isValidLocation(location)).toBe(false);
    expect(parseConfirmedLocation(location)).toBeNull();
  });
});
