import type { CreatePaymentSessionPayload } from "@/types/types";

/**
 * Accepts the shapes people actually type for an Argentine mobile number and
 * returns E.164-ish digits, or undefined when the input carries no digits.
 * Anything that is not a plausible phone number is dropped so it never reaches
 * the payment provider as `payer.phone.number: ""`.
 */
export function normalizeOptionalPhone(input: string | undefined | null): string | undefined {
  const raw = (input ?? "").trim();
  if (!raw) return undefined;

  const digits = raw.replace(/\D/g, "");
  if (digits.length < 6 || digits.length > 15) return undefined;

  return digits;
}

export function buildCheckoutPayload(input: {
  cartId: string;
  cartVersion?: number;
  customer: { name: string; phone?: string | null };
  notes: string;
}): CreatePaymentSessionPayload {
  const notes = input.notes.trim();

  return {
    cartId: input.cartId,
    cartVersion: input.cartVersion,
    customer: {
      name: input.customer.name.trim(),
      phone: normalizeOptionalPhone(input.customer.phone),
    },
    notes: notes.length > 0 ? notes : undefined,
  };
}