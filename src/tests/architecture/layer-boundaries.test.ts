import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const applicationAndDomainFiles = [
  "features/orders/domain/order.rules.ts",
  "features/orders/application/create-order.service.ts",
  "features/orders/application/transition-order.service.ts",
  "features/printing/application/print-agent.service.ts",
  "features/printing/application/print-job.service.ts",
  "features/shop/payments/application/payment-session.service.ts",
];

describe("layer boundaries", () => {
  it("keeps domain/application services independent from Next.js adapters", async () => {
    for (const file of applicationAndDomainFiles) {
      const source = await readFile(file, "utf8");
      expect(source).not.toContain("next/");
      expect(source).not.toContain("@/app/");
      expect(source).not.toContain("next/server");
    }
  });
});
