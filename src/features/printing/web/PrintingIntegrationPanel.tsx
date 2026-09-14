"use client";

import { useEffect, useState } from "react";

export function PrintingIntegrationPanel({
  tenantId,
  locationId,
}: {
  tenantId: string;
  locationId: string;
}) {
  const [name, setName] = useState("Cocina principal");
  const [agentId, setAgentId] = useState<string | null>(null);
  const [pairing, setPairing] = useState<{ id: string; code: string; expiresAt: string } | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function createPairing() {
    setMessage(null);
    const response = await fetch(`/api/v1/tenants/${tenantId}/print-pairings`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": crypto.randomUUID(),
      },
      body: JSON.stringify({ locationId }),
    });
    if (!response.ok) {
      setMessage("No se pudo crear el emparejamiento.");
      return;
    }
    const body = (await response.json()) as { pairingId: string; code: string; expiresAt: string };
    setPairing({ id: body.pairingId, code: body.code, expiresAt: body.expiresAt });
    setStatus("pending");
    setMessage("Enter this one-time code in Komanda Desktop.");
  }

  useEffect(() => {
    if (!pairing || status !== "pending") return;
    const timer = window.setInterval(async () => {
      const response = await fetch(`/api/v1/tenants/${tenantId}/print-pairings/${pairing.id}`);
      if (!response.ok) return;
      const body = (await response.json()) as { status: string; agentId: string | null };
      setStatus(body.status);
      if (body.agentId) { setAgentId(body.agentId); setPairing(null); setMessage("Desktop agent paired."); }
    }, 2000);
    return () => window.clearInterval(timer);
  }, [pairing, status, tenantId]);

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
    setPairing(null);
    setStatus(null);
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
        onClick={createPairing}
        className="rounded-md bg-amber-400 px-4 py-2 text-sm font-semibold text-zinc-950"
      >
        Generate pairing code
      </button>
      {pairing ? (
        <div className="space-y-2">
          <p className="text-sm text-zinc-400">One-time pairing code</p>
          <p className="font-mono text-4xl tracking-[0.4em] text-amber-300">{pairing.code}</p>
          <p className="text-xs text-zinc-500">Expires {new Date(pairing.expiresAt).toLocaleTimeString()}</p>
        </div>
      ) : null}
      {agentId && !pairing ? <p className="text-sm text-zinc-400">Paired agent: {agentId} ({status ?? "active"})</p> : null}
      {agentId && !pairing ? <button type="button" onClick={revoke} className="rounded-md border border-red-400 px-4 py-2 text-sm font-semibold text-red-200">Revoke agent</button> : null}
    </section>
  );
}
