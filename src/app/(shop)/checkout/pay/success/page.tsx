import Link from "next/link";
import ClearCartOnSuccess from "@/features/shop/checkout/components/ClearCartOnSuccess";
import { OrderStatusPoller } from "@/features/shop/checkout/components/OrderStatusPoller";

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
  const source = getSingleValue(resolvedSearchParams.source)?.trim().toLowerCase() ?? "";
  const paymentId = getSingleValue(resolvedSearchParams.payment_id)?.trim() ?? "";
  const adminOrderId = getSingleValue(resolvedSearchParams.order_id)?.trim() ?? "";
  const adminPurchaseNumber =
    getSingleValue(resolvedSearchParams.purchase_number)?.trim() ?? "";
  const adminCustomerName = getSingleValue(resolvedSearchParams.customer_name)?.trim() ?? "";
  const adminPrintStatus =
    getSingleValue(resolvedSearchParams.print_status)?.trim().toLowerCase() ?? "";
  const isAdminDirectOrder =
    (source === "admin_direct" || source === "admin-direct") && Boolean(adminOrderId);

  const purchaseNumberLabel = adminPurchaseNumber ? `Compra #${adminPurchaseNumber}` : "";

  return (
    <main className="min-h-[100dvh] bg-[var(--color-accent-primary)] p-6 text-[var(--color-accent-secondary)]">
      {isAdminDirectOrder ? (
        <div className="mx-auto max-w-3xl rounded-sm border border-[var(--color-accent-secondary)] bg-[var(--color-accent-primary)] p-6">
          <ClearCartOnSuccess />
          <h1 className="text-3xl font-bold">Pedido creado</h1>
          <p className="mt-3">
            Creamos pedido de {adminCustomerName} como administrador. Cobrar en caja al cliente.
          </p>
          {adminPurchaseNumber ? (
            <p className="mt-4 inline-flex rounded-full border border-[var(--color-accent-secondary)] px-4 py-2 text-sm font-semibold">
              Numero de compra #{adminPurchaseNumber}
            </p>
          ) : null}
          <p className="mt-3 text-sm opacity-80">
            {adminPrintStatus === "failed"
              ? `${purchaseNumberLabel || `Pedido ${adminOrderId}`}. Se creó correctamente, pero no pudimos enviarlo a la cola de impresión.`
              : `${purchaseNumberLabel || `Pedido ${adminOrderId}`}. Ya lo enviamos a la cola de impresión.`}
          </p>
          <div className="mt-6 flex gap-3">
            <Link
              href="/order"
              className="rounded-sm bg-[var(--color-accent-secondary)] px-4 py-3 font-semibold text-[var(--color-accent-primary)]"
            >
              Volver al menu
            </Link>
          </div>
        </div>
      ) : paymentId ? (
        <OrderStatusPoller paymentId={paymentId} />
      ) : (
        <div className="mx-auto max-w-3xl rounded-sm border border-amber-700 bg-[var(--color-accent-primary)] p-6">
          <h1 className="text-3xl font-bold text-amber-500">Pago recibido</h1>
          <p className="mt-3">Gracias por tu compra.</p>
          <p className="mt-2 text-sm opacity-80">
            No recibimos el identificador del pago. Si ves el cobro en tu cuenta, no te preocupes, tu pedido esta siendo procesado.
          </p>
          <div className="mt-6 flex gap-3">
            <Link
              href="/order"
              className="rounded-sm bg-[var(--color-accent-secondary)] px-4 py-3 font-semibold text-[var(--color-accent-primary)]"
            >
              Volver al menu
            </Link>
          </div>
        </div>
      )}
    </main>
  );
}
