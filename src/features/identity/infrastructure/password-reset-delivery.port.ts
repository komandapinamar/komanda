import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { publicBaseUrl } from "@/lib/config/public-site";

export type PasswordResetDelivery = (input: {
  email: string;
  token: string;
}) => Promise<void>;

type PasswordResetMessage = Parameters<PasswordResetDelivery>[0];

function templatePath() {
  return resolve(process.cwd(), "src/features/identity/infrastructure/templates/password-reset.html");
}

function renderTemplate(url: string): string {
  return readFileSync(templatePath(), "utf8").replace(/\{\{url\}\}/g, url);
}

export class ResendPasswordResetDelivery implements PasswordResetDelivery {
  constructor(
    private readonly apiKey: string,
    private readonly publicBaseUrl: string,
    private readonly fromEmail: string = "invitations@komanda.com",
  ) {
    if (!apiKey || !publicBaseUrl) {
      throw new Error("Resend password reset delivery is not safely configured.");
    }
  }

  async deliver(input: PasswordResetMessage) {
    const url = new URL("/reset-password", this.publicBaseUrl);
    url.searchParams.set("token", input.token);

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: this.fromEmail,
        to: input.email,
        subject: "Restablecer tu contraseña de Komanda",
        html: renderTemplate(url.toString()),
      }),
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "Unknown error");
      throw new Error(`Resend password reset delivery failed: ${response.status} - ${errorText}`);
    }
  }
}

export class HttpPasswordResetDelivery implements PasswordResetDelivery {
  constructor(
    private readonly endpoint: string,
    private readonly token: string,
    private readonly publicBaseUrl: string,
  ) {
    if (!endpoint || !token || !publicBaseUrl) {
      throw new Error("HTTP password reset delivery is not safely configured.");
    }
  }

  async deliver(input: PasswordResetMessage) {
    const url = new URL("/reset-password", this.publicBaseUrl);
    url.searchParams.set("token", input.token);

    const response = await fetch(this.endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ...input, resetUrl: url.toString() }),
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error("HTTP password reset delivery failed.");
    }
  }
}

export class CapturePasswordResetDelivery implements PasswordResetDelivery {
  readonly messages: Array<{ email: string; token: string }> = [];

  async deliver(input: PasswordResetMessage) {
    this.messages.push(input);
  }
}

export class FileCapturePasswordResetDelivery implements PasswordResetDelivery {
  constructor(private readonly path: string) {}

  async deliver(input: PasswordResetMessage) {
    const { appendFile, mkdir } = await import("node:fs/promises");
    const { dirname } = await import("node:path");
    await mkdir(dirname(this.path), { recursive: true });
    await appendFile(
      this.path,
      `${JSON.stringify(input)}\n`,
      { encoding: "utf8", mode: 0o600 },
    );
  }
}

function deploymentEnvironment() {
  return process.env.KOMANDA_ENVIRONMENT ?? process.env.NODE_ENV ?? "development";
}

export function passwordResetDeliveryFromEnvironment(): PasswordResetDelivery {
  const delivery = process.env.IDENTITY_VERIFICATION_DELIVERY;

  if (delivery === "resend") {
    return new ResendPasswordResetDelivery(
      process.env.IDENTITY_VERIFICATION_RESEND_KEY ?? "",
      publicBaseUrl(),
      process.env.IDENTITY_VERIFICATION_FROM_EMAIL ?? "invitations@komanda.com",
    );
  }

  if (delivery === "http") {
    return new HttpPasswordResetDelivery(
      process.env.IDENTITY_VERIFICATION_HTTP_ENDPOINT ?? "",
      process.env.IDENTITY_VERIFICATION_HTTP_TOKEN ?? "",
      publicBaseUrl(),
    );
  }

  if (delivery === "capture" && deploymentEnvironment() === "staging") {
    return new FileCapturePasswordResetDelivery(
      process.env.IDENTITY_VERIFICATION_CAPTURE_PATH ??
        ".test-artifacts/password-reset.jsonl",
    );
  }

  if (delivery === "capture" && process.env.NODE_ENV !== "production") {
    return new FileCapturePasswordResetDelivery(
      process.env.IDENTITY_VERIFICATION_CAPTURE_PATH ??
        ".test-artifacts/password-reset.jsonl",
    );
  }

  throw new Error(
    "A production password reset delivery adapter must be configured explicitly.",
  );
}
