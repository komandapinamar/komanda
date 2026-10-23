export function normalizeWhatsAppRecipient(phone: string | null | undefined): string | null {
  const digits = (phone ?? "").replace(/\D/g, "");
  // Argentine mobile numbers: accept the local ten digits, +54 9, or 54 9.
  let local = digits.startsWith("549") ? digits.slice(3)
    : digits.startsWith("54") ? digits.slice(2) : digits;
  if (local.startsWith("0")) local = local.slice(1);
  if (local.length === 12 && local.slice(2, 4) === "15") {
    local = local.slice(0, 2) + local.slice(4);
  }
  if (!/^[1-9]\d{9}$/.test(local)) return null;
  return `549${local}`;
}
