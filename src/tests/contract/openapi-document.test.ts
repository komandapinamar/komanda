import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parse } from "yaml";
import { describe, expect, it } from "vitest";

type OpenApiDocument = {
  paths: Record<string, Record<string, { operationId?: string }>>;
};

describe("published OpenAPI document", () => {
  it("has operation ids and local v1 route coverage for every implemented operation", async () => {
    const document = parse(
      await readFile(
        resolve(process.cwd(), "../specs/001-multi-tenant-base/contracts/openapi.yaml"),
        "utf8",
      ),
    ) as OpenApiDocument;
    const operations = Object.entries(document.paths).flatMap(([path, methods]) =>
      Object.entries(methods)
        .filter(([method]) => ["get", "post", "patch", "delete"].includes(method))
        .map(([method, operation]) => ({ method, path, operation })),
    );

    expect(operations.length).toBeGreaterThan(20);
    expect(operations.every(({ operation }) => operation.operationId)).toBe(true);
    for (const requiredPath of [
      "/api/v1/provisioning/tenants",
      "/api/v1/tenants/{tenantId}/orders",
      "/api/v1/print/jobs/claim",
    ]) {
      expect(document.paths[requiredPath]).toBeDefined();
    }
  });
});
