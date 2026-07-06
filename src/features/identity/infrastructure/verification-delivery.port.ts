export type VerificationDelivery = {
  deliver(input: {
    email: string;
    token: string;
    expiresAt: Date;
    tenantName: string;
  }): Promise<void>;
};

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

export function verificationDeliveryFromEnvironment(): VerificationDelivery {
  if (
    process.env.NODE_ENV === "production" ||
    process.env.IDENTITY_VERIFICATION_DELIVERY !== "capture"
  ) {
    throw new Error(
      "A production verification delivery adapter must be configured explicitly.",
    );
  }
  return new FileCaptureVerificationDelivery(
    process.env.IDENTITY_VERIFICATION_CAPTURE_PATH ??
      ".test-artifacts/verification.jsonl",
  );
}
