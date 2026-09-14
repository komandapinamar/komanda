import Link from "next/link";
import ClearCartOnSuccess from "@/features/shop/checkout/components/ClearCartOnSuccess";
import { OrderStatusPoller } from "@/features/shop/checkout/components/OrderStatusPoller";

type SuccessPageProps = {
  searchParams: Promise<{
    payment_id?: string | string[];
    status?: string | string[];
    collection_status?: string | string[];
  }>;
};

function getSingleValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function CheckoutPaySuccessPage({ searchParams }: SuccessPageProps) {
  const resolvedSearchParams = await searchParams;
  const paymentId = getSingleValue(resolvedSearchParams.payment_id)?.trim() ?? "";

  return (
    <main className="min-h-[100dvh] bg-[var(--color-accent-primary)] p-6 text-[var(--color-accent-secondary)]">
      {paymentId ? (
        <OrderStatusPoller paymentId={paymentId} />
      ) : (
        <div className="mx-auto max-w-3xl rounded-sm border border-amber-700 bg-[var(--color-accent-primary)] p-6">
          <ClearCartOnSuccess />
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
