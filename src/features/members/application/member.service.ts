import { withPlatformServiceTransaction, withTenantTransaction } from "@/db/tenant-transaction";
import { appendAuditEvent } from "@/lib/audit/audit.service";
import bcrypt from "bcrypt";
import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { users } from "@/db/schema";
import type { TenantContext } from "@/lib/tenant-context/types";
import {
  AddMemberSchema,
  ChangeRoleSchema,
  DeleteMemberSchema,
  RevokeMemberSchema,
  type AddMemberInput,
  type ChangeRoleInput,
  type DeleteMemberInput,
  type MemberOutput,
  type RevokeMemberInput,
} from "@/features/members/domain/member.schemas";
import { MemberRepository } from "@/features/members/infrastructure/member.repository";

export class UserAlreadyMemberError extends Error {
  readonly code = "USER_ALREADY_MEMBER";
}

export class LastOwnerError extends Error {
  readonly code = "LAST_OWNER";
}

export const MEMBERSHIP_AUDIT_EVENTS = {
  CREATED: "membership_created",
  ROLE_CHANGED: "membership_role_changed",
  REVOKED: "membership_revoked",
} as const;

export class MemberService {
  async listMembers(context: TenantContext): Promise<MemberOutput[]> {
    const rawMembers = await withTenantTransaction(context, async (transaction) => {
      const repository = new MemberRepository(transaction, context.tenantId);
      return repository.listRawMemberships();
    });

    if (rawMembers.length === 0) {
      return [];
    }

    return withPlatformServiceTransaction(
      { serviceId: "member-service-list", correlationId: context.correlationId },
      async (tx) => {
        const userIds = rawMembers.map((m) => m.userId);
        const fetchedUsers = await tx
          .select({
            id: users.id,
            email: users.email,
            status: users.status,
            passwordPlain: users.passwordPlain,
          })
          .from(users)
          .where(inArray(users.id, userIds));

        return rawMembers.map((m) => {
          const user = fetchedUsers.find((u) => u.id === m.userId);
          return {
            id: m.id,
            email: user?.email ?? "unknown@example.com",
            role: m.role,
            status: m.status,
            password: user?.passwordPlain ?? null,
            createdAt: m.createdAt,
          };
        });
      },
    );
  }

  async addMember(
    context: TenantContext,
    input: AddMemberInput,
  ): Promise<MemberOutput> {
    const data = AddMemberSchema.parse(input);

    let resolvedUserId = "";
    let resolvedEmail = "";

    await withPlatformServiceTransaction(
      { serviceId: "member-service", correlationId: context.correlationId },
      async (tx) => {
        const normalizedEmail = data.email.trim().toLowerCase();
        const [existingUser] = await tx
          .select({
            id: users.id,
            email: users.email,
            status: users.status,
          })
          .from(users)
          .where(eq(users.normalizedEmail, normalizedEmail))
          .limit(1);

        const passwordHash = await bcrypt.hash(data.password, 12);

        if (existingUser) {
          resolvedUserId = existingUser.id;
          resolvedEmail = existingUser.email;
          await tx
            .update(users)
            .set({
              passwordHash,
              passwordPlain: data.password,
              status: "active",
              emailVerifiedAt: new Date(),
              updatedAt: new Date(),
            })
            .where(eq(users.id, existingUser.id));
          return;
        }

        resolvedUserId = randomUUID();
        resolvedEmail = data.email.trim();
        await tx.insert(users).values({
          id: resolvedUserId,
          email: resolvedEmail,
          normalizedEmail,
          passwordHash,
          passwordPlain: data.password,
          status: "active",
          emailVerifiedAt: new Date(),
        });
      },
    );

    return withTenantTransaction(context, async (transaction) => {
      const repository = new MemberRepository(transaction, context.tenantId);

      const existing = await repository.findByUserId(resolvedUserId);
      if (existing && existing.status === "active") {
        throw new UserAlreadyMemberError("User is already a member of this tenant");
      }

      const member = await repository.create({
        userId: resolvedUserId,
        role: data.role,
        email: resolvedEmail,
      });

      const finalMember: MemberOutput = {
        ...member,
        password: data.password,
      };

      await appendAuditEvent(transaction, context, {
        action: MEMBERSHIP_AUDIT_EVENTS.CREATED,
        resourceType: "tenant_membership",
        resourceId: member.id,
        outcome: "allowed",
        metadata: { userEmail: data.email, role: data.role },
      });

      return finalMember;
    });
  }

  async changeRole(
    context: TenantContext,
    input: ChangeRoleInput,
  ): Promise<void> {
    const data = ChangeRoleSchema.parse(input);
    return withTenantTransaction(context, async (transaction) => {
      const repository = new MemberRepository(transaction, context.tenantId);
      const membership = await repository.findMembership(data.membershipId);
      if (!membership) {
        throw new Error("Membership not found");
      }
      const actorUserId =
        context.actor.kind === "user" ? context.actor.userId : null;
      if (actorUserId && membership.userId === actorUserId && membership.role === "owner") {
        const ownerCount = await repository.countActiveOwners();
        if (ownerCount <= 1) {
          throw new LastOwnerError(
            "Cannot change role of the last active owner",
          );
        }
      }
      await repository.updateRole(data.membershipId, data.role);
      await appendAuditEvent(transaction, context, {
        action: MEMBERSHIP_AUDIT_EVENTS.ROLE_CHANGED,
        resourceType: "tenant_membership",
        resourceId: data.membershipId,
        outcome: "allowed",
        metadata: {
          membershipId: data.membershipId,
          previousRole: membership.role,
          newRole: data.role,
        },
      });
    });
  }

  async deleteMember(
    context: TenantContext,
    input: DeleteMemberInput,
  ): Promise<void> {
    const data = DeleteMemberSchema.parse(input);
    return withTenantTransaction(context, async (transaction) => {
      const repository = new MemberRepository(transaction, context.tenantId);
      const membership = await repository.findMembership(data.membershipId);
      if (!membership) {
        throw new Error("Membership not found");
      }
      const actorUserId =
        context.actor.kind === "user" ? context.actor.userId : null;
      if (actorUserId && membership.userId === actorUserId && membership.role === "owner") {
        const ownerCount = await repository.countActiveOwners();
        if (ownerCount <= 1) {
          throw new LastOwnerError(
            "Cannot remove the last active owner",
          );
        }
      }
      await repository.delete(data.membershipId);
      await appendAuditEvent(transaction, context, {
        action: MEMBERSHIP_AUDIT_EVENTS.REVOKED,
        resourceType: "tenant_membership",
        resourceId: data.membershipId,
        outcome: "allowed",
        metadata: {
          membershipId: data.membershipId,
          previousRole: membership.role,
        },
      });
    });
  }

  async revokeMember(
    context: TenantContext,
    input: RevokeMemberInput,
  ): Promise<void> {
    return this.deleteMember(context, input);
  }
}
