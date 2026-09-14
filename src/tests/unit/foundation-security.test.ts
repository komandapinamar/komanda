import { describe, expect, it, vi } from "vitest";
import {
  decryptSecret,
  encryptSecret,
} from "@/lib/encryption/secret-envelope";
import { problemResponse } from "@/lib/http/problem";
import { buildTenantStorageKey } from "@/lib/object-storage/object-storage";
import { redactSensitiveData } from "@/lib/observability/request-context";

const key = Buffer.alloc(32, 7);

describe("foundation security primitives", () => {
  it("binds encrypted provider secrets to tenant, provider and key version", () => {
    const envelope = encryptSecret(
      { accessToken: "secret-token", refreshToken: "refresh-token" },
      {
        tenantId: "00000000-0000-4000-8000-000000000001",
        provider: "mercadopago",
        keyVersion: 1,
        key,
      },
    );

    expect(envelope.ciphertext.toString("utf8")).not.toContain("secret-token");
    expect(
      decryptSecret(envelope, {
        tenantId: "00000000-0000-4000-8000-000000000001",
        provider: "mercadopago",
        key,
      }),
    ).toEqual({ accessToken: "secret-token", refreshToken: "refresh-token" });
    expect(() =>
      decryptSecret(envelope, {
        tenantId: "00000000-0000-4000-8000-000000000002",
        provider: "mercadopago",
        key,
      }),
    ).toThrow();
  });

  it("redacts nested secrets and PII before structured logging", () => {
    expect(
      redactSensitiveData({
        tenantId: "safe-tenant",
        accessToken: "nope",
        customer: { email: "private@example.test", name: "Private" },
      }),
    ).toEqual({
      tenantId: "safe-tenant",
      accessToken: "[REDACTED]",
      customer: { email: "[REDACTED]", name: "[REDACTED]" },
    });
  });

  it("emits problem+json without leaking internal errors", async () => {
    vi.stubEnv("KOMANDA_PUBLIC_BASE_URL", "https://problems.example.test");

    const response = problemResponse({
      status: 404,
      title: "Not Found",
      code: "RESOURCE_NOT_FOUND",
      correlationId: "00000000-0000-4000-8000-000000000099",
    });

    expect(response.headers.get("content-type")).toContain("application/problem+json");
    await expect(response.json()).resolves.toEqual({
      type: "https://problems.example.test/problems/resource-not-found",
      title: "Not Found",
      status: 404,
      code: "RESOURCE_NOT_FOUND",
      correlationId: "00000000-0000-4000-8000-000000000099",
    });
  });

  it("always prefixes media objects with the verified tenant id", () => {
    expect(
      buildTenantStorageKey(
        "00000000-0000-4000-8000-000000000001",
        "00000000-0000-4000-8000-000000000010",
        "image/png",
      ),
    ).toBe(
      "tenants/00000000-0000-4000-8000-000000000001/media/00000000-0000-4000-8000-000000000010.png",
    );
  });
});
