import { describe, expect, it, vi } from "vitest";

const { register } = vi.hoisted(() => ({ register: vi.fn() }));

vi.mock("@/features/provisioning/application/public-registration.service", () => ({
  PublicRegistrationService: vi.fn().mockImplementation(function () {
    return { register };
  }),
  SlugAlreadyTakenError: class SlugAlreadyTakenError extends Error {},
  EmailAlreadyTakenError: class EmailAlreadyTakenError extends Error {},
  SessionAccountMismatchError: class SessionAccountMismatchError extends Error {},
  AccountDisabledError: class AccountDisabledError extends Error {},
}));

vi.mock("@/features/identity/web/authenticated-session", () => ({
  coreSessionService: () => ({ resolve: vi.fn() }),
  sessionTokenFromRequest: async () => null,
}));

vi.mock("@/features/identity/web/session-cookie", () => ({
  SESSION_COOKIE_NAME: "komanda_session",
  sessionCookieOptions: () => ({}),
}));

import { POST } from "@/app/api/v1/auth/register/route";

describe("POST /api/v1/auth/register unexpected errors", () => {
  it("does not disclose database error details in the 500 response", async () => {
    register.mockRejectedValueOnce(
      new Error(
        'Failed query: insert into "user_sessions" ("id", "user_id") values (default, $1) params: b5f6da5f-36fc-4856-ac79-92fc94be8388',
      ),
    );

    const response = await POST(
      new Request("https://komanda.example/api/v1/auth/register", {
        method: "POST",
        body: JSON.stringify({
          businessName: "Pinamar Demo",
          slug: "pinamar-demo",
          preset: "gastronomy",
          location: { lat: -37.1075, lng: -56.8614 },
          email: "owner@pinamar-demo.test",
          password: "Password123!",
        }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.code).toBe("REGISTRATION_FAILED");
    expect(body.detail).toBeUndefined();
    expect(JSON.stringify(body)).not.toContain("user_sessions");
    expect(JSON.stringify(body)).not.toContain("b5f6da5f");
  });
});
