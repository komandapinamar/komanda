import "server-only";

import { createHash } from "node:crypto";
import { and, eq, gt, isNull, lt } from "drizzle-orm";
import { identityVerificationChallenges, users } from "@/db/schema";
import { withPlatformServiceTransaction } from "@/db/tenant-transaction";

export class InvalidVerificationChallengeError extends Error {}

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
