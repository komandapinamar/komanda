import { withTenantTransaction } from "@/db/tenant-transaction";
import { appendAuditEvent } from "@/lib/audit/audit.service";
import type { TenantContext } from "@/lib/tenant-context/types";
import {
  AddMemberSchema,
  ChangeRoleSchema,
  RevokeMemberSchema,
  type AddMemberInput,
  type ChangeRoleInput,
  type MemberOutput,
  type RevokeMemberInput,
} from "@/features/members/domain/member.schemas";
import { MemberRepository } from "@/features/members/infrastructure/member.repository";

export class UserNotFoundError extends Error {
  readonly code = "USER_NOT_FOUND";
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
    return withTenantTransaction(context, async (transaction) => {
      const repository = new MemberRepository(transaction, context.tenantId);
      const members = await repository.list();
      return members.map((m) => ({
        id: m.id,
        email: m.email,
        role: m.role,
        status: m.status,
        createdAt: m.createdAt,
      }));
    });
  }

  async addMember(
    context: TenantContext,
    input: AddMemberInput,
  ): Promise<MemberOutput> {
    const data = AddMemberSchema.parse(input);
    return withTenantTransaction(context, async (transaction) => {
      const repository = new MemberRepository(transaction, context.tenantId);
      const user = await repository.findByUserEmail(data.email);
      if (!user) {
        throw new UserNotFoundError("User not found");
      }
      const existing = await repository.findByUserId(user.id);
      if (existing) {
        throw new Error("User is already a member of this tenant");
      }
      const member = await repository.create({
        userId: user.id,
        role: data.role,
      });
      await appendAuditEvent(transaction, context, {
        action: MEMBERSHIP_AUDIT_EVENTS.CREATED,
        resourceType: "tenant_membership",
        resourceId: member.id,
        outcome: "allowed",
        metadata: { userEmail: data.email, role: data.role },
      });
      return member;
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

  async revokeMember(
    context: TenantContext,
    input: RevokeMemberInput,
  ): Promise<void> {
    const data = RevokeMemberSchema.parse(input);
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
            "Cannot revoke the last active owner",
          );
        }
      }
      await repository.revoke(data.membershipId);
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
}
