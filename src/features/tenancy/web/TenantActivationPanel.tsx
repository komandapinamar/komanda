"use client";

import { useState } from "react";

export function TenantActivationPanel({
  tenantId,
  ready,
}: {
  tenantId: string;
  ready: boolean;
}) {
  const [message, setMessage] = useState<string | null>(null);
  const [activated, setActivated] = useState(false);

  async function activate() {
    setMessage(null);
    const response = await fetch(`/api/v1/tenants/${tenantId}/activation`, {
      method: "POST",
      headers: { "Idempotency-Key": crypto.randomUUID() },
    });
    if (response.ok) {
      setActivated(true);
      setMessage("Ventas activadas.");
      return;
    }
    setMessage("No se pudo activar: hay requisitos pendientes.");
  }

  return (
    <div className="space-y-3">
      {message ? (
        <p role="status" className="rounded-md border border-zinc-800 bg-zinc-900 p-3 text-sm">
          {message}
        </p>
      ) : null}
      <button
        type="button"
        disabled={!ready || activated}
        onClick={activate}
        className="rounded-md bg-amber-400 px-5 py-3 font-semibold text-zinc-950 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {activated ? "Ventas activadas" : "Activar ventas"}
      </button>
    </div>
  );
}
