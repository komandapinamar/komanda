import { describe, expect, it, vi } from "vitest";

vi.mock("@/db", () => ({
  db: {
    transaction: vi.fn(),
  },
  runtimePool: {},
}));

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  businessRegistrationSchema,
  PublicRegistrationService,
  publicRegistrationSchema,
} from "@/features/provisioning/application/public-registration.service";
import BusinessRegistrationWizard from "@/features/identity/web/BusinessRegistrationWizard";
import { db } from "@/db";

const location = { lat: -37.1075, lng: -56.8614, formattedAddress: "Pinamar" };

describe("Public Registration Feature", () => {
  describe("Validation Schema (publicRegistrationSchema)", () => {
    it("requires a finite paired location with range and precision limits", () => {
      expect(() => publicRegistrationSchema.parse({
        businessName: "Sin mapa",
        slug: "sin-mapa",
        email: "owner@example.com",
        password: "Password123!",
      })).toThrow();
      expect(() => publicRegistrationSchema.parse({
        businessName: "Coordenada inválida",
        slug: "coordenada-invalida",
        email: "owner@example.com",
        password: "Password123!",
        location: { lat: 91, lng: -56.8614 },
      })).toThrow();
      expect(() => publicRegistrationSchema.parse({
        businessName: "Demasiada precisión",
        slug: "demasiada-precision",
        email: "owner@example.com",
        password: "Password123!",
        location: { lat: -37.1075001, lng: -56.8614 },
      })).toThrow();
    });
    it("accepts valid gastronomy registration input", () => {
      const input = {
        businessName: "La Trattoria Italiana",
        slug: "la-trattoria-italiana",
        preset: "gastronomy" as const,
        location,
        email: "dueno@trattoria.com",
        password: "PasswordSeguro123!",
      };

      const parsed = publicRegistrationSchema.parse(input);
      expect(parsed.businessName).toBe("La Trattoria Italiana");
      expect(parsed.preset).toBe("gastronomy");
      expect(parsed.slug).toBe("la-trattoria-italiana");
    });

    it("accepts valid express_retail registration input", () => {
      const input = {
        businessName: "Kiosco San Martín 24hs",
        slug: "kiosco-san-martin-24hs",
        preset: "express_retail" as const,
        location,
        email: "kiosco@sanmartin.com",
        password: "PasswordSeguro123!",
      };

      const parsed = publicRegistrationSchema.parse(input);
      expect(parsed.businessName).toBe("Kiosco San Martín 24hs");
      expect(parsed.preset).toBe("express_retail");
    });

    it("defaults preset to gastronomy when not specified", () => {
      const input = {
        businessName: "Café de la Plaza",
        slug: "cafe-de-la-plaza",
        email: "cafe@plaza.com",
        password: "PasswordSeguro123!",
        location,
      };

      const parsed = publicRegistrationSchema.parse(input);
      expect(parsed.preset).toBe("gastronomy");
    });

    it("accepts business details without credentials for an authenticated user", () => {
      const parsed = businessRegistrationSchema.parse({
        businessName: "Segundo Local",
        slug: "segundo-local",
        preset: "gastronomy",
        location,
      });

      expect(parsed.slug).toBe("segundo-local");
    });

    it("rejects invalid slugs with uppercase or special characters", () => {
      expect(() =>
        publicRegistrationSchema.parse({
          businessName: "Mi Negocio",
          slug: "Mi Negocio!",
          preset: "gastronomy",
          email: "test@example.com",
          password: "password123",
          location,
        }),
      ).toThrow();
    });

    it("rejects password shorter than 8 characters", () => {
      expect(() =>
        publicRegistrationSchema.parse({
          businessName: "Mi Negocio",
          slug: "mi-negocio",
          preset: "express_retail",
          email: "test@example.com",
          password: "short",
          location,
        }),
      ).toThrow();
    });

    it("rejects invalid email address", () => {
      expect(() =>
        publicRegistrationSchema.parse({
          businessName: "Mi Negocio",
          slug: "mi-negocio",
          preset: "express_retail",
          email: "not-an-email",
          password: "password123",
          location,
        }),
      ).toThrow();
    });
  });

  describe("UI Component (BusinessRegistrationWizard)", () => {
    it("renders initial step with preset cards and inputs", () => {
      const markup = renderToStaticMarkup(React.createElement(BusinessRegistrationWizard));

      expect(markup).toContain("Creá tu nuevo negocio");
      expect(markup).toContain("Gastronomía (Komanda POS)");
      expect(markup).toContain("Autoservicio &amp; Retail (Komanda Kiosk)");
      expect(markup).toContain("Nombre del comercio");
      expect(markup).toContain("Identificador público (URL)");
      expect(markup).toContain("komanda.app/");
      expect(markup).toContain("Komanda Kiosk");
      expect(markup).toContain("Iniciá sesión acá");
    });

    it("uses the active account without rendering credential fields", () => {
      const markup = renderToStaticMarkup(
        React.createElement(BusinessRegistrationWizard, {
          authenticatedEmail: "owner@example.com",
        }),
      );

      expect(markup).toContain("Vas a usar la cuenta owner@example.com.");
      expect(markup).not.toContain('id="password"');
    });
  });

  it("persists the confirmed location in the primary location insert", async () => {
    const inserts: unknown[] = [];
    const transaction = {
      execute: vi.fn().mockResolvedValue(undefined),
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([]),
      insert: vi.fn().mockReturnThis(),
      values: vi.fn((value) => {
        inserts.push(value);
        return Promise.resolve();
      }),
    };
    vi.mocked(db.transaction).mockImplementation(async (callback) =>
      callback(transaction as never),
    );

    await new PublicRegistrationService(
      () => new Date("2026-09-20T00:00:00.000Z"),
      async () => "hashed-password",
    ).register({
      businessName: "Pinamar Demo",
      slug: "pinamar-demo",
      preset: "gastronomy",
      location,
      email: "owner@pinamar-demo.test",
      password: "Password123!",
    });

    expect(inserts).toContainEqual(
      expect.objectContaining({
        address: { ...location, geocoderProvider: "photon" },
        isPrimary: true,
      }),
    );
  });
});
