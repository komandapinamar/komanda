export type VerificationDelivery = {
  deliver(input: {
    email: string;
    token: string;
    expiresAt: Date;
    tenantName: string;
  }): Promise<void>;
};

type VerificationMessage = Parameters<VerificationDelivery["deliver"]>[0];

export class CaptureVerificationDelivery implements VerificationDelivery {
  readonly messages: Array<{
    email: string;
    token: string;
    expiresAt: Date;
    tenantName: string;
  }> = [];

  async deliver(input: {
    email: string;
    token: string;
    expiresAt: Date;
    tenantName: string;
  }) {
    this.messages.push(input);
  }
}

export class FileCaptureVerificationDelivery implements VerificationDelivery {
  constructor(private readonly path: string) {}

  async deliver(input: {
    email: string;
    token: string;
    expiresAt: Date;
    tenantName: string;
  }) {
    const { appendFile, mkdir } = await import("node:fs/promises");
    const { dirname } = await import("node:path");
    await mkdir(dirname(this.path), { recursive: true });
    await appendFile(
      this.path,
      `${JSON.stringify({ ...input, expiresAt: input.expiresAt.toISOString() })}\n`,
      { encoding: "utf8", mode: 0o600 },
    );
  }
}

export class HttpVerificationDelivery implements VerificationDelivery {
  constructor(
    private readonly endpoint: string,
    private readonly token: string,
    private readonly publicBaseUrl: string,
  ) {
    if (!endpoint || !token || !publicBaseUrl) {
      throw new Error("HTTP verification delivery is not safely configured.");
    }
  }

  async deliver(input: VerificationMessage) {
    const verificationUrl = new URL(
      "/api/v1/auth/email-verifications/confirm",
      this.publicBaseUrl,
    ).toString();
    const response = await fetch(this.endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ...input,
        expiresAt: input.expiresAt.toISOString(),
        verificationUrl,
      }),
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    });
    if (!response.ok) {
      throw new Error("HTTP verification delivery failed.");
    }
  }
}

function deploymentEnvironment() {
  return process.env.KOMANDA_ENVIRONMENT ?? process.env.NODE_ENV ?? "development";
}

export function verificationDeliveryFromEnvironment(): VerificationDelivery {
  const delivery = process.env.IDENTITY_VERIFICATION_DELIVERY;
  if (delivery === "http") {
    return new HttpVerificationDelivery(
      process.env.IDENTITY_VERIFICATION_HTTP_ENDPOINT ?? "",
      process.env.IDENTITY_VERIFICATION_HTTP_TOKEN ?? "",
      process.env.KOMANDA_PUBLIC_BASE_URL ?? "",
    );
  }

  if (delivery === "capture" && deploymentEnvironment() === "staging") {
    return new FileCaptureVerificationDelivery(
      process.env.IDENTITY_VERIFICATION_CAPTURE_PATH ??
        ".test-artifacts/verification.jsonl",
    );
  }

  if (delivery === "capture" && process.env.NODE_ENV !== "production") {
    return new FileCaptureVerificationDelivery(
      process.env.IDENTITY_VERIFICATION_CAPTURE_PATH ??
        ".test-artifacts/verification.jsonl",
    );
  }

  throw new Error(
    "A production verification delivery adapter must be configured explicitly.",
  );
}
