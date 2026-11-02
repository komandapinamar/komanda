import Link from "next/link";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { OrdersShell } from "@/features/tenancy/web/shells/orders-shell";
import { coreSessionService } from "@/features/identity/web/authenticated-session";
import { SESSION_COOKIE_NAME } from "@/features/identity/web/session-cookie";
import { canAccess } from "@/lib/authorization/permissions";
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
    tender: order.tender ?? null,
    pickupPin: order.pickupPin ?? null,
    paymentExpiresAt: order.paymentExpiresAt ?? null,
    approvedAt: order.approvedAt,
    deliveredAt: order.deliveredAt,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
    version: order.version,
  };
}

export default async function TenantOrdersPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenantId: string }>;
  searchParams?: Promise<{ created?: string | string[] }>;
}) {
  const { tenantId } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const createdParam = Array.isArray(resolvedSearchParams.created)
    ? resolvedSearchParams.created[0]
    : resolvedSearchParams.created;
  const createdRef = createdParam?.trim() || null;
  const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  if (!token) redirect("/login");
  let authority;
  try {
    authority = await coreSessionService().authorizeTenant(token, tenantId);
  } catch {
    notFound();
  }

  if (!canAccess(authority.membership.role, "pedidos")) {
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
    <main className="mx-auto max-w-5xl space-y-8 px-4 py-8 sm:px-6">
      <header className="flex flex-col justify-between gap-4 border-b border-white/[0.08] pb-6 sm:flex-row sm:items-end">
        <div className="space-y-1">
          <p className="text-xs font-medium uppercase tracking-widest text-[#c2c2cc]">
            Operación · @{authority.membership.tenantSlug}
          </p>
          <h1 className="text-3xl font-medium tracking-tight text-[#f4f3f1]">
            Pedidos en curso
          </h1>
          <p className="text-sm text-[#c2c2cc]">
            Monitoreá cobros, cocina y entregas en tiempo real.
          </p>
        </div>
        <Link
          href={`/admin/${tenantId}/orders/new`}
          className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-full bg-[#f4f3f1] px-5 text-sm font-medium text-[#141416] transition hover:bg-white"
        >
          <span>Crear pedido directo</span>
          <span aria-hidden="true">→</span>
        </Link>
      </header>

      {createdRef ? (
        <div
          role="status"
          className="flex items-center gap-2.5 rounded-2xl border border-emerald-400/25 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300"
        >
          <span>✓</span>
          <p className="font-medium">
            Pedido creado correctamente
            {createdRef !== "1" ? ` (#${createdRef})` : ""}.
          </p>
        </div>
      ) : null}

      <OrdersShell
        tenantId={tenantId}
        initialOrders={page.data.map(toDashboardOrder)}
      />
    </main>
  );
}
