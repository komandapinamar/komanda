import "server-only";

import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { tenantMemberships, tenants, userSessions, users } from "@/db/schema";
import {
  withIdentityTransaction,
  withPlatformServiceTransaction,
} from "@/db/tenant-transaction";
import type {
  LiveMembership,
  SessionIdentity,
  SessionRepository,
} from "@/features/identity/application/session.service";

export class DatabaseSessionRepository implements SessionRepository {
  async findCredentialByEmail(normalizedEmail: string) {
    return withPlatformServiceTransaction(
      { serviceId: "identity-login", correlationId: randomUUID() },
      async (transaction) => {
        const [user] = await transaction
          .select()
          .from(users)
          .where(eq(users.normalizedEmail, normalizedEmail))
          .limit(1);
        return user
          ? {
              userId: user.id,
              email: user.email,
              passwordHash: user.passwordHash,
              status: user.status,
            }
          : null;
      },
    );
  }

  async insertSession(input: {
    userId: string;
    tokenDigest: string;
    expiresAt: Date;
    metadata: Record<string, unknown>;
  }) {
    return withIdentityTransaction(
      { userId: input.userId, correlationId: randomUUID() },
      async (transaction) => {
        const [session] = await transaction
          .insert(userSessions)
          .values(input)
          .returning({ id: userSessions.id });
        if (!session) throw new Error("Failed to create session.");
        return session;
      },
    );
  }

  async findSessionByDigest(tokenDigest: string): Promise<SessionIdentity | null> {
    return withIdentityTransaction(
      { sessionTokenDigest: tokenDigest, correlationId: randomUUID() },
      async (transaction) => {
        const [session] = await transaction
          .select()
          .from(userSessions)
          .where(eq(userSessions.tokenDigest, tokenDigest))
          .limit(1);
        if (!session) return null;
        await transaction.execute(
          sql`select set_config('app.user_id', ${session.userId}, true)`,
        );
        const [user] = await transaction
          .select()
          .from(users)
          .where(eq(users.id, session.userId))
          .limit(1);
        if (!user) return null;
        return {
          sessionId: session.id,
          userId: user.id,
          email: user.email,
          userStatus: user.status,
          expiresAt: session.expiresAt,
          revokedAt: session.revokedAt,
        };
      },
    );
  }

  async touchSession(sessionId: string, userId: string, seenAt: Date) {
    await withIdentityTransaction(
      { userId, correlationId: randomUUID() },
      async (transaction) => {
        await transaction
          .update(userSessions)
          .set({ lastSeenAt: seenAt })
          .where(
            and(eq(userSessions.id, sessionId), eq(userSessions.userId, userId)),
          );
      },
    );
  }

  async revokeSession(sessionId: string, userId: string, revokedAt: Date) {
    await withIdentityTransaction(
      { userId, correlationId: randomUUID() },
      async (transaction) => {
        await transaction
          .update(userSessions)
          .set({ revokedAt })
          .where(
            and(eq(userSessions.id, sessionId), eq(userSessions.userId, userId)),
          );
      },
    );
  }

  async findLiveMembership(userId: string, tenantId: string) {
    return withIdentityTransaction(
      { userId, tenantId, correlationId: randomUUID() },
      async (transaction): Promise<LiveMembership | null> => {
        const [membership] = await transaction
          .select()
          .from(tenantMemberships)
          .where(
            and(
              eq(tenantMemberships.userId, userId),
              eq(tenantMemberships.tenantId, tenantId),
            ),
          )
          .limit(1);
        const [tenant] = await transaction
          .select()
          .from(tenants)
          .where(eq(tenants.id, tenantId))
          .limit(1);
        return membership && tenant
          ? {
              id: membership.id,
              tenantId,
              role: membership.role,
              status: membership.status,
              tenantStatus: tenant.status,
              tenantName: tenant.name,
              tenantSlug: tenant.slug,
            }
          : null;
      },
    );
  }

  async listLiveMemberships(userId: string) {
    return withIdentityTransaction(
      { userId, correlationId: randomUUID() },
      async (transaction): Promise<LiveMembership[]> => {
        const rows = await transaction
          .select({ membership: tenantMemberships, tenant: tenants })
          .from(tenantMemberships)
          .innerJoin(tenants, eq(tenants.id, tenantMemberships.tenantId))
          .where(eq(tenantMemberships.userId, userId));
        return rows.map(({ membership, tenant }) => ({
          id: membership.id,
          tenantId: tenant.id,
          role: membership.role,
          status: membership.status,
          tenantStatus: tenant.status,
          tenantName: tenant.name,
          tenantSlug: tenant.slug,
        }));
      },
    );
  }
}
