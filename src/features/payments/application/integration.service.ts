import "server-only";

import { and, eq } from "drizzle-orm";
import type { Role } from "@/db/schema/platform";
import {
  withTenantTransaction,
  type TenantTransaction,
} from "@/db/tenant-transaction";
import { tenantMemberships } from "@/db/schema";
import {
  IntegrationRepository,
  type MercadoPagoIntegrationAccount,
} from "@/features/payments/infrastructure/integration.repository";
import {
  MercadoPagoDependencyError,
  mercadoPagoOAuthClientFromEnvironment,
  type MercadoPagoOAuthClient,
} from "@/features/payments/infrastructure/mercadopago-oauth.client";
import {
  decryptSecret,
  encryptSecret,
  encryptionKeyFromBase64,
} from "@/lib/encryption/secret-envelope";
import {
  createVerifiedTenantContext,
  type TenantContext,
} from "@/lib/tenant-context/types";

export class MercadoPagoIntegrationNotFoundError extends Error {}
export class MercadoPagoIntegrationConflictError extends Error {}
export class MercadoPagoOAuthStateError extends Error {}
export class MercadoPagoIntegrationDependencyError extends Error {}

type OAuthStatePayload = {
  tenantId: string;
  userId: string;
  membershipId: string;
  role: Role;
  expiresAt: string;
};

type EncodedOAuthState = {
  tenantId: string;
  keyVersion: number;
  ciphertext: string;
  iv: string;
  authTag: string;
};

function base64Url(buffer: Buffer) {
  return buffer.toString("base64url");
}

function encryptionConfig() {
  const encoded = process.env.APP_ENCRYPTION_KEY_BASE64;
  const version = Number(process.env.APP_ENCRYPTION_KEY_VERSION);
  if (!encoded || !Number.isSafeInteger(version) || version < 1) {
    throw new Error("Application encryption is not configured.");
  }
  return { key: encryptionKeyFromBase64(encoded), keyVersion: version };
}

function encodeOAuthState(payload: OAuthStatePayload) {
  const config = encryptionConfig();
  const envelope = encryptSecret(payload, {
    tenantId: payload.tenantId,
    provider: "mercadopago-oauth-state",
    ...config,
  });
  const state: EncodedOAuthState = {
    tenantId: payload.tenantId,
    keyVersion: envelope.keyVersion,
    ciphertext: base64Url(envelope.ciphertext),
    iv: base64Url(envelope.iv),
    authTag: base64Url(envelope.authTag),
  };
  return base64Url(Buffer.from(JSON.stringify(state), "utf8"));
}

function decodeOAuthState(value: string) {
  try {
    const state = JSON.parse(
      Buffer.from(value, "base64url").toString("utf8"),
    ) as EncodedOAuthState;
    const config = encryptionConfig();
    if (config.keyVersion !== state.keyVersion) {
      throw new MercadoPagoOAuthStateError("OAuth state key version is unavailable.");
    }
    const payload = decryptSecret<OAuthStatePayload>(
      {
        algorithm: "aes-256-gcm",
        keyVersion: state.keyVersion,
        ciphertext: Buffer.from(state.ciphertext, "base64url"),
        iv: Buffer.from(state.iv, "base64url"),
        authTag: Buffer.from(state.authTag, "base64url"),
      },
      {
        tenantId: state.tenantId,
        provider: "mercadopago-oauth-state",
        key: config.key,
      },
    );
    if (new Date(payload.expiresAt) <= new Date()) {
      throw new MercadoPagoOAuthStateError("OAuth state expired.");
    }
    return payload;
  } catch (error) {
    if (error instanceof MercadoPagoOAuthStateError) throw error;
    throw new MercadoPagoOAuthStateError("OAuth state is invalid.");
  }
}

function sellerHint(accountId: string) {
  return accountId.length <= 4 ? accountId : `...${accountId.slice(-4)}`;
}

function serializeStatus(account: MercadoPagoIntegrationAccount | null) {
  if (!account) {
    return {
      provider: "mercadopago" as const,
      status: "pending" as const,
      sellerAccountHint: null,
      scopes: [],
      expiresAt: null,
      lastVerifiedAt: null,
      version: 1,
    };
  }
  return {
    provider: "mercadopago" as const,
    status: account.status,
    sellerAccountHint: sellerHint(account.providerAccountId),
    scopes: account.scopes,
    expiresAt: account.expiresAt?.toISOString() ?? null,
    lastVerifiedAt: account.lastVerifiedAt?.toISOString() ?? null,
    version: account.version,
  };
}

export class MercadoPagoIntegrationService {
  constructor(
    private readonly configuredOAuth?: MercadoPagoOAuthClient,
    private readonly now: () => Date = () => new Date(),
  ) {}

  getStatus(context: TenantContext) {
    return withTenantTransaction(context, async (transaction) => {
      const account = await new IntegrationRepository(
        transaction,
        context.tenantId,
      ).currentMercadoPago();
      return serializeStatus(account);
    });
  }

  startOAuth(context: TenantContext) {
    if (context.actor.kind !== "user") {
      throw new MercadoPagoIntegrationNotFoundError("Invalid actor.");
    }

    const expiresAt = new Date(this.now().getTime() + 10 * 60 * 1000);
    const state = encodeOAuthState({
      tenantId: context.tenantId,
      userId: context.actor.userId,
      membershipId: context.actor.membershipId,
      role: context.actor.role,
      expiresAt: expiresAt.toISOString(),
    });

    return {
      authorizationUrl: this.oauth().authorizationUrl({ state }),
      expiresAt: expiresAt.toISOString(),
    };
  }

  async completeOAuth(input: {
    code: string;
    state: string;
    correlationId: string;
  }) {
    const state = decodeOAuthState(input.state);
    const tokens = await this.withDependencyMapping(() =>
      this.oauth().exchangeCode(input.code),
    );

    const context = createVerifiedTenantContext({
      tenantId: state.tenantId,
      correlationId: input.correlationId,
      source: "administrative",
      actor: {
        kind: "user",
        userId: state.userId,
        membershipId: state.membershipId,
        role: state.role,
      },
    });

    await withTenantTransaction(context, async (transaction) => {
      await this.assertMembershipStillActive(transaction, state);
      const repository = new IntegrationRepository(transaction, state.tenantId);
      await repository.saveMercadoPago(tokens);
    });

    return { tenantId: state.tenantId };
  }

  async revoke(context: TenantContext, version: number) {
    await withTenantTransaction(context, async (transaction) => {
      const repository = new IntegrationRepository(transaction, context.tenantId);
      const account = await repository.currentMercadoPago();
      if (!account || account.version !== version) {
        throw new MercadoPagoIntegrationConflictError(
          "Mercado Pago integration version conflict.",
        );
      }

      const tokens = repository.decryptTokens(account);
      await this.withDependencyMapping(() => this.oauth().revoke(tokens.accessToken));
      const revoked = await repository.revokeMercadoPago(version);
      if (!revoked) {
        throw new MercadoPagoIntegrationConflictError(
          "Mercado Pago integration version conflict.",
        );
      }
    });
  }

  private async assertMembershipStillActive(
    transaction: TenantTransaction,
    state: OAuthStatePayload,
  ) {
    const [membership] = await transaction
      .select({ id: tenantMemberships.id })
      .from(tenantMemberships)
      .where(
        and(
          eq(tenantMemberships.id, state.membershipId),
          eq(tenantMemberships.tenantId, state.tenantId),
          eq(tenantMemberships.userId, state.userId),
          eq(tenantMemberships.status, "active"),
        ),
      )
      .limit(1);
    if (!membership) {
      throw new MercadoPagoIntegrationNotFoundError("Membership is no longer active.");
    }
  }

  private oauth() {
    return this.configuredOAuth ?? mercadoPagoOAuthClientFromEnvironment();
  }

  private async withDependencyMapping<T>(operation: () => Promise<T>) {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof MercadoPagoDependencyError) {
        throw new MercadoPagoIntegrationDependencyError(error.message);
      }
      throw error;
    }
  }
}
