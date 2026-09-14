import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret } from "@/lib/encryption/secret-envelope";

describe("tenant secret envelope", () => {
  it("round-trips only with the same tenant, provider and key", () => {
    const key = randomBytes(32);
    const context = {
      tenantId: "00000000-0000-4000-8000-000000000001",
      provider: "mercadopago",
      key,
      keyVersion: 1,
    };
    const envelope = encryptSecret({ accessToken: "secret", refreshToken: "refresh" }, context);
    expect(decryptSecret(envelope, context)).toEqual({
      accessToken: "secret",
      refreshToken: "refresh",
    });
    expect(() =>
      decryptSecret(envelope, { ...context, tenantId: "00000000-0000-4000-8000-000000000002" }),
    ).toThrow();
    expect(() => decryptSecret(envelope, { ...context, provider: "other" })).toThrow();
  });

  it("supports explicit key rotation without accepting the old ciphertext under the new key", () => {
    const oldKey = randomBytes(32);
    const newKey = randomBytes(32);
    const identity = {
      tenantId: "00000000-0000-4000-8000-000000000001",
      provider: "mercadopago",
    };
    const previous = encryptSecret("old", { ...identity, key: oldKey, keyVersion: 1 });
    const rotated = encryptSecret("new", { ...identity, key: newKey, keyVersion: 2 });
    expect(decryptSecret(rotated, { ...identity, key: newKey })).toBe("new");
    expect(() => decryptSecret(previous, { ...identity, key: newKey })).toThrow();
  });

  it("never stores plaintext inside ciphertext, iv or authentication tag", () => {
    const envelope = encryptSecret("token-that-must-not-appear", {
      tenantId: "00000000-0000-4000-8000-000000000001",
      provider: "mercadopago",
      key: randomBytes(32),
      keyVersion: 1,
    });
    const serialized = Buffer.concat([
      envelope.ciphertext,
      envelope.iv,
      envelope.authTag,
    ]).toString("utf8");
    expect(serialized).not.toContain("token-that-must-not-appear");
  });
});
