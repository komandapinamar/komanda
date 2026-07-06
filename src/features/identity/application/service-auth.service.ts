import { createHash, timingSafeEqual } from "node:crypto";

export class ServiceAuthenticationError extends Error {}

function digest(value: string) {
  return createHash("sha256").update(value, "utf8").digest();
}

function equalSecret(provided: string, expected: string) {
  return timingSafeEqual(digest(provided), digest(expected));
}

export class ServiceAuthService {
  constructor(
    private readonly serviceId: string,
    private readonly currentCredential: string,
    private readonly previousCredential?: string,
  ) {
    if (!serviceId || currentCredential.length < 32) {
      throw new Error("Service authentication is not safely configured.");
    }
  }

  authenticate(request: Request) {
    const authorization = request.headers.get("authorization")?.trim();
    if (!authorization?.startsWith("Bearer ")) {
      throw new ServiceAuthenticationError("Service authentication failed.");
    }
    const provided = authorization.slice("Bearer ".length).trim();
    const valid =
      provided.length > 0 &&
      (equalSecret(provided, this.currentCredential) ||
        Boolean(
          this.previousCredential &&
            equalSecret(provided, this.previousCredential),
        ));
    if (!valid) {
      throw new ServiceAuthenticationError("Service authentication failed.");
    }
    return { serviceId: this.serviceId };
  }
}

export function komandaBusinessServiceAuthFromEnvironment() {
  return new ServiceAuthService(
    "komanda-business",
    process.env.KOMANDA_BUSINESS_SERVICE_TOKEN ?? "",
    process.env.KOMANDA_BUSINESS_PREVIOUS_SERVICE_TOKEN,
  );
}
