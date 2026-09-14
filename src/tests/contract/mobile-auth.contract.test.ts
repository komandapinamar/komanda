import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("mobile auth and operational context contracts", () => {
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
