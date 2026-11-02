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
    <section className="space-y-5 rounded-2xl border border-white/12 bg-[#101013]/90 p-5">
      {message ? (
        <p
          role="status"
          className={`rounded-2xl border px-4 py-3 text-xs ${
            message.tone === "error"
              ? "border-amber-400/30 bg-amber-500/10 text-amber-200"
              : "border-emerald-400/30 bg-emerald-500/10 text-emerald-200"
          }`}
        >
          {message.text}
        </p>
      ) : null}
      <div className="grid gap-3 text-xs sm:grid-cols-2">
        <div>
          <p className="text-[#c2c2cc]">Estado</p>
          <p className="mt-1 text-sm font-medium text-[#f4f3f1]">{status.status}</p>
        </div>
        <div>
          <p className="text-[#c2c2cc]">Cuenta vendedora</p>
          <p className="mt-1 text-sm font-medium text-[#f4f3f1]">{status.sellerAccountHint ?? "Sin conexión"}</p>
        </div>
        <div>
          <p className="text-[#c2c2cc]">Última verificación</p>
          <p className="mt-1 text-sm font-medium text-[#f4f3f1]">
            {status.lastVerifiedAt
              ? new Date(status.lastVerifiedAt).toLocaleString()
              : "Pendiente"}
          </p>
        </div>
        <div>
          <p className="text-[#c2c2cc]">Vencimiento</p>
          <p className="mt-1 text-sm font-medium text-[#f4f3f1]">
            {status.expiresAt ? new Date(status.expiresAt).toLocaleString() : "No disponible"}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2.5">
        <button
          type="button"
          onClick={connect}
          className="inline-flex h-9 items-center justify-center rounded-full bg-[#f4f3f1] px-4 text-xs font-medium text-[#141416] transition hover:bg-white"
        >
          Conectar por OAuth
        </button>
        <button
          type="button"
          onClick={revoke}
          disabled={status.status !== "active"}
          className="inline-flex h-9 items-center justify-center rounded-full border border-white/15 bg-white/[0.05] px-4 text-xs font-medium text-[#f4f3f1] transition hover:bg-white/[0.12] disabled:cursor-not-allowed disabled:opacity-40"
        >
          Revocar
        </button>
      </div>
    </section>
  );
}
