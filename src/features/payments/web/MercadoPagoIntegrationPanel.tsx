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
    <section className="space-y-5 rounded-2lg border border-border-button-default bg-background-primary-default/50 p-5">
      {message ? (
        <p
          role="status"
          className={`rounded-2lg border px-4 py-3 text-body-2-medium ${
            message.tone === "error"
              ? "border-amber-500/30 bg-status-yellow-background text-status-yellow-text"
              : "border-emerald-500/30 bg-status-lime-background text-status-lime-text"
          }`}
        >
          {message.text}
        </p>
      ) : null}
      <div className="grid gap-3 text-body-2-regular sm:grid-cols-2">
        <div>
          <p className="text-text-secondary">Estado</p>
          <p className="mt-1 text-body-medium text-text-primary">{status.status}</p>
        </div>
        <div>
          <p className="text-text-secondary">Cuenta vendedora</p>
          <p className="mt-1 text-body-medium text-text-primary">{status.sellerAccountHint ?? "Sin conexión"}</p>
        </div>
        <div>
          <p className="text-text-secondary">Última verificación</p>
          <p className="mt-1 text-body-medium text-text-primary">
            {status.lastVerifiedAt
              ? new Date(status.lastVerifiedAt).toLocaleString()
              : "Pendiente"}
          </p>
        </div>
        <div>
          <p className="text-text-secondary">Vencimiento</p>
          <p className="mt-1 text-body-medium text-text-primary">
            {status.expiresAt ? new Date(status.expiresAt).toLocaleString() : "No disponible"}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2.5">
        <button
          type="button"
          onClick={connect}
          className="bg-button-primary button-press-motion inline-flex h-9 cursor-pointer items-center justify-center rounded-2lg px-4 text-body-medium text-text-white shadow-xs"
        >
          Conectar por OAuth
        </button>
        <button
          type="button"
          onClick={revoke}
          disabled={status.status !== "active"}
          className="inline-flex h-9 cursor-pointer items-center justify-center rounded-2lg border border-border-button-default bg-background-primary-default px-4 text-body-medium text-text-primary transition hover:bg-background-primary-hover disabled:cursor-not-allowed disabled:opacity-40"
        >
          Revocar
        </button>
      </div>
    </section>
  );
}
