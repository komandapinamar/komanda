import { afterEach, describe, expect, it } from "vitest";
import { buildStorefrontUrl } from "@/features/tenancy/utils/storefront-url";
import {
  buildGoogleMapsDirectUrl,
  parseLocationAddress,
  parseConfirmedLocation,
} from "@/features/directory/utils/directory-maps";

describe("buildStorefrontUrl", () => {
  const originalEnv = process.env.STOREFRONT_ROOT_DOMAIN;

  afterEach(() => {
    process.env.STOREFRONT_ROOT_DOMAIN = originalEnv;
  });

  it("builds localhost subdomain URL with port for local development", () => {
    process.env.STOREFRONT_ROOT_DOMAIN = "localhost";
    const url = buildStorefrontUrl("chikenstop", {
      host: "localhost:3000",
      protocol: "http",
    });
    expect(url).toBe("http://chikenstop.localhost:3000");
  });

  it("preserves custom local ports from host header", () => {
    process.env.STOREFRONT_ROOT_DOMAIN = "localhost";
    const url = buildStorefrontUrl("burger-place", {
      host: "127.0.0.1:8080",
      protocol: "http",
    });
    expect(url).toBe("http://burger-place.localhost:8080");
  });

  it("builds production subdomain URL using https and root domain", () => {
    process.env.STOREFRONT_ROOT_DOMAIN = "komanda.app";
    const url = buildStorefrontUrl("chikenstop", {
      host: "komanda.app",
      protocol: "https",
    });
    expect(url).toBe("https://chikenstop.komanda.app");
  });

  it("builds staging subdomain URL using configured root domain", () => {
    process.env.STOREFRONT_ROOT_DOMAIN = "staging.komanda.app";
    const url = buildStorefrontUrl("demo-store", {
      host: "staging.komanda.app",
      protocol: "https",
    });
    expect(url).toBe("https://demo-store.staging.komanda.app");
  });

  it("handles normalized slugs properly without trailing slashes", () => {
    process.env.STOREFRONT_ROOT_DOMAIN = "komanda.app";
    const url = buildStorefrontUrl("tenant-mock", {
      host: "komanda.app",
    });
    expect(url).toBe("https://tenant-mock.komanda.app");
  });
});

describe("directory-maps", () => {
  describe("parseLocationAddress", () => {
    it("accepts only finite paired coordinates for public maps", () => {
      expect(parseConfirmedLocation({ lat: -37.1075, lng: -56.8614, formattedAddress: "Pinamar" })).toEqual({
        lat: -37.1075,
        lng: -56.8614,
        formattedAddress: "Pinamar",
      });
      expect(parseConfirmedLocation({ lat: -37.1075 })).toBeNull();
      expect(parseConfirmedLocation({ lat: -37.1075001, lng: -56.8614 })).toBeNull();
    });
    it("parses string addresses directly", () => {
      const res = parseLocationAddress("Av. Corrientes 1234, CABA", "Sede", "Parrilla");
      expect(res.displayAddress).toBe("Av. Corrientes 1234, CABA");
      expect(res.mapQuery).toBe("Av. Corrientes 1234, CABA");
    });

    it("prioritizes coordinates for mapQuery when present in object", () => {
      const res = parseLocationAddress(
        {
          lat: -34.5833,
          lng: -58.4333,
          formatted: "Honduras 5500, Palermo",
        },
        "Palermo",
        "Burger Place",
      );
      expect(res.displayAddress).toBe("Honduras 5500, Palermo");
      expect(res.mapQuery).toBe("-34.5833,-58.4333");
    });

    it("parses structured street and city fields into display address and query", () => {
      const res = parseLocationAddress(
        {
          street: "Thames",
          number: "1600",
          city: "Buenos Aires",
          country: "Argentina",
        },
        "Sucursal Palermo",
        "La Cabrera",
      );
      expect(res.displayAddress).toBe("Thames 1600, Buenos Aires, Argentina");
      expect(res.mapQuery).toBe("Thames 1600, Buenos Aires, Argentina");
    });

    it("falls back to tenant name and meaningful location name when address is null", () => {
      const res = parseLocationAddress(null, "Sucursal Recoleta", "Café Martínez");
      expect(res.displayAddress).toBe("Sucursal Recoleta");
      expect(res.mapQuery).toBe("Café Martínez, Sucursal Recoleta");
    });

    it("ignores generic location names like 'Local principal' in fallback", () => {
      const res = parseLocationAddress(null, "Local principal", "Komanda Mock");
      expect(res.displayAddress).toBeNull();
      expect(res.mapQuery).toBe("Komanda Mock");
    });

    it("handles null location name and null address gracefully", () => {
      const res = parseLocationAddress(null, null, "Pizzería Güerrín");
      expect(res.displayAddress).toBeNull();
      expect(res.mapQuery).toBe("Pizzería Güerrín");
    });
  });

  describe("buildGoogleMapsDirectUrl", () => {
    it("builds direct Google Maps search link", () => {
      const url = buildGoogleMapsDirectUrl("Komanda Mock");
      expect(url).toBe("https://www.google.com/maps/search/?api=1&query=Komanda%20Mock");
    });
  });
});
