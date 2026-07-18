import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parse } from "yaml";
import { describe, expect, it } from "vitest";

describe("printing producer contract", () => {
  it("publishes print agent enrollment, claim and result operations", async () => {
    const document = parse(
      await readFile(
        resolve(process.cwd(), "../specs/001-multi-tenant-base/contracts/openapi.yaml"),
        "utf8",
      ),
    ) as { paths: Record<string, Record<string, unknown>> };

    expect(
      document.paths["/api/v1/tenants/{tenantId}/print-agents"]?.post,
    ).toBeDefined();
    expect(document.paths["/api/v1/print/jobs/claim"]?.post).toBeDefined();
    expect(document.paths["/api/v1/print/jobs/{jobId}/result"]?.post).toBeDefined();
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
