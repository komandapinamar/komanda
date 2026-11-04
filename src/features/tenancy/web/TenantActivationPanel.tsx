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
        <p role="status" className="rounded-2lg border border-border-button-default bg-background-primary-default px-4 py-2.5 text-body-2-medium text-text-primary">
          {message}
        </p>
      ) : null}
      <button
        type="button"
        disabled={!ready || activated}
        onClick={activate}
        className="bg-button-primary button-press-motion inline-flex h-9 items-center justify-center rounded-2lg px-4 text-body-medium text-text-white shadow-xs disabled:cursor-not-allowed disabled:opacity-45"
      >
        {activated ? "Ventas activadas" : "Activar ventas"}
      </button>
    </div>
  );
}
