"use client";

import { useState } from "react";

export type MercadoPagoIntegrationView = {
  provider: "mercadopago";
  status: "pending" | "active" | "expired" | "revoked" | "error";
  sellerAccountHint: string | null;
  scopes: string[];
  expiresAt: string | null;
  lastVerifiedAt: string | null;
  version: number;
};

async function jsonOrThrow(response: Response) {
  if (response.ok) return response.status === 204 ? null : response.json();
  if (response.status === 409) {
    throw new Error("La integración cambió. Recargá antes de continuar.");
  }
  throw new Error("No se pudo completar la operación.");
}

export function MercadoPagoIntegrationPanel({
  tenantId,
  initialStatus,
}: {
  tenantId: string;
  initialStatus: MercadoPagoIntegrationView;
}) {
  const [status, setStatus] = useState(initialStatus);
  const [message, setMessage] = useState<string | null>(null);

  async function connect() {
    setMessage(null);
    try {
      const session = (await jsonOrThrow(
        await fetch(
          `/api/v1/tenants/${tenantId}/integrations/mercadopago/oauth`,
          { method: "POST" },
        ),
      )) as { authorizationUrl: string };
      window.location.assign(session.authorizationUrl);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Error inesperado.");
    }
  }

  async function revoke() {
    setMessage(null);
    try {
      await jsonOrThrow(
        await fetch(`/api/v1/tenants/${tenantId}/integrations/mercadopago`, {
          method: "DELETE",
          headers: { "If-Match": String(status.version) },
        }),
      );
      setStatus({
        provider: "mercadopago",
        status: "revoked",
        sellerAccountHint: null,
        scopes: [],
        expiresAt: null,
        lastVerifiedAt: null,
        version: status.version + 1,
      });
      setMessage("Mercado Pago revocado.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Error inesperado.");
    }
  }

  return (
    <section className="space-y-5 rounded-lg border border-zinc-800 bg-zinc-900 p-5">
      {message ? (
        <p role="status" className="rounded-md border border-zinc-700 p-3 text-sm">
          {message}
        </p>
      ) : null}
      <div className="grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <p className="text-zinc-400">Estado</p>
          <p className="mt-1 font-medium">{status.status}</p>
        </div>
        <div>
          <p className="text-zinc-400">Cuenta vendedora</p>
          <p className="mt-1 font-medium">{status.sellerAccountHint ?? "Sin conexión"}</p>
        </div>
        <div>
          <p className="text-zinc-400">Última verificación</p>
          <p className="mt-1 font-medium">
            {status.lastVerifiedAt
              ? new Date(status.lastVerifiedAt).toLocaleString()
              : "Pendiente"}
          </p>
        </div>
        <div>
          <p className="text-zinc-400">Vencimiento</p>
          <p className="mt-1 font-medium">
            {status.expiresAt ? new Date(status.expiresAt).toLocaleString() : "No disponible"}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={connect}
          className="rounded-md bg-amber-400 px-4 py-2 text-sm font-semibold text-zinc-950"
        >
          Conectar por OAuth
        </button>
        <button
          type="button"
          onClick={revoke}
          disabled={status.status !== "active"}
          className="rounded-md border border-zinc-700 px-4 py-2 text-sm font-semibold text-zinc-100 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Revocar
        </button>
      </div>
    </section>
  );
}
