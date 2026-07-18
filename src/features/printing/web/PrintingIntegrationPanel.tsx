"use client";

import { useState } from "react";

export function PrintingIntegrationPanel({
  tenantId,
  locationId,
}: {
  tenantId: string;
  locationId: string;
}) {
  const [name, setName] = useState("Cocina principal");
  const [agentId, setAgentId] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function enroll() {
    setMessage(null);
    setToken(null);
    const response = await fetch(`/api/v1/tenants/${tenantId}/print-agents`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": crypto.randomUUID(),
      },
      body: JSON.stringify({ locationId, name }),
    });
    if (!response.ok) {
      setMessage("No se pudo enrolar el agente de impresión.");
      return;
    }
    const body = (await response.json()) as { agentId: string; token: string };
    setAgentId(body.agentId);
    setToken(body.token);
    setMessage("Agente enrolado.");
  }

  async function revoke() {
    if (!agentId) return;
    setMessage(null);
    const response = await fetch(
      `/api/v1/tenants/${tenantId}/print-agents/${agentId}`,
      { method: "DELETE" },
    );
    if (!response.ok) {
      setMessage("No se pudo revocar el agente de impresión.");
      return;
    }
    setAgentId(null);
    setToken(null);
    setMessage("Agente revocado.");
  }

  return (
    <section className="space-y-5 rounded-lg border border-zinc-800 bg-zinc-900 p-5">
      {message ? (
        <p role="status" className="rounded-md border border-zinc-700 p-3 text-sm">
          {message}
        </p>
      ) : null}
      <label className="block text-sm">
        <span className="text-zinc-400">Nombre del agente</span>
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          className="mt-2 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-zinc-100"
        />
      </label>
      <button
        type="button"
        onClick={enroll}
        className="rounded-md bg-amber-400 px-4 py-2 text-sm font-semibold text-zinc-950"
      >
        Enrolar agente
      </button>
      {token ? (
        <div className="space-y-2">
          <p className="text-sm text-zinc-400">Token del agente</p>
          <textarea
            readOnly
            value={token}
            rows={3}
            className="w-full rounded-md border border-zinc-700 bg-zinc-950 p-3 font-mono text-sm text-zinc-100"
          />
          <button
            type="button"
            onClick={revoke}
            className="rounded-md border border-red-400 px-4 py-2 text-sm font-semibold text-red-200"
          >
            Revocar agente
          </button>
        </div>
      ) : null}
    </section>
  );
}
