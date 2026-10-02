import "server-only";

import { and, count, eq, notExists } from "drizzle-orm";
import { tenantMemberships, users } from "@/db/schema";
import type { TenantTransaction } from "@/db/tenant-transaction";
import type { MemberOutput } from "@/features/members/domain/member.schemas";

export type MembershipWithUser = {
  id: string;
  userId: string;
  email: string;
  role: "owner" | "admin" | "employee";
  status: "active" | "revoked";
  createdAt: Date;
};

export class MemberRepository {
  constructor(
    private readonly transaction: TenantTransaction,
    private readonly tenantId: string,
  ) {}

  async listRawMemberships() {
    const rows = await this.transaction
      .select({
        id: tenantMemberships.id,
        userId: tenantMemberships.userId,
        role: tenantMemberships.role,
        status: tenantMemberships.status,
        createdAt: tenantMemberships.createdAt,
      })
      .from(tenantMemberships)
      .where(
        and(
          eq(tenantMemberships.tenantId, this.tenantId),
          eq(tenantMemberships.status, "active"),
        ),
      );
    return rows;
  }

  async findByUserEmail(email: string): Promise<{ id: string } | null> {
    const [user] = await this.transaction
      .select({ id: users.id })
      .from(users)
      .where(eq(users.normalizedEmail, email.trim().toLowerCase()))
      .limit(1);
    return user ?? null;
  }

  async findIdentityByNormalizedEmail(
    normalizedEmail: string,
  ): Promise<{ id: string; email: string; status: string } | null> {
    const [identity] = await this.transaction
      .select({
        id: users.id,
        email: users.email,
        status: users.status,
      })
      .from(users)
      .where(eq(users.normalizedEmail, normalizedEmail))
      .limit(1);
    return identity ?? null;
  }

  async createIdentity(input: {
    id: string;
    email: string;
    normalizedEmail: string;
    passwordHash: string;
  }): Promise<void> {
    await this.transaction.insert(users).values({
      id: input.id,
      email: input.email,
      normalizedEmail: input.normalizedEmail,
      passwordHash: input.passwordHash,
      // Only a bcrypt digest is persisted. Komanda has no password recovery
      // flow that needs a retrievable secret, so a plaintext column must never
      // be reintroduced here.
      status: "active",
    });
  }

  async findByUserId(userId: string): Promise<{ id: string; status: string } | null> {
    const [membership] = await this.transaction
      .select({ id: tenantMemberships.id, status: tenantMemberships.status })
      .from(tenantMemberships)
      .where(
        and(
          eq(tenantMemberships.tenantId, this.tenantId),
          eq(tenantMemberships.userId, userId),
        ),
      )
      .limit(1);
    return membership ?? null;
  }

  async create(input: {
    userId: string;
    email: string;
    role: "owner" | "admin" | "employee";
  }): Promise<MemberOutput> {
    const [existing] = await this.transaction
      .select()
      .from(tenantMemberships)
      .where(
        and(
          eq(tenantMemberships.tenantId, this.tenantId),
          eq(tenantMemberships.userId, input.userId),
        ),
      )
      .limit(1);

    if (existing) {
      const [updated] = await this.transaction
        .update(tenantMemberships)
        .set({
          role: input.role,
          status: "active",
          updatedAt: new Date(),
        })
        .where(eq(tenantMemberships.id, existing.id))
        .returning();

      return {
        id: updated.id,
        email: input.email,
        role: updated.role,
        status: updated.status,
        createdAt: updated.createdAt,
      };
    }

    const [membership] = await this.transaction
      .insert(tenantMemberships)
      .values({
        tenantId: this.tenantId,
        userId: input.userId,
        role: input.role,
        status: "active",
      })
      .returning();

    return {
      id: membership.id,
      email: input.email,
      role: membership.role,
      status: membership.status,
      createdAt: membership.createdAt,
    };
  }

  async updateRole(
    membershipId: string,
    role: "owner" | "admin" | "employee",
  ): Promise<void> {
    await this.transaction
      .update(tenantMemberships)
      .set({ role })
      .where(
        and(
          eq(tenantMemberships.tenantId, this.tenantId),
          eq(tenantMemberships.id, membershipId),
        ),
      );
  }

  async delete(membershipId: string): Promise<void> {
    await this.transaction
      .delete(tenantMemberships)
      .where(
        and(
          eq(tenantMemberships.tenantId, this.tenantId),
          eq(tenantMemberships.id, membershipId),
        ),
      );
  }

  async deleteUserIfUnassigned(userId: string): Promise<void> {
    await this.transaction
      .delete(users)
      .where(
        and(
          eq(users.id, userId),
          notExists(
            this.transaction
              .select({ userId: tenantMemberships.userId })
              .from(tenantMemberships)
              .where(eq(tenantMemberships.userId, userId)),
          ),
        ),
      );
  }

  async revoke(membershipId: string): Promise<void> {
    return this.delete(membershipId);
  }

  async countActiveOwners(): Promise<number> {
    const [result] = await this.transaction
      .select({ count: count() })
      .from(tenantMemberships)
      .where(
        and(
          eq(tenantMemberships.tenantId, this.tenantId),
          eq(tenantMemberships.role, "owner"),
          eq(tenantMemberships.status, "active"),
        ),
      );
    return result.count;
  }

  async findMembership(
    membershipId: string,
  ): Promise<{ userId: string; role: string } | null> {
    const [membership] = await this.transaction
      .select({
        userId: tenantMemberships.userId,
        role: tenantMemberships.role,
      })
      .from(tenantMemberships)
      .where(
        and(
          eq(tenantMemberships.tenantId, this.tenantId),
          eq(tenantMemberships.id, membershipId),
        ),
      )
      .limit(1);
    return membership ?? null;
  }
}
