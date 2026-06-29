import Link from "next/link";
import { confirmMercadoPagoPaymentById } from "@/features/shop/payments/server/payment-confirmation.service";
import { getAuthenticatedAdminSession } from "@/features/admin-panel/server/auth.service";
import ClearCartOnSuccess from "@/features/shop/checkout/components/ClearCartOnSuccess";

type SuccessPageProps = {
  searchParams: Promise<{
    payment_id?: string | string[];
    status?: string | string[];
    collection_status?: string | string[];
    source?: string | string[];
    order_id?: string | string[];
    purchase_number?: string | string[];
    customer_name?: string | string[];
    print_status?: string | string[];
  }>;
};

function getSingleValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function CheckoutPaySuccessPage({ searchParams }: SuccessPageProps) {
  const resolvedSearchParams = await searchParams;
  const adminSession = await getAuthenticatedAdminSession();
  const isAdminLoggedIn = Boolean(adminSession);
  const source = getSingleValue(resolvedSearchParams.source)?.trim().toLowerCase() ?? "";
  const paymentId = getSingleValue(resolvedSearchParams.payment_id)?.trim() ?? "";
  const adminOrderId = getSingleValue(resolvedSearchParams.order_id)?.trim() ?? "";
  const adminPurchaseNumber =
    getSingleValue(resolvedSearchParams.purchase_number)?.trim() ?? "";
  const adminCustomerName = getSingleValue(resolvedSearchParams.customer_name)?.trim() ?? "";
  const adminPrintStatus =
    getSingleValue(resolvedSearchParams.print_status)?.trim().toLowerCase() ?? "";
  const paymentStatus = (
    getSingleValue(resolvedSearchParams.status) ??
    getSingleValue(resolvedSearchParams.collection_status) ??
    ""
  )
    .trim()
    .toLowerCase();
  const isAdminDirectOrder = source === "admin-direct" && Boolean(adminOrderId);
  const shouldConfirmPayment =
    !isAdminDirectOrder && Boolean(paymentId) && paymentStatus === "approved";
  const confirmation = shouldConfirmPayment
    ? await confirmMercadoPagoPaymentById(paymentId)
    : null;
  const isErrorState =
    confirmation?.kind === "error" || confirmation?.kind === "missing_attempt";

  const name = isAdminDirectOrder
    ? adminCustomerName
    : (confirmation?.customerName?.trim() ?? "");
  const purchaseNumber = isAdminDirectOrder
    ? adminPurchaseNumber
    : confirmation && "purchaseNumber" in confirmation
      ? confirmation.purchaseNumber
      : "";
  const greeting = name ? `¡Hola ${name}! ` : "";
  const title =
    isAdminDirectOrder
      ? "Pedido creado"
      : isErrorState
      ? "Ocurrió un error"
      : confirmation?.kind === "confirmed" || confirmation?.kind === "already_confirmed"
        ? "Pago exitoso"
        : "Pago recibido";

  const purchaseNumberLabel = purchaseNumber ? `Compra #${purchaseNumber}` : "";

  const message = isAdminDirectOrder
    ? `Creamos pedido de ${name} como administrador. Cobrar en caja al cliente.`
    : isErrorState
    ? confirmation?.kind === "missing_attempt"
      ? `${greeting}No pudimos confirmar tu pedido ahora.`
      : `${greeting}No pudimos confirmar tu pago.`
    : confirmation
      ? confirmation.kind === "confirmed"
        ? `${greeting}Pago exitoso. Tu pedido ya esta en proceso.`
        : confirmation.kind === "already_confirmed"
          ? `${greeting}Tu pago ya fue confirmado y tu pedido sigue en proceso.`
          : confirmation.kind === "status_updated"
            ? `${greeting}Mercado Pago actualizó el estado de tu pago. Seguimos con la confirmación.`
            : `${greeting}Tu pago está siendo procesado. Seguimos con la confirmación.`
      : "Pago recibido. Estamos confirmando tu pedido.";

  const detail = isAdminDirectOrder
    ? adminPrintStatus === "failed"
      ? `${purchaseNumberLabel || `Pedido ${adminOrderId}`}. Se creó correctamente, pero no pudimos enviarlo a la cola de impresión.`
      : `${purchaseNumberLabel || `Pedido ${adminOrderId}`}. Ya lo enviamos a la cola de impresión.`
    : confirmation
    ? isErrorState
      ? confirmation.kind === "missing_attempt" || confirmation.kind === "error"
        ? confirmation.error
        : "Estamos revisando tu pedido."
      : confirmation.kind === "confirmed"
        ? `${purchaseNumberLabel || `Pedido ${confirmation.orderId}`}. Tu pedido esta en proceso y lo prepararemos para retiro.`
        : confirmation.kind === "already_confirmed"
          ? `${purchaseNumberLabel || `Pedido ${confirmation.orderId}`}. Tu pedido esta en proceso y lo prepararemos para retiro.`
          : confirmation.kind === "status_updated"
            ? "Seguimos con la confirmación de tu pedido."
            : "Estamos revisando tu pedido. En breve vas a ver el resultado."
    : "Estamos confirmando tu pedido. En breve vas a ver el resultado.";

  const shouldShowPickupNotice = !isAdminDirectOrder && !isErrorState;
  const shouldClearLocalCart =
    isAdminDirectOrder ||
    confirmation?.kind === "confirmed" ||
    confirmation?.kind === "already_confirmed";

  const containerClassName = isErrorState
    ? "mx-auto max-w-3xl rounded-sm border border-red-700 bg-[var(--color-accent-primary)] p-6"
    : "mx-auto max-w-3xl rounded-sm border border-[var(--color-accent-secondary)] bg-[var(--color-accent-primary)] p-6";

  return (
    <main className="min-h-[100dvh] bg-[var(--color-accent-primary)] p-6 text-[var(--color-accent-secondary)]">
      {shouldClearLocalCart ? <ClearCartOnSuccess /> : null}
      <div className={containerClassName}>
        <h1 className={isErrorState ? "text-3xl font-bold text-red-700" : "text-3xl font-bold"}>
          {title}
        </h1>
        <p className="mt-3">{message}</p>
        {purchaseNumber ? (
          <p className="mt-4 inline-flex rounded-full border border-[var(--color-accent-secondary)] px-4 py-2 text-sm font-semibold">
            Numero de compra #{purchaseNumber}
          </p>
        ) : null}
        <p className={isErrorState ? "mt-3 text-sm text-red-700" : "mt-3 text-sm opacity-80"}>
          {detail}
        </p>
        {shouldShowPickupNotice ? (
          <div className="mt-5 rounded-sm border border-[var(--color-accent-secondary)] bg-[var(--color-accent-secondary)]/10 p-4">
            <p className="font-bold uppercase tracking-wide">
              Importante para retirar
            </p>
            <p className="mt-2 text-sm">
              Para retirar tu pedido, vas a tener que mostrar esta pantalla en caja.
            </p>
            <p className="mt-2 text-sm opacity-90">
              Recomendacion: sacale screenshot ahora para tenerla a mano.
            </p>
          </div>
        ) : null}
        <div className="mt-6 flex gap-3">
          <Link
            href="/order"
            className="rounded-sm bg-[var(--color-accent-secondary)] px-4 py-3 font-semibold text-[var(--color-accent-primary)]"
          >
            Volver al menu
          </Link>
          {isAdminLoggedIn ? (
            <Link
              href="/admin/dashboard"
              className="rounded-sm border border-[var(--color-accent-secondary)] px-4 py-3 font-semibold text-[var(--color-accent-secondary)]"
            >
              Volver al dashboard
            </Link>
          ) : null}

          {/* add order status in real time */}

        </div>
      </div>
    </main>
  );
}
