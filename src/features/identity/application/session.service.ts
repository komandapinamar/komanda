import { createHash, randomBytes } from "node:crypto";

const SESSION_TTL_MS = 8 * 60 * 60 * 1000;

export type SessionIdentity = {
  sessionId: string;
  userId: string;
  email: string;
  userStatus: "pending_verification" | "active" | "disabled";
  expiresAt: Date;
  revokedAt: Date | null;
};

export type LiveMembership = {
  id: string;
  tenantId: string;
  role: "owner";
  status: "active" | "revoked";
  tenantStatus: "onboarding" | "active" | "suspended";
  tenantName: string;
  tenantSlug: string;
};

export interface SessionRepository {
  findCredentialByEmail(normalizedEmail: string): Promise<{
    userId: string;
    email: string;
    passwordHash: string;
    status: SessionIdentity["userStatus"];
  } | null>;
  insertSession(input: {
    userId: string;
    tokenDigest: string;
    expiresAt: Date;
    metadata: Record<string, unknown>;
  }): Promise<{ id: string }>;
  findSessionByDigest(tokenDigest: string): Promise<SessionIdentity | null>;
  touchSession(sessionId: string, userId: string, seenAt: Date): Promise<void>;
  revokeSession(sessionId: string, userId: string, revokedAt: Date): Promise<void>;
  findLiveMembership(userId: string, tenantId: string): Promise<LiveMembership | null>;
  listLiveMemberships(userId: string): Promise<LiveMembership[]>;
}

export type PasswordVerifier = (
  password: string,
  passwordHash: string,
) => Promise<boolean>;

export class InvalidSessionError extends Error {}
export class InvalidCredentialsError extends Error {}
export class TenantAccessDeniedError extends Error {}

export function digestSessionToken(token: string) {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export class SessionService {
  constructor(
    private readonly repository: SessionRepository,
    private readonly verifyPassword: PasswordVerifier,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async create(input: {
    email: string;
    password: string;
    metadata?: Record<string, unknown>;
  }) {
    const credential = await this.repository.findCredentialByEmail(
      input.email.trim().toLowerCase(),
    );
    if (
      !credential ||
      credential.status !== "active" ||
      !(await this.verifyPassword(input.password, credential.passwordHash))
    ) {
      throw new InvalidCredentialsError("Invalid credentials.");
    }

    const token = randomBytes(32).toString("base64url");
    const expiresAt = new Date(this.now().getTime() + SESSION_TTL_MS);
    const session = await this.repository.insertSession({
      userId: credential.userId,
      tokenDigest: digestSessionToken(token),
      expiresAt,
      metadata: input.metadata ?? {},
    });
    return { token, sessionId: session.id, expiresAt };
  }

  async resolve(token: string) {
    if (!token) throw new InvalidSessionError("Invalid session.");
    const session = await this.repository.findSessionByDigest(
      digestSessionToken(token),
    );
    const now = this.now();
    if (
      !session ||
      session.revokedAt ||
      session.expiresAt <= now ||
      session.userStatus !== "active"
    ) {
      throw new InvalidSessionError("Invalid session.");
    }
    await this.repository.touchSession(session.sessionId, session.userId, now);
    return session;
  }

  async authorizeTenant(token: string, tenantId: string) {
    const session = await this.resolve(token);
    const membership = await this.repository.findLiveMembership(
      session.userId,
      tenantId,
    );
    if (
      !membership ||
      membership.status !== "active" ||
      membership.tenantStatus === "suspended"
    ) {
      throw new TenantAccessDeniedError("Tenant access is unavailable.");
    }
    return { session, membership };
  }

  async listTenants(token: string) {
    const session = await this.resolve(token);
    const memberships = await this.repository.listLiveMemberships(session.userId);
    return memberships.filter(
      (membership) =>
        membership.status === "active" &&
        membership.tenantStatus !== "suspended",
    );
  }

  async revoke(token: string) {
    const session = await this.resolve(token);
    await this.repository.revokeSession(
      session.sessionId,
      session.userId,
      this.now(),
    );
  }
}
