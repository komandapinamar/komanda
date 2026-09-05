import "server-only";

import { and, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import {
  catalogItems,
  integrationAccounts,
  tenantEntitlementSnapshots,
  tenantLocations,
  tenantSettings,
  tenants,
  users,
} from "@/db/schema";
import {
  withTenantTransaction,
  type TenantTransaction,
} from "@/db/tenant-transaction";
import { IdempotencyService } from "@/lib/idempotency/idempotency.service";
import type { TenantContext } from "@/lib/tenant-context/types";

export class TenantSettingsNotFoundError extends Error {}
export class TenantSettingsConflictError extends Error {}
export class TenantActivationConflictError extends Error {}
export class TenantSettingsEntitlementDeniedError extends Error {}

const nullableTrimmedString = z.preprocess(
  (value) =>
    typeof value === "string" && value.trim().length === 0
      ? null
      : value,
  z.string().trim().nullable().optional(),
);

const settingsPatchSchema = z
  .object({
    contactName: nullableTrimmedString,
    contactEmail: z.preprocess(
      (value) =>
        typeof value === "string" && value.trim().length === 0
          ? null
          : value,
      z.string().trim().email().nullable().optional(),
    ),
    contactPhone: nullableTrimmedString,
    salesEnabled: z.boolean().optional(),
    printingEnabled: z.boolean().optional(),
    menuTheme: z.enum(["classic", "reels"]).optional(),
    timezone: z.string().trim().min(1).optional(),
  })
  .strict();

type SettingsPatch = z.infer<typeof settingsPatchSchema>;

function serializeSettings(input: {
  settings: typeof tenantSettings.$inferSelect;
  tenant: typeof tenants.$inferSelect;
}) {
  return {
    tenantId: input.settings.tenantId,
    contactName: input.settings.contactName,
    contactEmail: input.settings.contactEmail,
    contactPhone: input.settings.contactPhone,
    salesEnabled: input.settings.salesEnabled,
    printingEnabled: input.settings.printingEnabled,
    menuTheme: input.settings.menuTheme,
    currency: input.tenant.defaultCurrency,
    timezone: input.tenant.defaultTimezone,
    version: input.settings.version,
  };
}

function userIdFromContext(context: TenantContext) {
  return context.actor.kind === "user" ? context.actor.userId : null;
}

export class TenantSettingsService {
  get(context: TenantContext) {
    return withTenantTransaction(context, async (transaction) => {
      const [row] = await transaction
        .select({ settings: tenantSettings, tenant: tenants })
        .from(tenantSettings)
        .innerJoin(tenants, eq(tenants.id, tenantSettings.tenantId))
        .where(eq(tenantSettings.tenantId, context.tenantId))
        .limit(1);

      if (!row) throw new TenantSettingsNotFoundError("Tenant settings not found.");
      return serializeSettings(row);
    });
  }

  update(context: TenantContext, version: number, value: unknown) {
    const patch = settingsPatchSchema.parse(value);
    return withTenantTransaction(context, async (transaction) => {
      if (patch.printingEnabled === true) {
        const canPrint = await this.hasEntitlement(transaction, context.tenantId, "printing");
        if (!canPrint) {
          throw new TenantSettingsEntitlementDeniedError(
            "Printing is not available for this tenant.",
          );
        }
      }

      if (patch.salesEnabled === true) {
        const ready = await this.activationReady(transaction, context);
        if (!ready) {
          throw new TenantActivationConflictError(
            "Tenant is not ready for activation.",
          );
        }
      }

      if (patch.timezone) {
        await transaction
          .update(tenants)
          .set({
            defaultTimezone: patch.timezone,
            version: sql`${tenants.version} + 1`,
            updatedAt: new Date(),
          })
          .where(eq(tenants.id, context.tenantId));
      }

      const settingsUpdate = this.settingsUpdate(patch);
      const [updated] = await transaction
        .update(tenantSettings)
        .set({
          ...settingsUpdate,
          version: sql`${tenantSettings.version} + 1`,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(tenantSettings.tenantId, context.tenantId),
            eq(tenantSettings.version, version),
          ),
        )
        .returning();

      if (!updated) {
        throw new TenantSettingsConflictError("Tenant settings version conflict.");
      }

      const [tenant] = await transaction
        .select()
        .from(tenants)
        .where(eq(tenants.id, context.tenantId))
        .limit(1);

      if (!tenant) throw new TenantSettingsNotFoundError("Tenant not found.");
      return serializeSettings({ settings: updated, tenant });
    });
  }

  activate(context: TenantContext, idempotencyKey: string) {
    return withTenantTransaction(context, async (transaction) => {
      const idempotency = new IdempotencyService(transaction);
      const claim = await idempotency.claim({
        tenantId: context.tenantId,
        scope: "tenant-activation",
        key: idempotencyKey,
        request: { tenantId: context.tenantId },
      });
      if (claim.replayed) {
        return claim.body as {
          id: string;
          name: string;
          slug: string;
          status: "onboarding" | "active" | "suspended";
          role: "owner";
        };
      }
      if (!(await this.activationReady(transaction, context))) {
        throw new TenantActivationConflictError(
          "Tenant is not ready for activation.",
        );
      }

      const now = new Date();
      const [tenant] = await transaction
        .update(tenants)
        .set({
          status: "active",
          activatedAt: now,
          suspendedAt: null,
          version: sql`${tenants.version} + 1`,
          updatedAt: now,
        })
        .where(eq(tenants.id, context.tenantId))
        .returning();

      if (!tenant) throw new TenantSettingsNotFoundError("Tenant not found.");

      await transaction
        .update(tenantSettings)
        .set({
          salesEnabled: true,
          version: sql`${tenantSettings.version} + 1`,
          updatedAt: now,
        })
        .where(eq(tenantSettings.tenantId, context.tenantId));

      const response = {
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
        status: tenant.status,
        role: "owner" as const,
      };
      await idempotency.complete(claim.recordId, 200, response);
      return response;
    });
  }

  private settingsUpdate(patch: SettingsPatch) {
    return {
      ...(patch.contactName !== undefined ? { contactName: patch.contactName } : {}),
      ...(patch.contactEmail !== undefined
        ? { contactEmail: patch.contactEmail }
        : {}),
      ...(patch.contactPhone !== undefined
        ? { contactPhone: patch.contactPhone }
        : {}),
      ...(patch.salesEnabled !== undefined
        ? { salesEnabled: patch.salesEnabled }
        : {}),
      ...(patch.printingEnabled !== undefined
        ? { printingEnabled: patch.printingEnabled }
        : {}),
      ...(patch.menuTheme !== undefined ? { menuTheme: patch.menuTheme } : {}),
    };
  }

  private async hasEntitlement(
    transaction: TenantTransaction,
    tenantId: string,
    flag: "online_payments" | "printing",
  ) {
    const [snapshot] = await transaction
      .select({ entitlements: tenantEntitlementSnapshots.entitlements })
      .from(tenantEntitlementSnapshots)
      .where(
        and(
          eq(tenantEntitlementSnapshots.tenantId, tenantId),
          isNull(tenantEntitlementSnapshots.supersededAt),
        ),
      )
      .limit(1);

    return snapshot?.entitlements[flag] === true;
  }

  private async activationReady(
    transaction: TenantTransaction,
    context: TenantContext,
  ) {
    const [tenant] = await transaction
      .select()
      .from(tenants)
      .where(eq(tenants.id, context.tenantId))
      .limit(1);
    const [location] = await transaction
      .select({ id: tenantLocations.id })
      .from(tenantLocations)
      .where(
        and(
          eq(tenantLocations.tenantId, context.tenantId),
          eq(tenantLocations.isPrimary, true),
          eq(tenantLocations.status, "active"),
        ),
      )
      .limit(1);
    const [publishedItem] = await transaction
      .select({ id: catalogItems.id })
      .from(catalogItems)
      .where(
        and(
          eq(catalogItems.tenantId, context.tenantId),
          eq(catalogItems.status, "active"),
        ),
      )
      .limit(1);
    const [paymentIntegration] = await transaction
      .select({ id: integrationAccounts.id })
      .from(integrationAccounts)
      .where(
        and(
          eq(integrationAccounts.tenantId, context.tenantId),
          eq(integrationAccounts.provider, "mercadopago"),
          eq(integrationAccounts.status, "active"),
        ),
      )
      .limit(1);
    const userId = userIdFromContext(context);
    const [actor] = userId
      ? await transaction
          .select({ status: users.status })
          .from(users)
          .where(eq(users.id, userId))
          .limit(1)
      : [];

    return Boolean(
      tenant &&
        tenant.normalizedSlug &&
        tenant.defaultCurrency.length === 3 &&
        location &&
        publishedItem &&
        paymentIntegration &&
        actor?.status === "active",
    );
  }
}
