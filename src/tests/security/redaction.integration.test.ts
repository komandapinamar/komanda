import { describe, expect, it } from "vitest";
import { redactSensitiveData, safeLogFields } from "@/lib/observability/request-context";

describe("redaction", () => {
  it("redacts secrets and customer PII from logs/audit/outbox payloads", () => {
    const redacted = redactSensitiveData({
      accessToken: "token",
      refresh_token: "refresh",
      customer: {
        name: "Ada",
        email: "ada@example.com",
        phone: "123",
        safeId: "customer-1",
      },
      nested: { password: "secret" },
    });

    expect(redacted).toEqual({
      accessToken: "[REDACTED]",
      refresh_token: "[REDACTED]",
      customer: {
        name: "[REDACTED]",
        email: "[REDACTED]",
        phone: "[REDACTED]",
        safeId: "customer-1",
      },
      nested: { password: "[REDACTED]" },
    });
  });

  it("keeps safe tenant and correlation fields available", () => {
    expect(
      safeLogFields(
        { correlationId: "00000000-0000-4000-8000-000000000001", tenantId: "tenant-a" },
        { secret: "hidden", operation: "test" },
      ),
    ).toMatchObject({
      correlationId: "00000000-0000-4000-8000-000000000001",
      tenantId: "tenant-a",
      secret: "[REDACTED]",
      operation: "test",
    });
  });
});
