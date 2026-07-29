import {
  createHash,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import {
  printAgents,
  tenantEntitlementSnapshots,
  tenantLocations,
} from "@/db/schema";
import {
  withPlatformServiceTransaction,
  withTenantTransaction,
} from "@/db/tenant-transaction";
import { IdempotencyService } from "@/lib/idempotency/idempotency.service";
import type { TenantContext } from "@/lib/tenant-context/types";

const enrollPrintAgentSchema = z
  .object({
    locationId: z.string().uuid(),
    name: z.string().trim().min(1).max(120),
  })
  .strict();

export class PrintAgentNotFoundError extends Error {}
export class PrintAgentEntitlementError extends Error {}
export class PrintAgentValidationError extends Error {}

export type ResolvedPrintAgent = {
  agentId: string;
  tenantId: string;
  locationId: string;
  status: "active" | "revoked";
};

function digestSecret(secret: string) {
  return createHash("sha256").update(secret, "utf8").digest("hex");
}

function constantTimeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left, "hex");
  const rightBuffer = Buffer.from(right, "hex");
  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}

function makeToken() {
  const prefix = randomBytes(8).toString("hex");
  const secret = randomBytes(32).toString("base64url");
  return {
    prefix,
    secret,
    token: `kp_${prefix}_${secret}`,
    digest: digestSecret(secret),
  };
}

function parseToken(token: string) {
  const match = /^kp_([a-f0-9]{16})_(.+)$/.exec(token.trim());
  if (!match) return null;
  return { prefix: match[1]!, secret: match[2]! };
}

export class PrintAgentService {
  async enroll(context: TenantContext, body: unknown, idempotencyKey: string) {
    const request = enrollPrintAgentSchema.parse(body);
    return withTenantTransaction(context, async (transaction) => {
      const [snapshot] = await transaction
        .select({ entitlements: tenantEntitlementSnapshots.entitlements })
        .from(tenantEntitlementSnapshots)
        .where(
          and(
            eq(tenantEntitlementSnapshots.tenantId, context.tenantId),
            isNull(tenantEntitlementSnapshots.supersededAt),
          ),
        )
        .limit(1);
      if (snapshot?.entitlements.printing !== true) {
        throw new PrintAgentEntitlementError("Printing is not enabled.");
      }

      const [location] = await transaction
        .select({ id: tenantLocations.id })
        .from(tenantLocations)
        .where(
          and(
            eq(tenantLocations.tenantId, context.tenantId),
            eq(tenantLocations.id, request.locationId),
            eq(tenantLocations.status, "active"),
          ),
        )
        .limit(1);
      if (!location) {
        throw new PrintAgentNotFoundError("Location not found.");
      }

      const idempotency = new IdempotencyService(transaction);
      const claim = await idempotency.claim({
        tenantId: context.tenantId,
        scope: "print-agent-enroll",
        key: idempotencyKey,
        request,
        retentionSeconds: 24 * 60 * 60,
      });
      if (claim.replayed) {
        return claim.body;
      }

      const token = makeToken();
      const [agent] = await transaction
        .insert(printAgents)
        .values({
          tenantId: context.tenantId,
          locationId: request.locationId,
          name: request.name,
          tokenPrefix: token.prefix,
          tokenDigest: token.digest,
          status: "active",
        })
        .returning({ id: printAgents.id });
      if (!agent) throw new Error("Failed to enroll print agent.");

      const response = {
        agentId: agent.id,
        tenantId: context.tenantId,
        locationId: request.locationId,
        token: token.token,
      };
      await idempotency.complete(claim.recordId, 201, response);
      return response;
    });
  }

  async resolveToken(token: string): Promise<ResolvedPrintAgent> {
    const parsed = parseToken(token);
    if (!parsed) {
      throw new PrintAgentNotFoundError("Invalid print agent token.");
    }

    return withPlatformServiceTransaction(
      { serviceId: "print-agent-auth", correlationId: randomUUID() },
      async (transaction) => {
        const [agent] = await transaction
          .select()
          .from(printAgents)
          .where(eq(printAgents.tokenPrefix, parsed.prefix))
          .limit(1);
        if (
          !agent ||
          agent.status !== "active" ||
          !constantTimeEqual(digestSecret(parsed.secret), agent.tokenDigest)
        ) {
          throw new PrintAgentNotFoundError("Invalid print agent token.");
        }
        return {
          agentId: agent.id,
          tenantId: agent.tenantId,
          locationId: agent.locationId,
          status: agent.status,
        };
      },
    );
  }

  async revoke(context: TenantContext, agentId: string) {
    const parsedAgentId = z.string().uuid().parse(agentId);
    return withTenantTransaction(context, async (transaction) => {
      const [agent] = await transaction
        .update(printAgents)
        .set({ status: "revoked", updatedAt: new Date() })
        .where(
          and(
            eq(printAgents.id, parsedAgentId),
            eq(printAgents.tenantId, context.tenantId),
            eq(printAgents.status, "active"),
          ),
        )
        .returning({ id: printAgents.id, status: printAgents.status });
      if (!agent) {
        throw new PrintAgentNotFoundError("Print agent not found.");
      }
      return agent;
    });
  }
}
