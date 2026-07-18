import Link from "next/link";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import AdminOrdersLive from "@/features/admin-panel/components/AdminOrdersLive";
import { coreSessionService } from "@/features/identity/web/authenticated-session";
import { SESSION_COOKIE_NAME } from "@/features/identity/web/session-cookie";
import { OrderQueryService } from "@/features/orders/application/order-query.service";
import type { OrderView } from "@/features/orders/infrastructure/order.repository";
import { createVerifiedTenantContext } from "@/lib/tenant-context/types";
import type { AdminDashboardOrder, CustomerInfo } from "@/types/types";

function toDashboardOrder(order: OrderView): AdminDashboardOrder {
  return {
    id: order.id,
    purchaseNumber: order.purchaseNumber,
    status: order.fulfillmentStatus,
    paymentStatus: order.paymentStatus,
    customer: order.customer as CustomerInfo,
    notes: order.notes,
    source: order.source,
    lines: order.lines.map((line) => ({
      id: line.id,
      name: line.name,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      lineTotal: line.lineTotal,
      note: line.note,
      options: line.options.map((opt) => ({
        name: opt.name,
        priceDelta: opt.priceDelta,
        quantity: opt.quantity,
      })),
    })),
    subtotal: order.subtotal,
    discountTotal: order.discountTotal,
    total: order.total,
    currency: order.currency,
    approvedAt: order.approvedAt,
    deliveredAt: order.deliveredAt,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
    version: order.version,
  };
}

export default async function TenantOrdersPage({
  params,
}: {
  params: Promise<{ tenantId: string }>;
}) {
  const { tenantId } = await params;
  const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  if (!token) redirect("/admin");
  let authority;
  try {
    authority = await coreSessionService().authorizeTenant(token, tenantId);
  } catch {
    notFound();
  }

  const context = createVerifiedTenantContext({
    tenantId,
    correlationId: crypto.randomUUID(),
    source: "administrative",
    actor: {
      kind: "user",
      userId: authority.session.userId,
      membershipId: authority.membership.id,
      role: authority.membership.role,
    },
  });
  const page = await new OrderQueryService().list({ context });

  return (
    <main className="mx-auto max-w-6xl space-y-8 px-6 py-10">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm uppercase tracking-[0.2em] text-amber-400">
            Operación
          </p>
          <h1 className="mt-2 text-3xl font-semibold">Pedidos en curso</h1>
          <p className="mt-2 text-zinc-400">
            Los cambios se reciben por eventos incrementales del tenant activo.
          </p>
        </div>
        <Link
          href={`/admin/${tenantId}/orders/new`}
          className="rounded-sm bg-amber-400 px-4 py-3 text-sm font-semibold text-zinc-950"
        >
          Crear pedido directo
        </Link>
      </header>

      <AdminOrdersLive
        tenantId={tenantId}
        initialOrders={page.data.map(toDashboardOrder)}
      />
    </main>
  );
}
