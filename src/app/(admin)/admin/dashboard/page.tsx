import Link from "next/link";
import { redirect } from "next/navigation";
import AdminOrdersLive from "@/features/admin-panel/components/AdminOrdersLive";
import { getAuthenticatedAdminSession } from "@/features/admin-panel/server/auth.service";
import { listOrdersInProgress } from "@/features/shop/checkout/server/order.service";

export default async function AdminDashboardPage() {
  const adminSession = await getAuthenticatedAdminSession();

  if (!adminSession) {
    redirect("/admin");
  }

  const activeOrders = await listOrdersInProgress();

  return (
    <main className="min-h-[100dvh] bg-[var(--color-accent-primary)] px-6 py-8 text-[var(--color-accent-secondary)]">
      <div className="mx-auto max-w-5xl space-y-6">
        <header className="flex flex-col gap-4 rounded-sm border border-[var(--color-accent-secondary)] bg-[var(--color-accent-primary)] p-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-2">
            <p className="text-sm uppercase tracking-[0.2em]">Panel admin</p>
            <h1 className="text-3xl font-bold">Pedidos en proceso</h1>
            <p className="text-sm opacity-80">
              Sesion iniciada como {adminSession.username}. Usa este panel para seguir los pedidos activos y marcarlos como entregados.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link
              href="/order"
              className="rounded-sm bg-[var(--color-accent-secondary)] px-4 py-3 font-semibold text-[var(--color-accent-primary)]"
            >
              Crear pedido manual
            </Link>
          </div>
        </header>

        <AdminOrdersLive initialOrders={activeOrders} />
      </div>
    </main>
  );
}
