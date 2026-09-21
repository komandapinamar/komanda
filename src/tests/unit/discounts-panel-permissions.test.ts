import { describe, expect, it } from "vitest";
import { canAccess } from "@/lib/authorization/permissions";
import {
  getStatusBadgeClass,
  getStatusLabel,
} from "@/features/discounts/web/AdminDiscountsPanel";

describe("Story 1.3: Discounts Panel Permissions and Helpers", () => {
  describe("Permissions (canAccess)", () => {
    it("allows owner and admin to access promociones", () => {
      expect(canAccess("owner", "promociones")).toBe(true);
      expect(canAccess("admin", "promociones")).toBe(true);
    });

    it("denies employee access to promociones", () => {
      expect(canAccess("employee", "promociones")).toBe(false);
    });
  });

  describe("Status Badge and Label Helpers", () => {
    it("returns correct label and styling for active status", () => {
      expect(getStatusLabel("active")).toBe("Activo");
      expect(getStatusBadgeClass("active")).toContain("text-emerald-400");
    });

    it("returns correct label and styling for paused status", () => {
      expect(getStatusLabel("paused")).toBe("Pausado");
      expect(getStatusBadgeClass("paused")).toContain("text-amber-400");
    });

    it("returns correct label and styling for scheduled status", () => {
      expect(getStatusLabel("scheduled")).toBe("Programado");
      expect(getStatusBadgeClass("scheduled")).toContain("text-sky-400");
    });

    it("returns correct label and styling for expired status", () => {
      expect(getStatusLabel("expired")).toBe("Vencido");
      expect(getStatusBadgeClass("expired")).toContain("text-zinc-400");
    });

    it("returns correct label and styling for exhausted status", () => {
      expect(getStatusLabel("exhausted")).toBe("Agotado");
      expect(getStatusBadgeClass("exhausted")).toContain("text-zinc-400");
    });
  });
});
