import Link from "next/link";

export default function CheckoutPayFailurePage() {
  return (
    <main className="min-h-[100dvh] bg-[var(--color-accent-primary)] p-6 text-[var(--color-accent-secondary)]">
      <div className="mx-auto max-w-3xl rounded-sm border border-[var(--color-accent-secondary)] bg-[var(--color-accent-primary)] p-6">
        <h1 className="text-3xl font-bold">Pago no completado</h1>
        <p className="mt-3">
          No pudimos confirmar el pago en Mercado Pago. Podes volver al checkout e
          intentarlo de nuevo.
        </p>
        <div className="mt-6 flex gap-3">
          <Link
            href="/checkout/pay"
            className="rounded-sm bg-[var(--color-accent-secondary)] px-4 py-3 font-semibold text-[var(--color-accent-primary)]"
          >
            Intentar nuevamente
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
