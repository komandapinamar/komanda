import { PaymentReconciliationService } from "@/features/payments/application/payment-reconciliation.service";
import { emitMetric } from "@/lib/observability/metrics";

export type PaymentReconciliationOptions = {
  /** Edad minima de un intento para considerarlo incierto. */
  thresholdSeconds?: number;
  /** Maximo de intentos por ronda. */
  limit?: number;
};

export type PaymentReconciliationSummary = {
  scanned: number;
  reconciled: number;
  pendingVerification: number;
  failed: number;
};

/**
 * Ronda de conciliacion de pagos inciertos.
 *
 * Un cobro con respuesta ambigua deja la orden en `verification_required`.
 * Sin este proceso nadie la resuelve: la orden queda bloqueada para un nuevo
 * cobro equivalente hasta que un operador la destrabe a mano. La conciliacion
 * consulta al proveedor y transiciona a `paid` o `failed` de forma
 * idempotente, con webhook y polling como caminos redundantes.
 */
export async function reconcilePendingPaymentsOnce(
  options: PaymentReconciliationOptions = {},
): Promise<PaymentReconciliationSummary> {
  const service = new PaymentReconciliationService();
  const summary = await service.scanAndReconcileUncertainPayments({
    thresholdSeconds: options.thresholdSeconds,
    limit: options.limit,
  });

  emitMetric("payment.reconciliation_scanned", {
    count: summary.scanned,
    result: summary.failed > 0 ? "failed" : "ok",
    tags: {
      reconciled: String(summary.reconciled),
      pendingVerification: String(summary.pendingVerification),
      failed: String(summary.failed),
    },
  });

  return summary;
}
