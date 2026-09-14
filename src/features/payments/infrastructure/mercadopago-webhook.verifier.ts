import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

export class InvalidMercadoPagoWebhookError extends Error {}

const payloadSchema = z
  .object({
    id: z.union([z.string(), z.number()]).optional(),
    type: z.string().optional(),
    action: z.string().optional(),
    data: z.object({ id: z.union([z.string(), z.number()]) }).passthrough(),
  })
  .passthrough();

export function verifyMercadoPagoWebhook(input: {
  signature: string;
  requestId: string;
  dataId: string;
  secret: string;
}) {
  const parts = Object.fromEntries(
    input.signature.split(",").map((part) => {
      const [key, value] = part.trim().split("=");
      return [key, value];
    }),
  );
  const timestamp = parts.ts;
  const received = parts.v1;
  if (!timestamp || !received || !/^[a-f0-9]{64}$/i.test(received)) {
    throw new InvalidMercadoPagoWebhookError("Invalid webhook signature.");
  }
  const manifest = `id:${input.dataId.toLowerCase()};request-id:${input.requestId};ts:${timestamp};`;
  const expected = createHmac("sha256", input.secret).update(manifest).digest();
  const actual = Buffer.from(received, "hex");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    throw new InvalidMercadoPagoWebhookError("Invalid webhook signature.");
  }
}

export function parseSanitizedMercadoPagoWebhook(value: unknown) {
  const parsed = payloadSchema.parse(value);
  return {
    providerEventId: String(parsed.id ?? parsed.data.id),
    resourceId: String(parsed.data.id),
    topic: parsed.type ?? "unknown",
    action: parsed.action ?? null,
  };
}
