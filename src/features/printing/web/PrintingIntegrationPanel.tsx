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
    <section className="liquid-prism-ring liquid-glass-card space-y-5 rounded-3xl p-6 sm:p-7">
      {message ? (
        <p role="status" className="rounded-2xl border border-white/12 bg-[#101013]/90 px-4 py-3 text-sm text-[#f4f3f1]">
          {message}
        </p>
      ) : null}
      <label className="grid gap-2 text-sm">
        <span className="text-xs font-medium text-[#c2c2cc]">Nombre del agente</span>
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          className="w-full rounded-2xl border border-white/12 bg-[#101013]/90 px-3.5 py-2.5 text-sm text-[#f4f3f1] outline-none transition focus:border-white/30"
        />
      </label>
      <button
        type="button"
        onClick={createPairing}
        className="inline-flex h-10 items-center justify-center rounded-full bg-[#f4f3f1] px-5 text-sm font-medium text-[#141416] transition hover:bg-white"
      >
        Generate pairing code
      </button>
      {pairing ? (
        <div className="space-y-2 rounded-2xl border border-white/12 bg-[#101013]/90 p-5">
          <p className="text-xs text-[#c2c2cc]">One-time pairing code</p>
          <p className="font-mono text-4xl tracking-[0.4em] text-amber-300">{pairing.code}</p>
          <p className="text-xs text-[#9b9ba4]">Expires {new Date(pairing.expiresAt).toLocaleTimeString()}</p>
        </div>
      ) : null}
      {agentId && !pairing ? <p className="text-sm text-[#c2c2cc]">Paired agent: {agentId} ({status ?? "active"})</p> : null}
      {agentId && !pairing ? (
        <button
          type="button"
          onClick={revoke}
          className="inline-flex h-9 items-center justify-center rounded-full border border-red-400/40 bg-red-500/15 px-4 text-xs font-medium text-red-200 transition hover:bg-red-500/25"
        >
          Revoke agent
        </button>
      ) : null}
    </section>
  );
}
