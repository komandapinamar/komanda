import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import {
  integrationAccounts,
  paymentAttempts,
  providerResourceRoutes,
  tenantEntitlementSnapshots,
  webhookEvents,
} from "@/db/schema";
import type { TenantTransaction } from "@/db/tenant-transaction";
import {
  decryptSecret,
  encryptSecret,
  encryptionKeyFromBase64,
} from "@/lib/encryption/secret-envelope";
import type { MercadoPagoTokens } from "./mercadopago-oauth.client";

export type MercadoPagoIntegrationAccount =
  typeof integrationAccounts.$inferSelect;

export class PaymentAttemptIdempotencyConflictError extends Error {}

function encryptionConfig() {
  const encoded = process.env.APP_ENCRYPTION_KEY_BASE64;
  const version = Number(process.env.APP_ENCRYPTION_KEY_VERSION);
  if (!encoded || !Number.isSafeInteger(version) || version < 1) {
    throw new Error("Application encryption is not configured.");
  }
  return { key: encryptionKeyFromBase64(encoded), keyVersion: version };
}

export class IntegrationRepository {
  constructor(
    private readonly transaction: TenantTransaction,
    private readonly tenantId: string,
  ) {}

  async hasOnlinePaymentsEntitlement() {
    const [snapshot] = await this.transaction
      .select({ entitlements: tenantEntitlementSnapshots.entitlements })
      .from(tenantEntitlementSnapshots)
      .where(
        and(
          eq(tenantEntitlementSnapshots.tenantId, this.tenantId),
          isNull(tenantEntitlementSnapshots.supersededAt),
        ),
      )
      .limit(1);
    return snapshot?.entitlements.online_payments === true;
  }

  async saveMercadoPago(tokens: MercadoPagoTokens) {
    const config = encryptionConfig();
    const envelope = encryptSecret(tokens, {
      tenantId: this.tenantId,
      provider: "mercadopago",
      ...config,
    });
    const expiresAt = new Date(Date.now() + tokens.expiresIn * 1000);
    const [existing] = await this.transaction
      .select()
      .from(integrationAccounts)
      .where(
        and(
          eq(integrationAccounts.tenantId, this.tenantId),
          eq(integrationAccounts.provider, "mercadopago"),
        ),
      )
      .limit(1);
    if (existing) {
      const [updated] = await this.transaction
        .update(integrationAccounts)
        .set({
          providerAccountId: tokens.userId,
          status: "active",
          encryptedPayload: envelope.ciphertext,
          encryptionIv: envelope.iv,
          authTag: envelope.authTag,
          keyVersion: envelope.keyVersion,
          scopes: tokens.scopes,
          expiresAt,
          lastVerifiedAt: new Date(),
          version: sql`${integrationAccounts.version} + 1`,
          updatedAt: new Date(),
        })
        .where(eq(integrationAccounts.id, existing.id))
        .returning();
      return updated!;
    }
    const [created] = await this.transaction
      .insert(integrationAccounts)
      .values({
        tenantId: this.tenantId,
        provider: "mercadopago",
        providerAccountId: tokens.userId,
        status: "active",
        encryptedPayload: envelope.ciphertext,
        encryptionIv: envelope.iv,
        authTag: envelope.authTag,
        keyVersion: envelope.keyVersion,
        scopes: tokens.scopes,
        expiresAt,
        lastVerifiedAt: new Date(),
      })
      .returning();
    return created!;
  }

  async currentMercadoPago() {
    const [account] = await this.transaction
      .select()
      .from(integrationAccounts)
      .where(
        and(
          eq(integrationAccounts.tenantId, this.tenantId),
          eq(integrationAccounts.provider, "mercadopago"),
        ),
      )
      .limit(1);
    return account ?? null;
  }

  decryptTokens(account: typeof integrationAccounts.$inferSelect) {
    const config = encryptionConfig();
    if (config.keyVersion !== account.keyVersion) {
      throw new Error("Encryption key version is unavailable.");
    }
    return decryptSecret<MercadoPagoTokens>(
      {
        algorithm: "aes-256-gcm",
        keyVersion: account.keyVersion,
        ciphertext: account.encryptedPayload,
        iv: account.encryptionIv,
        authTag: account.authTag,
      },
      { tenantId: this.tenantId, provider: "mercadopago", key: config.key },
    );
  }

  async revokeMercadoPago(version: number) {
    const [account] = await this.transaction
      .update(integrationAccounts)
      .set({
        status: "revoked",
        version: sql`${integrationAccounts.version} + 1`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(integrationAccounts.tenantId, this.tenantId),
          eq(integrationAccounts.provider, "mercadopago"),
          eq(integrationAccounts.version, version),
        ),
      )
      .returning();
    return account ?? null;
  }

  async findActiveByCartId(cartId: string) {
    const [attempt] = await this.transaction
      .select()
      .from(paymentAttempts)
      .where(
        and(
          eq(paymentAttempts.tenantId, this.tenantId),
          eq(paymentAttempts.cartId, cartId),
          inArray(paymentAttempts.status, ["initiated", "processing", "pending"]),
        ),
      )
      .limit(1);
    return attempt ?? null;
  }

  async createPaymentAttempt(input: {
    cartId: string;
    integrationAccountId: string;
    amount: string;
    currency: string;
    customer: Record<string, unknown>;
    notes?: string;
    idempotencyKey: string;
  }) {
    const [attempt] = await this.transaction
      .insert(paymentAttempts)
      .values({
        tenantId: this.tenantId,
        cartId: input.cartId,
        integrationAccountId: input.integrationAccountId,
        amount: input.amount,
        currency: input.currency,
        customerSnapshot: input.customer,
        notes: input.notes,
        idempotencyKey: input.idempotencyKey,
      })
      .onConflictDoNothing()
      .returning();
    if (attempt) return attempt;
    const [existing] = await this.transaction
      .select()
      .from(paymentAttempts)
      .where(
        and(
          eq(paymentAttempts.tenantId, this.tenantId),
          eq(paymentAttempts.idempotencyKey, input.idempotencyKey),
        ),
      )
      .limit(1);
    if (existing && existing.cartId !== input.cartId) {
      throw new PaymentAttemptIdempotencyConflictError(
        "Idempotency key belongs to another cart.",
      );
    }
    return existing!;
  }

  async attachPreference(input: {
    attemptId: string;
    integrationAccountId: string;
    preferenceId: string;
  }) {
    const [updated] = await this.transaction
      .update(paymentAttempts)
      .set({ providerPreferenceId: input.preferenceId, status: "processing" })
      .where(
        and(
          eq(paymentAttempts.tenantId, this.tenantId),
          eq(paymentAttempts.id, input.attemptId),
          eq(paymentAttempts.integrationAccountId, input.integrationAccountId),
        ),
      )
      .returning({ id: paymentAttempts.id });
    if (!updated) {
      throw new PaymentAttemptIdempotencyConflictError(
        "Payment attempt no longer matches its integration account.",
      );
    }
    await this.transaction
      .insert(providerResourceRoutes)
      .values({
        provider: "mercadopago",
        resourceType: "preference",
        externalId: input.preferenceId,
        tenantId: this.tenantId,
        integrationAccountId: input.integrationAccountId,
        localResourceId: input.attemptId,
      })
      .onConflictDoNothing();
  }
}

export class WebhookRoutingRepository {
  constructor(private readonly transaction: TenantTransaction) {}

  async resolveAccount(routingKey: string) {
    const [account] = await this.transaction
      .select()
      .from(integrationAccounts)
      .where(eq(integrationAccounts.webhookRoutingKey, routingKey))
      .limit(1);
    return account ?? null;
  }

  async resolve(routingKey: string, resourceId: string) {
    const account = await this.resolveAccount(routingKey);
    if (!account) return null;
    const [route] = await this.transaction
      .select()
      .from(providerResourceRoutes)
      .where(
        and(
          eq(providerResourceRoutes.provider, "mercadopago"),
          eq(providerResourceRoutes.externalId, resourceId),
          eq(providerResourceRoutes.tenantId, account.tenantId),
        ),
      )
      .limit(1);
    return route ? { account, route } : null;
  }

  async findRoute(input: {
    tenantId: string;
    integrationAccountId: string;
    resourceType: "payment" | "preference";
    externalId: string;
  }) {
    const [route] = await this.transaction
      .select()
      .from(providerResourceRoutes)
      .where(
        and(
          eq(providerResourceRoutes.provider, "mercadopago"),
          eq(providerResourceRoutes.resourceType, input.resourceType),
          eq(providerResourceRoutes.externalId, input.externalId),
          eq(providerResourceRoutes.tenantId, input.tenantId),
          eq(providerResourceRoutes.integrationAccountId, input.integrationAccountId),
        ),
      )
      .limit(1);
    return route ?? null;
  }

  async findPaymentAttempt(input: {
    tenantId: string;
    integrationAccountId: string;
    attemptId: string;
  }) {
    const [attempt] = await this.transaction
      .select()
      .from(paymentAttempts)
      .where(
        and(
          eq(paymentAttempts.tenantId, input.tenantId),
          eq(paymentAttempts.integrationAccountId, input.integrationAccountId),
          eq(paymentAttempts.id, input.attemptId),
        ),
      )
      .limit(1);
    return attempt ?? null;
  }

  async attachPaymentResource(input: {
    tenantId: string;
    integrationAccountId: string;
    paymentAttemptId: string;
    providerPaymentId: string;
  }) {
    await this.transaction
      .insert(providerResourceRoutes)
      .values({
        provider: "mercadopago",
        resourceType: "payment",
        externalId: input.providerPaymentId,
        tenantId: input.tenantId,
        integrationAccountId: input.integrationAccountId,
        localResourceId: input.paymentAttemptId,
      })
      .onConflictDoNothing();
  }

  async updatePaymentAttemptFromWebhook(input: {
    tenantId: string;
    integrationAccountId: string;
    paymentAttemptId: string;
    providerPaymentId: string;
    status: typeof paymentAttempts.$inferSelect.status;
    processedAt: Date | null;
    failureCode?: string | null;
  }) {
    const [updated] = await this.transaction
      .update(paymentAttempts)
      .set({
        providerPaymentId: input.providerPaymentId,
        status: input.status,
        processedAt: input.processedAt,
        failureCode: input.failureCode ?? null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(paymentAttempts.tenantId, input.tenantId),
          eq(paymentAttempts.integrationAccountId, input.integrationAccountId),
          eq(paymentAttempts.id, input.paymentAttemptId),
        ),
      )
      .returning();
    return updated ?? null;
  }

  async persistEvent(input: {
    tenantId: string;
    providerEventId: string;
    topic: string;
    correlationId: string;
    payload: Record<string, unknown>;
    status?: typeof webhookEvents.$inferSelect.status;
  }) {
    const [event] = await this.transaction
      .insert(webhookEvents)
      .values({
        ...input,
        provider: "mercadopago",
        signatureValid: true,
        status: input.status ?? "received",
      })
      .onConflictDoNothing()
      .returning();
    return event ?? null;
  }
}
