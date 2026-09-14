import bcrypt from "bcrypt";
import { randomBytes, randomUUID, createHash } from "crypto";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import {
  setTenantTransactionContext,
  withPlatformServiceTransaction,
} from "@/db/tenant-transaction";
import {
  tenants,
  tenantLocations,
  tenantMemberships,
  tenantSettings,
  tenantCounters,
  tenantEntitlementSnapshots,
  users,
  userSessions,
} from "@/db/schema";
import { normalizeTenantSlug } from "@/features/provisioning/domain/provisioning.schemas";
import { digestSessionToken } from "@/features/identity/application/session.service";

export class SlugAlreadyTakenError extends Error {
  constructor(message = "El enlace público del negocio ya está registrado. Probá con otro.") {
    super(message);
    this.name = "SlugAlreadyTakenError";
  }
}

export class EmailAlreadyTakenError extends Error {
  constructor(
    message = "Ya existe un usuario con este correo electrónico pero la contraseña no coincide. Iniciá sesión para vincular el negocio.",
  ) {
    super(message);
    this.name = "EmailAlreadyTakenError";
  }
}

export const publicRegistrationSchema = z
  .object({
    businessName: z
      .string()
      .trim()
      .min(2, "El nombre del negocio debe tener al menos 2 caracteres")
      .max(120, "El nombre no puede exceder 120 caracteres"),
    slug: z
      .string()
      .trim()
      .min(2, "El identificador debe tener al menos 2 caracteres")
      .max(80, "El identificador no puede exceder 80 caracteres")
      .regex(
        /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
        "El identificador solo puede contener letras minúsculas, números y guiones",
      ),
    preset: z.enum(["gastronomy", "express_retail"]).default("gastronomy"),
    email: z
      .string()
      .trim()
      .email("Ingresá un correo electrónico válido")
      .max(320),
    password: z
      .string()
      .min(8, "La contraseña debe tener al menos 8 caracteres")
      .max(128, "La contraseña no puede exceder 128 caracteres"),
  })
  .strict();

export type PublicRegistrationInput = z.infer<typeof publicRegistrationSchema>;

export type PublicRegistrationResult = {
  tenantId: string;
  name: string;
  slug: string;
  preset: "gastronomy" | "express_retail";
  userId: string;
  sessionToken: string;
  sessionExpiresAt: Date;
};

export class PublicRegistrationService {
  constructor(
    private readonly now: () => Date = () => new Date(),
    private readonly hashPassword: (password: string) => Promise<string> = (pwd) =>
      bcrypt.hash(pwd, 12),
    private readonly verifyPassword: (password: string, hash: string) => Promise<boolean> = (
      pwd,
      hash,
    ) => bcrypt.compare(pwd, hash),
  ) {}

  async register(
    rawInput: unknown,
    options?: { userAgent?: string | null; correlationId?: string },
  ): Promise<PublicRegistrationResult> {
    const input = publicRegistrationSchema.parse(rawInput);
    const normalizedSlug = normalizeTenantSlug(input.slug);
    const normalizedEmail = input.email.trim().toLowerCase();
    const now = this.now();
    const correlationId = options?.correlationId ?? randomUUID();

    return withPlatformServiceTransaction(
      { serviceId: "public_registration", correlationId },
      async (transaction) => {
        // 1. Check if slug is already used
        const existingSlug = await transaction
          .select({ id: tenants.id })
          .from(tenants)
          .where(eq(tenants.normalizedSlug, normalizedSlug))
          .limit(1);

        if (existingSlug.length > 0) {
          throw new SlugAlreadyTakenError();
        }

        // 2. Check if user already exists
        const [existingUser] = await transaction
          .select()
          .from(users)
          .where(eq(users.normalizedEmail, normalizedEmail))
          .limit(1);

        let userId: string;

        if (existingUser) {
          const passwordMatches = await this.verifyPassword(
            input.password,
            existingUser.passwordHash,
          );
          if (!passwordMatches) {
            throw new EmailAlreadyTakenError();
          }
          if (existingUser.status === "disabled") {
            throw new Error("La cuenta se encuentra deshabilitada.");
          }
          userId = existingUser.id;
        } else {
          userId = randomUUID();
          const passwordHash = await this.hashPassword(input.password);
          await transaction.insert(users).values({
            id: userId,
            email: input.email.trim(),
            normalizedEmail,
            passwordHash,
            status: "active",
            emailVerifiedAt: now,
          });
        }

        // 3. Create Tenant & Location
        const tenantId = randomUUID();
        const locationId = randomUUID();

        await setTenantTransactionContext(transaction, tenantId);

        await transaction.insert(tenants).values({
          id: tenantId,
          name: input.businessName,
          slug: input.slug,
          normalizedSlug,
          preset: input.preset,
          status: "onboarding",
          defaultCurrency: "ARS",
          defaultTimezone: "America/Argentina/Buenos_Aires",
        });

        await transaction.insert(tenantLocations).values({
          id: locationId,
          tenantId,
          name: "Local Principal",
          timezone: "America/Argentina/Buenos_Aires",
          status: "active",
          isPrimary: true,
        });

        // 4. Create Owner Membership
        await transaction.insert(tenantMemberships).values({
          tenantId,
          userId,
          role: "owner",
          status: "active",
        });

        // 5. Create Settings and Default Counters
        const orderPrefix =
          normalizedSlug
            .replace(/[^a-z0-9]/g, "")
            .slice(0, 8)
            .toUpperCase() || "K";

        await transaction.insert(tenantSettings).values({
          tenantId,
          contactName: input.businessName,
          contactEmail: input.email.trim(),
          salesEnabled: false,
          printingEnabled: false,
          orderPrefix,
        });

        await transaction.insert(tenantCounters).values({
          tenantId,
          counterType: "purchase_number",
          currentValue: BigInt(0),
        });

        await transaction.insert(tenantEntitlementSnapshots).values({
          tenantId,
          planId: "starter",
          planVersion: 1,
          entitlements: {
            catalog_management: true,
            online_payments: true,
            printing: true,
          },
          sourceRequestId: correlationId,
          effectiveAt: now,
        });

        // 6. Create Active Session Token
        const sessionToken = randomBytes(32).toString("base64url");
        const sessionExpiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // 7 days

        await transaction.insert(userSessions).values({
          userId,
          tokenDigest: digestSessionToken(sessionToken),
          expiresAt: sessionExpiresAt,
          metadata: {
            source: "public_registration",
            userAgent: options?.userAgent ?? null,
            initialTenantId: tenantId,
          },
        });

        return {
          tenantId,
          name: input.businessName,
          slug: input.slug,
          preset: input.preset,
          userId,
          sessionToken,
          sessionExpiresAt,
        };
      },
    );
  }
}
