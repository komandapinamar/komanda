import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/features/payments/application/integration.service", () => ({
  MercadoPagoAccountAlreadyLinkedError: class extends Error {},
  MercadoPagoIntegrationConflictError: class extends Error {},
  MercadoPagoIntegrationDependencyError: class extends Error {},
  MercadoPagoIntegrationNotFoundError: class extends Error {},
  MercadoPagoOAuthStateError: class extends Error {},
}));

import { DrizzleQueryError } from "drizzle-orm/errors";
import { MercadoPagoAccountAlreadyLinkedError as MappedAlreadyLinkedError } from "@/features/payments/application/integration.service";
import {
  IntegrationRepository,
  MercadoPagoAccountAlreadyLinkedError,
  MercadoPagoIntegrationConflictError,
} from "@/features/payments/infrastructure/integration.repository";
import { integrationErrorResponse } from "@/features/payments/web/integration-http";

const TENANT_ID = "11111111-1111-4000-8000-111111111111";

const tokens = {
  accessToken: "app_usrcba-access",
  refreshToken: "tg_refresh",
  expiresIn: 15_552_000,
  userId: "999888777",
  scopes: ["offline_access", "read"],
};

/** Drizzle wraps driver failures, so the SQLSTATE only exists on `cause`. */
function uniqueViolation(
  constraint: string,
  query = 'insert into "integration_accounts" ...',
) {
  const driverError = Object.assign(
    new Error(`duplicate key value violates unique constraint "${constraint}"`),
    {
      code: "23505",
      constraint,
      detail: `Key ("provider","provider_account_id")=("mercadopago","999888777") already exists.`,
    },
  );
  return new DrizzleQueryError(query, [], driverError);
}

function transactionWith(rows: unknown[], insertError: unknown) {
  return {
    select: () => ({
      from: () => ({
        where: () => ({ limit: async () => rows }),
      }),
    }),
    insert: () => ({
      values: () => ({
        returning: async () => {
          throw insertError;
        },
      }),
    }),
    update: () => ({
      set: () => ({
        where: () => ({ returning: async () => rows }),
      }),
    }),
  } as never;
}

function repositoryFor(insertError: unknown) {
  return new IntegrationRepository(transactionWith([], insertError), TENANT_ID);
}

describe("IntegrationRepository.saveMercadoPago unique violations", () => {
  beforeEach(() => {
    vi.stubEnv(
      "APP_ENCRYPTION_KEY_BASE64",
      Buffer.alloc(32, 7).toString("base64"),
    );
    vi.stubEnv("APP_ENCRYPTION_KEY_VERSION", "1");
  });

  it("reports an explicit reason when the seller account already belongs to another tenant", async () => {
    await expect(
      repositoryFor(
        uniqueViolation("integration_accounts_provider_account_uidx"),
      ).saveMercadoPago(tokens),
    ).rejects.toBeInstanceOf(MercadoPagoAccountAlreadyLinkedError);
  });

  it("keeps unrelated unique violations a generic integration conflict", async () => {
    await expect(
      repositoryFor(
        uniqueViolation("integration_accounts_one_active_provider_uidx"),
      ).saveMercadoPago(tokens),
    ).rejects.toBeInstanceOf(MercadoPagoIntegrationConflictError);
  });

  it("does not swallow unrelated failures", async () => {
    const boom = new Error("connection terminated unexpectedly");

    await expect(repositoryFor(boom).saveMercadoPago(tokens)).rejects.toBe(
      boom,
    );
  });

  it("answers 409 with an owner-readable reason instead of a generic 500", async () => {
    const error = new MappedAlreadyLinkedError();

    const response = integrationErrorResponse(error, "corr-mp-1");
    const body = (await response.json()) as {
      code: string;
      detail: string;
    };

    expect(response.status).toBe(409);
    expect(body.code).toBe("MERCADO_PAGO_ACCOUNT_ALREADY_LINKED");
    expect(body.detail).toMatch(/otro negocio/);
    expect(body.detail).toMatch(/no puede conectarse a dos negocios/);
  });
});
