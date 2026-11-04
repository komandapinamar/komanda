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
    <section className="space-y-5 rounded-2xl border border-border-component-detail-container bg-background-secondary-default p-6 shadow-card sm:p-7">
      {message ? (
        <p role="status" className="rounded-2lg border border-border-button-default bg-background-primary-default px-4 py-3 text-body-2-medium text-text-primary">
          {message}
        </p>
      ) : null}
      <label className="grid gap-1.5 text-body-medium text-text-primary">
        <span>Nombre del agente</span>
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          className="w-full px-3.5 py-2 text-body-regular"
        />
      </label>
      <button
        type="button"
        onClick={createPairing}
        className="bg-button-primary button-press-motion inline-flex h-9 cursor-pointer items-center justify-center rounded-2lg px-4 text-body-medium text-text-white shadow-xs"
      >
        Generate pairing code
      </button>
      {pairing ? (
        <div className="space-y-2 rounded-2lg border border-border-button-default bg-background-primary-default p-5">
          <p className="text-caption-1-medium text-text-secondary">One-time pairing code</p>
          <p className="font-mono text-4xl tracking-[0.4em] text-accent-400">{pairing.code}</p>
          <p className="text-caption-1-regular text-text-tertiary">Expires {new Date(pairing.expiresAt).toLocaleTimeString()}</p>
        </div>
      ) : null}
      {agentId && !pairing ? <p className="text-body-regular text-text-secondary">Paired agent: {agentId} ({status ?? "active"})</p> : null}
      {agentId && !pairing ? (
        <button
          type="button"
          onClick={revoke}
          className="bg-button-danger button-press-motion inline-flex h-9 cursor-pointer items-center justify-center rounded-2lg px-4 text-body-medium text-text-white shadow-xs"
        >
          Revoke agent
        </button>
      ) : null}
    </section>
  );
}
