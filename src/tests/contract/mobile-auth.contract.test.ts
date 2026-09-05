import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parse } from "yaml";
import { describe, expect, it } from "vitest";

type OpenApiDocument = {
  paths: Record<string, Record<string, { operationId?: string; responses?: Record<string, unknown> }>>;
};

describe("mobile auth and operational context contracts", () => {
  it("publishes mobile sessions and context operations in OpenAPI", async () => {
    const document = parse(
      await readFile(
        resolve(process.cwd(), "../specs/001-multi-tenant-base/contracts/openapi.yaml"),
        "utf8",
      ),
    ) as OpenApiDocument;

    expect(document.paths["/api/v1/auth/mobile/sessions"]?.post?.operationId).toBe("createMobileSession");
    expect(document.paths["/api/v1/auth/mobile/context"]?.get?.operationId).toBe("getMobileContext");
  });

  it("has implemented route adapters for mobile sessions and context", async () => {
    const [sessionsRoute, contextRoute] = await Promise.all([
      readFile("app/api/v1/auth/mobile/sessions/route.ts", "utf8"),
      readFile("app/api/v1/auth/mobile/context/route.ts", "utf8"),
    ]);

    expect(sessionsRoute).toContain("SessionService");
    expect(sessionsRoute).toContain("token");
    expect(sessionsRoute).toContain("expiresAt");
    expect(sessionsRoute).toContain("DELETE");
    expect(contextRoute).toContain("getAuthorizedMobileContext");
    expect(contextRoute).toContain("INVALID_SESSION");
  });
});
