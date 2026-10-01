import {
  setTenantTransactionContext,
  withPlatformServiceTransaction,
  withTenantTransaction,
} from "@/db/tenant-transaction";
import { appendAuditEvent } from "@/lib/audit/audit.service";
import bcrypt from "bcrypt";
import { randomUUID } from "node:crypto";
import { inArray } from "drizzle-orm";
import { users } from "@/db/schema";
import type { TenantContext } from "@/lib/tenant-context/types";
import {
  AddMemberSchema,
  ChangeRoleSchema,
  DeleteMemberSchema,
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

const IDENTITY_CONSTRAINT = "users_normalized_email_uidx";
const MEMBERSHIP_CONSTRAINT = "tenant_memberships_tenant_user_key";

function isUniqueViolation(error: unknown, constraint: string): boolean {
  const databaseError = error as { code?: unknown; constraint?: unknown };
  return databaseError.code === "23505" && databaseError.constraint === constraint;
}

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
            createdAt: m.createdAt,
          };
        });
      },
    );
  }

  /**
   * Grants a membership without ever touching the identity behind it.
   *
   * A member invitation is a tenant-scoped fact. Credentials, identity status
   * and email verification belong to the global identity, so an owner of one
   * tenant must not be able to reset the password, reactivate or verify the
   * account of somebody who already exists in another tenant. When the email
   * already identifies somebody, only the membership is created and the
   * supplied password is discarded.
   */
  async addMember(
    context: TenantContext,
    input: AddMemberInput,
  ): Promise<MemberOutput> {
    const data = AddMemberSchema.parse(input);
    const normalizedEmail = data.email.trim().toLowerCase();

    // bcrypt at cost 12 is deliberately not run for an identity that already
    // exists: the supplied password is discarded on that path, and an eagerly
    // started promise that nobody awaits would also risk an unhandled rejection.
    let passwordHash: Promise<string> | undefined;
    const resolvePasswordHash = () => (passwordHash ??= bcrypt.hash(data.password, 12));

    return withPlatformServiceTransaction(
      { serviceId: "member-service", correlationId: context.correlationId },
      async (tx) => {
        // Both contexts are required: users_runtime_identity needs a service
        // identity, tenant_memberships_runtime_isolation needs the tenant.
        await setTenantTransactionContext(tx, context.tenantId);
        const repository = new MemberRepository(tx, context.tenantId);

        const existingIdentity = await repository.findIdentityByNormalizedEmail(
          normalizedEmail,
        );

        // Membership is checked before any write so a rejected invitation
        // leaves no trace at all.
        if (existingIdentity) {
          const existingMembership = await repository.findByUserId(
            existingIdentity.id,
          );
          if (existingMembership && existingMembership.status === "active") {
            throw new UserAlreadyMemberError(
              "User is already a member of this tenant",
            );
          }
        }

        let userId: string;
        let email: string;
        if (existingIdentity) {
          userId = existingIdentity.id;
          email = existingIdentity.email;
        } else {
          userId = randomUUID();
          email = data.email.trim();
          try {
            await repository.createIdentity({
              id: userId,
              email,
              normalizedEmail,
              passwordHash: await resolvePasswordHash(),
            });
          } catch (error) {
            // A concurrent request claimed the same email first. Re-reading the
            // identity inside this transaction keeps the outcome a single
            // membership instead of a lost write.
            if (!isUniqueViolation(error, IDENTITY_CONSTRAINT)) throw error;
            const claimed = await repository.findIdentityByNormalizedEmail(
              normalizedEmail,
            );
            if (!claimed) throw error;
            userId = claimed.id;
            email = claimed.email;
          }
        }

        let member: MemberOutput;
        try {
          member = await repository.create({
            userId,
            role: data.role,
            email,
          });
        } catch (error) {
          if (!isUniqueViolation(error, MEMBERSHIP_CONSTRAINT)) throw error;
          throw new UserAlreadyMemberError(
            "User is already a member of this tenant",
          );
        }

        await appendAuditEvent(tx, context, {
          action: MEMBERSHIP_AUDIT_EVENTS.CREATED,
          resourceType: "tenant_membership",
          resourceId: member.id,
          outcome: "allowed",
          metadata: {
            userEmail: data.email,
            role: data.role,
            // The identity predates this invitation, so the submitted password
            // was discarded. Recorded so a rotation worklist can be rebuilt.
            existingIdentity: Boolean(existingIdentity),
          },
        });

        return member;
      },
    );
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
    return withPlatformServiceTransaction(
      { serviceId: "member-service", correlationId: context.correlationId },
      async (transaction) => {
        await setTenantTransactionContext(transaction, context.tenantId);
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
        await repository.deleteUserIfUnassigned(membership.userId);
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
      },
    );
  }

  async revokeMember(
    context: TenantContext,
    input: RevokeMemberInput,
  ): Promise<void> {
    return this.deleteMember(context, input);
  }
}
