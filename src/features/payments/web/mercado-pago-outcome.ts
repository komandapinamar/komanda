export type MercadoPagoFailureReason =
  | "account-already-linked"
  | "connection-conflict"
  | "authorization-rejected"
  | "provider-unavailable"
  | "session-expired"
  | "failed";

export type MercadoPagoOutcome = {
  kind: "success" | "error";
  message: string;
};

export const MERCADO_PAGO_CONNECTED_MESSAGE =
  "Mercado Pago conectado. Ya podés cobrar online con esta cuenta.";

export const MERCADO_PAGO_FAILURE_MESSAGES: Record<
  MercadoPagoFailureReason,
  string
> = {
  "account-already-linked":
    "Esta cuenta de Mercado Pago ya está vinculada a otro negocio en Komanda. Una cuenta vendedora no puede conectarse a dos negocios: desvinculá la cuenta del negocio anterior y volvé a intentar acá.",
  "connection-conflict":
    "Este negocio ya tiene una conexión activa con Mercado Pago. Revocá la conexión actual antes de vincular otra cuenta.",
  "authorization-rejected":
    "Mercado Pago rechazó la autorización. Si ya habías conectado la cuenta, el vínculo quedó activo: recargá la página. Si no, volvé a intentar.",
  "provider-unavailable":
    "Mercado Pago no respondió a tiempo. No se pudo completar la conexión: volvé a intentar en unos segundos.",
  "session-expired":
    "La autorización de Mercado Pago venció o es inválida. Volvé a conectar la cuenta.",
  failed: "No se pudo completar la conexión con Mercado Pago. Volvé a intentar.",
};

const failureReasons = new Set<string>([
  "account-already-linked",
  "connection-conflict",
  "authorization-rejected",
  "provider-unavailable",
  "session-expired",
  "failed",
]);

export function mercadoPagoFailureMessage(reason: MercadoPagoFailureReason) {
  return MERCADO_PAGO_FAILURE_MESSAGES[reason];
}

export function mercadoPagoReasonFromValue(
  value: string | null | undefined,
): MercadoPagoFailureReason | null {
  if (!value || !failureReasons.has(value)) return null;
  return value as MercadoPagoFailureReason;
}

const problemCodeReasons: Record<string, MercadoPagoFailureReason> = {
  MERCADO_PAGO_ACCOUNT_ALREADY_LINKED: "account-already-linked",
  INTEGRATION_CONFLICT: "connection-conflict",
  OAUTH_EXCHANGE_REJECTED: "authorization-rejected",
  PAYMENT_PROVIDER_UNAVAILABLE: "provider-unavailable",
  VALIDATION_FAILED: "session-expired",
  RESOURCE_NOT_FOUND: "failed",
};

/**
 * Maps a problem document to owner-facing copy. Unknown codes stay generic so
 * server internals are never surfaced verbatim.
 */
export function mercadoPagoProblemMessage(
  problem: { code?: string } | null | undefined,
) {
  const reason = problem?.code ? problemCodeReasons[problem.code] : undefined;
  return mercadoPagoFailureMessage(reason ?? "failed");
}
