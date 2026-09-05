import { describe, expect, it } from "vitest";
import {
  canAccess,
  canWriteCatalog,
  type Section,
} from "@/lib/authorization/permissions";

describe("authorization permissions", () => {
  const allSections: Section[] = [
    "estado",
    "pedidos",
    "catalog",
    "configuracion",
    "integraciones",
    "members",
    "analytics",
  ];

  describe("employee role", () => {
    it("can only access 'pedidos'", () => {
      expect(canAccess("employee", "pedidos")).toBe(true);

      const forbiddenSections: Section[] = [
        "estado",
        "catalog",
        "configuracion",
        "integraciones",
        "members",
        "analytics",
      ];

      for (const section of forbiddenSections) {
        expect(
          canAccess("employee", section),
          `employee should not access ${section}`,
        ).toBe(false);
      }
    });

    it("cannot write catalog", () => {
      expect(canWriteCatalog("employee")).toBe(false);
    });
  });

  describe("admin role", () => {
    it("can access 'pedidos', 'catalog' and 'analytics'", () => {
      expect(canAccess("admin", "pedidos")).toBe(true);
      expect(canAccess("admin", "catalog")).toBe(true);
      expect(canAccess("admin", "analytics")).toBe(true);

      const forbiddenSections: Section[] = [
        "estado",
        "configuracion",
        "integraciones",
        "members",
      ];

      for (const section of forbiddenSections) {
        expect(
          canAccess("admin", section),
          `admin should not access ${section}`,
        ).toBe(false);
      }
    });

    it("can write catalog", () => {
      expect(canWriteCatalog("admin")).toBe(true);
    });
  });

  describe("owner role", () => {
    it("can access all sections", () => {
      for (const section of allSections) {
        expect(
          canAccess("owner", section),
          `owner should access ${section}`,
        ).toBe(true);
      }
    });

    it("can write catalog", () => {
      expect(canWriteCatalog("owner")).toBe(true);
    });
  });
});
