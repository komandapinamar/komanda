import { describe, expect, it, vi } from "vitest";

vi.mock("@/db", () => ({
  db: {
    transaction: vi.fn(),
  },
  runtimePool: {},
}));

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { publicRegistrationSchema } from "@/features/provisioning/application/public-registration.service";
import BusinessRegistrationWizard from "@/features/identity/web/BusinessRegistrationWizard";

describe("Public Registration Feature", () => {
  describe("Validation Schema (publicRegistrationSchema)", () => {
    it("accepts valid gastronomy registration input", () => {
      const input = {
        businessName: "La Trattoria Italiana",
        slug: "la-trattoria-italiana",
        preset: "gastronomy" as const,
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
      };

      const parsed = publicRegistrationSchema.parse(input);
      expect(parsed.preset).toBe("gastronomy");
    });

    it("rejects invalid slugs with uppercase or special characters", () => {
      expect(() =>
        publicRegistrationSchema.parse({
          businessName: "Mi Negocio",
          slug: "Mi Negocio!",
          preset: "gastronomy",
          email: "test@example.com",
          password: "password123",
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
  });
});
