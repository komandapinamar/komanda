import { z } from "zod";

export const operationalEntitlementsSchema = z
  .object({
    catalog_management: z.boolean(),
    online_payments: z.boolean(),
    printing: z.boolean(),
  })
  .strict();

export const provisionTenantRequestSchema = z
  .object({
    planId: z.string().regex(/^[a-z0-9][a-z0-9._-]{1,63}$/),
    owner: z
      .object({
        email: z.email().max(320),
        password: z.string().min(8).max(128),
      })
      .strict(),
    tenant: z
      .object({
        name: z.string().trim().min(1).max(120),
        slug: z.string().trim().min(2).max(80),
        currency: z.string().regex(/^[A-Z]{3}$/),
        timezone: z.string().trim().min(1).max(100),
      })
      .strict(),
    primaryLocation: z
      .object({ name: z.string().trim().min(1).max(120) })
      .strict(),
  })
  .strict();

export const emailVerificationConfirmSchema = z
  .object({ token: z.string().min(32).max(512) })
  .strict();

export const onboardingHandoffSchema = z
  .object({
    token: z.string().min(32),
    expiresAt: z.iso.datetime(),
  })
  .strict();

export const provisionTenantResponseSchema = z
  .object({
    tenant: z.object({
      id: z.uuid(),
      name: z.string(),
      slug: z.string(),
      status: z.literal("onboarding"),
      role: z.literal("owner"),
    }),
    membership: z.object({ role: z.literal("owner") }),
    primaryLocation: z.object({
      id: z.uuid(),
      name: z.string(),
      timezone: z.string(),
      status: z.literal("active"),
    }),
    entitlementSnapshot: z.object({
      planId: z.string(),
      planVersion: z.number().int().positive(),
      entitlements: z
        .object({
          catalogManagement: z.boolean(),
          onlinePayments: z.boolean(),
          printing: z.boolean(),
        })
        .strict(),
      effectiveAt: z.iso.datetime(),
    }),
    ownerVerification: z.discriminatedUnion("status", [
      z.object({
        status: z.literal("pending_verification"),
        expiresAt: z.iso.datetime(),
      }),
      z.object({ status: z.literal("verified"), expiresAt: z.null() }),
    ]),
    readiness: z.object({
      ready: z.literal(false),
      checks: z.array(
        z.object({
          code: z.string(),
          complete: z.boolean(),
          requiredForActivation: z.boolean(),
        }),
      ),
    }),
    onboardingHandoff: onboardingHandoffSchema,
  })
  .strict();

export type ProvisionTenantRequest = z.infer<
  typeof provisionTenantRequestSchema
>;
export type ProvisionTenantResponse = z.infer<
  typeof provisionTenantResponseSchema
>;

export function normalizeTenantSlug(value: string) {
  const normalized = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(normalized)) {
    throw new Error("Tenant slug is invalid after normalization.");
  }
  return normalized;
}
