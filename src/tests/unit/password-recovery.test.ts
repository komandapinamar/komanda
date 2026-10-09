import { beforeEach, describe, expect, it, vi } from "vitest";
import bcrypt from "bcrypt";
import { getTableName } from "drizzle-orm";

const { tx, withPlatformServiceTransaction } = vi.hoisted(() => ({
  tx: { select: vi.fn(), insert: vi.fn(), update: vi.fn(), execute: vi.fn() },
  withPlatformServiceTransaction: vi.fn(),
}));
vi.mock("@/db/tenant-transaction", () => ({ withPlatformServiceTransaction }));

import { PasswordRecoveryService, InvalidPasswordResetTokenError } from "@/features/identity/application/password-recovery.service";

const user = {
  id: "11111111-1111-4111-8111-111111111111",
  email: "owner@example.com",
  status: "active",
};

describe("password recovery", () => {
  let userRows: unknown[];
  let challengeRows: unknown[];
  const inserted = vi.fn();
  const updated = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    userRows = [user];
    challengeRows = [];
    withPlatformServiceTransaction.mockImplementation((_context, callback) => callback(tx));
    tx.select.mockImplementation(() => ({ from: (table: Parameters<typeof getTableName>[0]) => ({
      where: () => ({ limit: async () => getTableName(table) === "users" ? userRows : challengeRows }),
    }) }));
    tx.insert.mockImplementation(() => ({ values: inserted.mockResolvedValue(undefined) }));
    tx.update.mockImplementation((table: Parameters<typeof getTableName>[0]) => ({
      set: (values: unknown) => ({ where: () => {
        updated(getTableName(table), values);
        const result = Promise.resolve(undefined);
        return Object.assign(result, { returning: async () => [{ id: user.id }] });
      } }),
    }));
    tx.execute.mockResolvedValue({ rows: [] });
  });

  it("returns the same result for an unknown account and never delivers a link", async () => {
    userRows = [];
    const deliver = vi.fn();
    await new PasswordRecoveryService(deliver).request("unknown@example.com");
    expect(deliver).not.toHaveBeenCalled();
    expect(inserted).not.toHaveBeenCalled();
  });

  it("issues a hashed 30-minute single-use link and throttles another request", async () => {
    const deliver = vi.fn().mockResolvedValue(undefined);
    const now = new Date("2026-10-08T12:00:00Z");
    const service = new PasswordRecoveryService(deliver, () => now);
    await service.request("OWNER@EXAMPLE.COM");
    const deliveredToken = deliver.mock.calls[0][1] as string;
    expect(inserted).toHaveBeenCalledWith(expect.objectContaining({
      purpose: "password_reset", expiresAt: new Date(now.getTime() + 30 * 60 * 1000),
      tokenDigest: expect.not.stringContaining(deliveredToken),
    }));

    challengeRows = [{ userId: user.id, createdAt: now }];
    await service.request("owner@example.com");
    expect(deliver).toHaveBeenCalledTimes(1);
  });

  it("rejects expired or consumed links without changing the password", async () => {
    const service = new PasswordRecoveryService(vi.fn());
    await expect(service.reset("invalid-token", "newpassword123")).rejects.toThrow(InvalidPasswordResetTokenError);
    expect(updated).not.toHaveBeenCalled();
  });

  it("hashes the new password and revokes all active sessions atomically", async () => {
    challengeRows = [{ id: "challenge-1", userId: user.id }];
    await new PasswordRecoveryService(vi.fn()).reset("valid-token", "newpassword123");
    const passwordChange = updated.mock.calls.find(([table]) => table === "users");
    expect(passwordChange).toBeDefined();
    expect(await bcrypt.compare("newpassword123", passwordChange![1].passwordHash)).toBe(true);
    expect(updated).toHaveBeenCalledWith("user_sessions", expect.objectContaining({ revokedAt: expect.any(Date) }));
    expect(tx.execute).toHaveBeenCalledTimes(1);
    expect(updated).toHaveBeenCalledWith("identity_verification_challenges", expect.objectContaining({ consumedAt: expect.any(Date) }));
  });
});
