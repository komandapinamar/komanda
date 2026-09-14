import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("printing producer contract", () => {
  it("exposes the one-time desktop pairing contract", async () => {
    const [create, claim] = await Promise.all([
      readFile("app/api/v1/tenants/[tenantId]/print-pairings/route.ts", "utf8"),
      readFile("app/api/v1/print/pair/route.ts", "utf8"),
    ]);
    expect(create).toContain("PrintPairingService");
    expect(claim).toContain("new PrintPairingService().claim");
  });
  it("has route adapters for the v1 print contract", async () => {
    const [enroll, claim, result] = await Promise.all([
      readFile("app/api/v1/tenants/[tenantId]/print-agents/route.ts", "utf8"),
      readFile("app/api/v1/print/jobs/claim/route.ts", "utf8"),
      readFile("app/api/v1/print/jobs/[jobId]/result/route.ts", "utf8"),
    ]);

    expect(enroll).toContain("PrintAgentService");
    expect(claim).toContain("PrintJobService");
    expect(result).toContain("idempotency-key");
  });
});
