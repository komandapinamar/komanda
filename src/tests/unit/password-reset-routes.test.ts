import { describe, expect, it, vi } from "vitest";

const { request, reset } = vi.hoisted(() => ({ request: vi.fn(), reset: vi.fn() }));
vi.mock("@/features/identity/application/password-recovery.service", () => ({
  PasswordRecoveryService: vi.fn().mockImplementation(function () { return { request, reset }; }),
  InvalidPasswordResetTokenError: class InvalidPasswordResetTokenError extends Error {},
}));

import { POST as requestReset } from "@/app/api/v1/auth/password-resets/route";
import { POST as confirmReset } from "@/app/api/v1/auth/password-resets/confirm/route";

describe("public password recovery endpoints", () => {
  it("uses the same generic response for unknown and known addresses", async () => {
    request.mockResolvedValueOnce(undefined).mockResolvedValueOnce(undefined);
    const url = "https://komanda.example/api/v1/auth/password-resets";
    const send = (email: string) => requestReset(new Request(url, {
      method: "POST", body: JSON.stringify({ email }),
    }));
    const first = await send("known@example.com");
    const second = await send("unknown@example.com");
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual(await second.json());
    expect(first.headers.get("Cache-Control")).toBe("no-store");
  });

  it("rejects weak passwords before accessing the database", async () => {
    const response = await confirmReset(new Request("https://komanda.example/api/v1/auth/password-resets/confirm", {
      method: "POST", body: JSON.stringify({ token: "a".repeat(43), password: "short" }),
    }));
    expect(response.status).toBe(422);
    expect(reset).not.toHaveBeenCalled();
  });
});
