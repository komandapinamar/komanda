import "server-only";

import { and, count, eq, inArray } from "drizzle-orm";
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

  async list(): Promise<MembershipWithUser[]> {
    const rows = await this.transaction
      .select({
        id: tenantMemberships.id,
        userId: tenantMemberships.userId,
        email: users.email,
        role: tenantMemberships.role,
        status: tenantMemberships.status,
        createdAt: tenantMemberships.createdAt,
      })
      .from(tenantMemberships)
      .innerJoin(users, eq(users.id, tenantMemberships.userId))
      .where(
        and(
          eq(tenantMemberships.tenantId, this.tenantId),
          inArray(tenantMemberships.status, ["active", "revoked"]),
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

  async findByUserId(userId: string): Promise<{ id: string } | null> {
    const [membership] = await this.transaction
      .select({ id: tenantMemberships.id })
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
    role: "owner" | "admin" | "employee";
  }): Promise<MemberOutput> {
    const [membership] = await this.transaction
      .insert(tenantMemberships)
      .values({
        tenantId: this.tenantId,
        userId: input.userId,
        role: input.role,
        status: "active",
      })
      .returning();
    const [user] = await this.transaction
      .select({ email: users.email })
      .from(users)
      .where(eq(users.id, input.userId))
      .limit(1);
    return {
      id: membership.id,
      email: user!.email,
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

  async revoke(membershipId: string): Promise<void> {
    await this.transaction
      .update(tenantMemberships)
      .set({ status: "revoked" })
      .where(
        and(
          eq(tenantMemberships.tenantId, this.tenantId),
          eq(tenantMemberships.id, membershipId),
        ),
      );
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
