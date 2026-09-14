import "server-only";

import { createHash, randomBytes, randomUUID } from "node:crypto";
import { and, eq, gt, isNull, lt, sql } from "drizzle-orm";
import {
  identityVerificationChallenges,
  onboardingHandoffs,
  tenantMemberships,
  userSessions,
  users,
} from "@/db/schema";
import {
  withIdentityTransaction,
  withPlatformServiceTransaction,
} from "@/db/tenant-transaction";
import { digestSessionToken } from "@/features/identity/application/session.service";

export class InvalidVerificationChallengeError extends Error {}
export class InvalidOnboardingHandoffError extends Error {}

export function digestVerificationToken(token: string) {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export class IdentityVerificationService {
  constructor(private readonly now: () => Date = () => new Date()) {}

  async confirm(token: string, correlationId: string) {
    const tokenDigest = digestVerificationToken(token);
    const now = this.now();
    return withPlatformServiceTransaction(
      { serviceId: "identity-verification", correlationId },
      async (transaction) => {
        const [challenge] = await transaction
          .select()
          .from(identityVerificationChallenges)
          .where(
            and(
              eq(identityVerificationChallenges.tokenDigest, tokenDigest),
              isNull(identityVerificationChallenges.consumedAt),
              gt(identityVerificationChallenges.expiresAt, now),
              lt(identityVerificationChallenges.attemptCount, 10),
            ),
          )
          .limit(1);
        if (!challenge) {
          throw new InvalidVerificationChallengeError(
            "Verification challenge is invalid or expired.",
          );
        }
        const consumed = await transaction
          .update(identityVerificationChallenges)
          .set({ consumedAt: now })
          .where(
            and(
              eq(identityVerificationChallenges.id, challenge.id),
              isNull(identityVerificationChallenges.consumedAt),
            ),
          )
          .returning({ userId: identityVerificationChallenges.userId });
        if (!consumed[0]) {
          throw new InvalidVerificationChallengeError(
            "Verification challenge is invalid or expired.",
          );
        }
        await transaction
          .update(users)
          .set({ status: "active", emailVerifiedAt: now, updatedAt: now })
          .where(eq(users.id, challenge.userId));
        return { userId: challenge.userId };
      },
    );
  }
}

export class OnboardingHandoffService {
  constructor(private readonly now: () => Date = () => new Date()) {}

  async consume(input: {
    tenantId: string;
    token: string;
    metadata?: Record<string, unknown>;
  }) {
    const tokenDigest = digestVerificationToken(input.token);
    const now = this.now();
    return withIdentityTransaction(
      { tenantId: input.tenantId, correlationId: randomUUID() },
      async (transaction) => {
        const [handoff] = await transaction
          .select()
          .from(onboardingHandoffs)
          .where(
            and(
              eq(onboardingHandoffs.tenantId, input.tenantId),
              eq(onboardingHandoffs.tokenDigest, tokenDigest),
              isNull(onboardingHandoffs.consumedAt),
              gt(onboardingHandoffs.expiresAt, now),
            ),
          )
          .limit(1);
        if (!handoff) {
          throw new InvalidOnboardingHandoffError(
            "Onboarding handoff is invalid or expired.",
          );
        }

        await transaction.execute(
          sql`select set_config('app.user_id', ${handoff.userId}, true)`,
        );
        const [user] = await transaction
          .select({ status: users.status })
          .from(users)
          .where(eq(users.id, handoff.userId))
          .limit(1);
        const [membership] = await transaction
          .select({ status: tenantMemberships.status })
          .from(tenantMemberships)
          .where(
            and(
              eq(tenantMemberships.tenantId, input.tenantId),
              eq(tenantMemberships.userId, handoff.userId),
            ),
          )
          .limit(1);
        if (user?.status !== "active" || membership?.status !== "active") {
          throw new InvalidOnboardingHandoffError(
            "Onboarding handoff is not authorized.",
          );
        }

        const consumed = await transaction
          .update(onboardingHandoffs)
          .set({ consumedAt: now })
          .where(
            and(
              eq(onboardingHandoffs.id, handoff.id),
              isNull(onboardingHandoffs.consumedAt),
            ),
          )
          .returning({ id: onboardingHandoffs.id });
        if (!consumed[0]) {
          throw new InvalidOnboardingHandoffError(
            "Onboarding handoff is invalid or expired.",
          );
        }

        const sessionToken = randomBytes(32).toString("base64url");
        const expiresAt = new Date(now.getTime() + 8 * 60 * 60 * 1000);
        await transaction.insert(userSessions).values({
          userId: handoff.userId,
          tokenDigest: digestSessionToken(sessionToken),
          expiresAt,
          metadata: input.metadata ?? {},
        });
        return { token: sessionToken, expiresAt, tenantId: input.tenantId };
      },
    );
  }
}
