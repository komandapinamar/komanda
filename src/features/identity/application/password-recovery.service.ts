import "server-only";

import { createHash, randomBytes, randomUUID } from "node:crypto";
import bcrypt from "bcrypt";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { identityVerificationChallenges, users, userSessions } from "@/db/schema";
import { withPlatformServiceTransaction } from "@/db/tenant-transaction";
import { PasswordResetDelivery, passwordResetDeliveryFromEnvironment } from "@/features/identity/infrastructure/password-reset-delivery.port";

const PURPOSE = "password_reset";
const TTL_MS = 30 * 60 * 1000;
const RESEND_INTERVAL_MS = 10 * 60 * 1000;

function digest(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export class InvalidPasswordResetTokenError extends Error {}

export type { PasswordResetDelivery };

export class PasswordRecoveryService {
  constructor(
    private readonly deliver: PasswordResetDelivery = passwordResetDeliveryFromEnvironment(),
    private readonly now: () => Date = () => new Date(),
  ) {}

  async request(email: string) {
    const now = this.now();
    const token = randomBytes(32).toString("base64url");
    const recipient = await withPlatformServiceTransaction(
      { serviceId: "password_recovery", correlationId: randomUUID() },
      async (transaction) => {
        const [user] = await transaction.select().from(users)
          .where(eq(users.normalizedEmail, email.trim().toLowerCase())).limit(1);
        if (!user || user.status !== "active") return null;

        const [existing] = await transaction.select().from(identityVerificationChallenges)
          .where(and(
            eq(identityVerificationChallenges.userId, user.id),
            eq(identityVerificationChallenges.purpose, PURPOSE),
            isNull(identityVerificationChallenges.consumedAt),
          )).limit(1);
        if (existing && existing.createdAt.getTime() > now.getTime() - RESEND_INTERVAL_MS) return null;

        await transaction.update(identityVerificationChallenges).set({ consumedAt: now })
          .where(and(
            eq(identityVerificationChallenges.userId, user.id),
            eq(identityVerificationChallenges.purpose, PURPOSE),
            isNull(identityVerificationChallenges.consumedAt),
          ));
        await transaction.insert(identityVerificationChallenges).values({
          userId: user.id,
          purpose: PURPOSE,
          tokenDigest: digest(token),
          expiresAt: new Date(now.getTime() + TTL_MS),
        });
        return user.email;
      },
    );
    if (recipient) await this.deliver(recipient, token);
  }

  async reset(token: string, password: string) {
    const passwordHash = await bcrypt.hash(password, 12);
    const now = this.now();
    await withPlatformServiceTransaction(
      { serviceId: "password_recovery", correlationId: randomUUID() },
      async (transaction) => {
        const [challenge] = await transaction.select().from(identityVerificationChallenges)
          .where(and(
            eq(identityVerificationChallenges.tokenDigest, digest(token)),
            eq(identityVerificationChallenges.purpose, PURPOSE),
            isNull(identityVerificationChallenges.consumedAt),
            gt(identityVerificationChallenges.expiresAt, now),
          )).limit(1);
        if (!challenge) throw new InvalidPasswordResetTokenError();

        // Sessions use user-scoped RLS even for service calls. Set the verified
        // challenge owner as the actor for the remainder of this transaction.
        await transaction.execute(sql`select set_config('app.user_id', ${challenge.userId}, true)`);

        const [consumed] = await transaction.update(identityVerificationChallenges)
          .set({ consumedAt: now })
          .where(and(
            eq(identityVerificationChallenges.id, challenge.id),
            isNull(identityVerificationChallenges.consumedAt),
            gt(identityVerificationChallenges.expiresAt, now),
          )).returning({ id: identityVerificationChallenges.id });
        if (!consumed) throw new InvalidPasswordResetTokenError();

        const [updated] = await transaction.update(users).set({ passwordHash, updatedAt: now })
          .where(and(eq(users.id, challenge.userId), eq(users.status, "active")))
          .returning({ id: users.id });
        if (!updated) throw new InvalidPasswordResetTokenError();

        await transaction.update(userSessions).set({ revokedAt: now })
          .where(and(eq(userSessions.userId, challenge.userId), isNull(userSessions.revokedAt)));
        await transaction.update(identityVerificationChallenges).set({ consumedAt: now })
          .where(and(eq(identityVerificationChallenges.userId, challenge.userId),
            eq(identityVerificationChallenges.purpose, PURPOSE),
            isNull(identityVerificationChallenges.consumedAt)));
      },
    );
  }
}
