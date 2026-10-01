"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  mercadoPagoProblemMessage,
  type MercadoPagoOutcome,
} from "./mercado-pago-outcome";

export type MercadoPagoIntegrationView = {
  provider: "mercadopago";
  status: "pending" | "active" | "expired" | "revoked" | "error";
  sellerAccountHint: string | null;
  scopes: string[];
  expiresAt: string | null;
  lastVerifiedAt: string | null;
  version: number;
};

type Notice = { tone: "success" | "error"; text: string } | null;

async function jsonOrThrow(response: Response) {
  if (response.ok) return response.status === 204 ? null : response.json();
  const problem = (await response.json().catch(() => null)) as {
    code?: string;
  } | null;
  throw new Error(mercadoPagoProblemMessage(problem));
}

export function MercadoPagoIntegrationPanel({
  tenantId,
  initialStatus,
  outcome,
}: {
  tenantId: string;
  initialStatus: MercadoPagoIntegrationView;
  outcome?: MercadoPagoOutcome | null;
}) {
  const [status, setStatus] = useState(initialStatus);
  const [message, setMessage] = useState<Notice>(
    outcome ? { tone: outcome.kind, text: outcome.message } : null,
  );
  const router = useRouter();

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
      setMessage({
        tone: "error",
        text: error instanceof Error ? error.message : "Error inesperado.",
      });
    }
  }

  async function revoke() {
    setMessage(null);
    try {
      const result = (await jsonOrThrow(
        await fetch(`/api/v1/tenants/${tenantId}/integrations/mercadopago`, {
          method: "DELETE",
          headers: { "If-Match": String(status.version) },
        }),
      )) as { localRevoked?: boolean; remoteConfirmed?: boolean; version?: number } | null;

      const nextVersion = result?.version ?? status.version + 1;
      setStatus({
        provider: "mercadopago",
        status: "revoked",
        sellerAccountHint: null,
        scopes: [],
        expiresAt: null,
        lastVerifiedAt: null,
        version: nextVersion,
      });

      if (result?.remoteConfirmed) {
        setMessage({
          tone: "success",
          text: "Mercado Pago desconectado y autorización remota revocada.",
        });
      } else {
        setMessage({
          tone: "success",
          text: "Mercado Pago desconectado de Komanda (la revocación remota en Mercado Pago no pudo ser confirmada).",
        });
      }
      router.refresh();
    } catch (error) {
      setMessage({
        tone: "error",
        text: error instanceof Error ? error.message : "Error inesperado.",
      });
    }
  }

  return (
    <section className="space-y-5 rounded-lg border border-zinc-800 bg-zinc-900 p-5">
      {message ? (
        <p
          role="status"
          className={`rounded-md border p-3 text-sm ${
            message.tone === "error"
              ? "border-amber-700 bg-amber-950/40 text-amber-100"
              : "border-emerald-800 bg-emerald-950/40 text-emerald-100"
          }`}
        >
          {message.text}
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
          className="rounded-md bg-(--color-accent-tertiary) px-4 py-2 text-sm font-semibold text-zinc-950"
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
