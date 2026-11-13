/**
 * Identificadores de servicio que la plataforma usa para barrer datos de
 * todos los tenants.
 *
 * Cada valor tiene que coincidir con la politica de RLS que lo habilita
 * (migracion 0031_platform_service_rls_policies). Si se cambia uno sin
 * cambiar la politica, el worker deja de ver la informacion y falla en
 * silencio: corre, no reclama nada y el backlog crece.
 */
export const OUTBOX_DISPATCH_SERVICE_ID = "outbox-dispatcher";

/** Lectura cross-tenant de metricas de la outbox para el health check. */
export const OUTBOX_METRICS_SERVICE_ID = "outbox:metrics";

/** Barrido de intentos de pago con respuesta incierta. */
export const PAYMENT_RECONCILIATION_SERVICE_ID = "payment:reconciliation-scanner";
