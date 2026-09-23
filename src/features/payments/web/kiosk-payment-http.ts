import { problemResponse, nonDisclosingNotFound } from "@/lib/http/problem";
import { ZodError } from "zod";
import { TenantAccessDeniedError } from "@/features/identity/application/session.service";

export class PaymentGatewayNotConfiguredError extends Error {
  constructor(message = "El local no tiene una cuenta de Mercado Pago activa para recibir cobros.") {
    super(message);
    this.name = "PaymentGatewayNotConfiguredError";
  }
}

export class KioskPaymentCartUnavailableError extends Error {
  constructor(message = "El carrito para la sesión de autoservicio no está disponible.") {
    super(message);
    this.name = "KioskPaymentCartUnavailableError";
  }
}

export class KioskPaymentItemUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "KioskPaymentItemUnavailableError";
  }
}

export function kioskPaymentErrorResponse(error: unknown, correlationId: string) {
  if (
    error instanceof TenantAccessDeniedError ||
    (error instanceof Error && error.message === "INVALID_SESSION")
  ) {
    return nonDisclosingNotFound(correlationId);
  }

  if (error instanceof ZodError) {
    return problemResponse({
      status: 422,
      title: "Validation failed",
      code: "VALIDATION_FAILED",
      detail: error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(", "),
      correlationId,
    });
  }

  if (error instanceof PaymentGatewayNotConfiguredError) {
    return problemResponse({
      status: 422,
      title: "Mercado Pago no configurado",
      code: "PAYMENT_GATEWAY_NOT_CONFIGURED",
      detail: error.message,
      correlationId,
    });
  }

  if (
    error instanceof KioskPaymentCartUnavailableError ||
    error instanceof KioskPaymentItemUnavailableError
  ) {
    return problemResponse({
      status: 409,
      title: "Conflicto en ítems de pago",
      code: "PAYMENT_ITEMS_CONFLICT",
      detail: error.message,
      correlationId,
    });
  }

  console.error("[kiosk-payment] Unhandled error:", error);

  return problemResponse({
    status: 500,
    title: "Internal Server Error",
    code: "INTERNAL_ERROR",
    correlationId,
  });
}
