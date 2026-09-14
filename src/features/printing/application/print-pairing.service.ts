import { createHash, randomInt, randomUUID, timingSafeEqual } from "node:crypto";
import { and, desc, eq, isNull, lte } from "drizzle-orm";
import { z } from "zod";
import { printAgentPairings, printAgents, tenantEntitlementSnapshots, tenantLocations, tenants } from "@/db/schema";
import { withPlatformServiceTransaction, withTenantTransaction } from "@/db/tenant-transaction";
import { IdempotencyService } from "@/lib/idempotency/idempotency.service";
import type { TenantContext } from "@/lib/tenant-context/types";
import { makePrintAgentToken } from "./print-agent.service";

const createSchema = z.object({ locationId: z.string().uuid() }).strict();
const claimSchema = z.object({ code: z.string().regex(/^\d{4}$/), name: z.string().trim().min(1).max(120) }).strict();
const digest = (code: string) => createHash("sha256").update(code, "utf8").digest("hex");
const sameDigest = (code: string, expected: string) => {
  const actual = Buffer.from(digest(code), "hex");
  const saved = Buffer.from(expected, "hex");
  return actual.length === saved.length && timingSafeEqual(actual, saved);
};

export class PrintPairingNotFoundError extends Error {}
export class PrintPairingEntitlementError extends Error {}

export class PrintPairingService {
  async create(context: TenantContext, body: unknown, idempotencyKey: string) {
    const input = createSchema.parse(body);
    return withTenantTransaction(context, async (tx) => {
      const idempotency = new IdempotencyService(tx);
      const claim = await idempotency.claim({ tenantId: context.tenantId, scope: "print-agent-pairing", key: idempotencyKey, request: input, retentionSeconds: 10 * 60 });
      if (claim.replayed) return claim.body;
      const [entitlement] = await tx.select({ entitlements: tenantEntitlementSnapshots.entitlements }).from(tenantEntitlementSnapshots).where(and(eq(tenantEntitlementSnapshots.tenantId, context.tenantId), isNull(tenantEntitlementSnapshots.supersededAt))).limit(1);
      if (entitlement?.entitlements.printing !== true) throw new PrintPairingEntitlementError("Printing is not enabled.");
      const [location] = await tx.select({ id: tenantLocations.id }).from(tenantLocations).where(and(eq(tenantLocations.tenantId, context.tenantId), eq(tenantLocations.id, input.locationId), eq(tenantLocations.status, "active"))).limit(1);
      if (!location) throw new PrintPairingNotFoundError("Location not found.");
      let pairing: { id: string; expiresAt: Date } | undefined;
      let code = "";
      for (let attempt = 0; attempt < 5 && !pairing; attempt++) {
        code = randomInt(0, 10000).toString().padStart(4, "0");
        const rows = await tx.insert(printAgentPairings).values({ tenantId: context.tenantId, locationId: input.locationId, codeDigest: digest(code), expiresAt: new Date(Date.now() + 10 * 60 * 1000) }).onConflictDoNothing({ target: printAgentPairings.codeDigest }).returning({ id: printAgentPairings.id, expiresAt: printAgentPairings.expiresAt });
        pairing = rows[0];
      }
      if (!pairing) throw new Error("Failed to create pairing.");
      const response = { pairingId: pairing.id, code, expiresAt: pairing.expiresAt.toISOString() };
      await idempotency.complete(claim.recordId, 201, response);
      return response;
    });
  }

  async status(context: TenantContext, pairingId: string) {
    return withTenantTransaction(context, async (tx) => {
      const id = z.string().uuid().parse(pairingId);
      await tx.update(printAgentPairings).set({ status: "expired", updatedAt: new Date() }).where(and(eq(printAgentPairings.id, id), eq(printAgentPairings.tenantId, context.tenantId), eq(printAgentPairings.status, "pending"), lte(printAgentPairings.expiresAt, new Date())));
      const [pairing] = await tx.select({ id: printAgentPairings.id, status: printAgentPairings.status, expiresAt: printAgentPairings.expiresAt, claimedAgentId: printAgentPairings.claimedAgentId }).from(printAgentPairings).where(and(eq(printAgentPairings.tenantId, context.tenantId), eq(printAgentPairings.id, id))).limit(1);
      if (!pairing) throw new PrintPairingNotFoundError("Pairing not found.");
      return { pairingId: pairing.id, status: pairing.status, expiresAt: pairing.expiresAt.toISOString(), agentId: pairing.claimedAgentId };
    });
  }

  async claim(body: unknown) {
    const input = claimSchema.parse(body);
    return withPlatformServiceTransaction({ serviceId: "print-pairing", correlationId: randomUUID() }, async (tx) => {
      const rows = await tx.select().from(printAgentPairings).where(eq(printAgentPairings.status, "pending")).orderBy(desc(printAgentPairings.createdAt)).for("update");
      const matching = rows.find((row) => sameDigest(input.code, row.codeDigest));
      const pairing = matching ?? rows[0];
      if (!pairing || pairing.expiresAt <= new Date() || pairing.attempts >= 5 || !matching) {
        if (pairing && pairing.expiresAt > new Date() && pairing.attempts < 5) await tx.update(printAgentPairings).set({ attempts: pairing.attempts + 1, status: pairing.attempts + 1 >= 5 ? "expired" : "pending", updatedAt: new Date() }).where(eq(printAgentPairings.id, pairing.id));
        throw new PrintPairingNotFoundError("Invalid pairing.");
      }
      const [entitlement] = await tx.select({ entitlements: tenantEntitlementSnapshots.entitlements }).from(tenantEntitlementSnapshots).where(and(eq(tenantEntitlementSnapshots.tenantId, pairing.tenantId), isNull(tenantEntitlementSnapshots.supersededAt))).limit(1);
      if (entitlement?.entitlements.printing !== true) throw new PrintPairingEntitlementError("Printing is not enabled.");
      const [tenant] = await tx.select({ id: tenants.id, name: tenants.name }).from(tenants).where(eq(tenants.id, pairing.tenantId)).limit(1);
      const [location] = await tx.select({ id: tenantLocations.id, name: tenantLocations.name }).from(tenantLocations).where(and(eq(tenantLocations.tenantId, pairing.tenantId), eq(tenantLocations.id, pairing.locationId), eq(tenantLocations.status, "active"))).limit(1);
      if (!tenant || !location) throw new PrintPairingNotFoundError("Invalid pairing.");
      const token = makePrintAgentToken();
      const [agent] = await tx.insert(printAgents).values({ tenantId: pairing.tenantId, locationId: pairing.locationId, name: input.name, tokenPrefix: token.prefix, tokenDigest: token.digest, status: "active" }).returning({ id: printAgents.id });
      if (!agent) throw new PrintPairingNotFoundError("Invalid pairing.");
      await tx.update(printAgentPairings).set({ status: "claimed", claimedAgentId: agent.id, updatedAt: new Date() }).where(and(eq(printAgentPairings.id, pairing.id), eq(printAgentPairings.status, "pending")));
      return { agentId: agent.id, tenantId: pairing.tenantId, locationId: pairing.locationId, tenantName: tenant.name, locationName: location.name, token: token.token };
    });
  }
}
