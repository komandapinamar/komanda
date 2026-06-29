import Link from "next/link";

export default function CheckoutPayPendingPage() {
  return (
    <main className="min-h-[100dvh] bg-[var(--color-accent-primary)] p-6 text-[var(--color-accent-secondary)]">
      <div className="mx-auto max-w-3xl rounded-sm border border-[var(--color-accent-secondary)] bg-[var(--color-accent-primary)] p-6">
        <h1 className="text-3xl font-bold">Pago pendiente</h1>
        <p className="mt-3">
          Mercado Pago todavia no marco el pago como aprobado. Apenas llegue la
          notificacion final, el backend podra continuar con la creacion de la orden.
        </p>
        <div className="mt-6 flex gap-3">
          <Link
            href="/checkout/pay"
            className="rounded-sm bg-[var(--color-accent-secondary)] px-4 py-3 font-semibold text-[var(--color-accent-primary)]"
          >
            Revisar checkout
          </Link>
          <Link
            href="/order"
            className="rounded-sm border border-[var(--color-accent-secondary)] px-4 py-3 font-semibold"
          >
            Volver al menu
          </Link>
        </div>
      </div>
    </main>
  );
}
