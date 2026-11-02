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
        <p role="status" className="rounded-2xl border border-white/12 bg-[#101013]/90 px-4 py-2.5 text-xs text-[#f4f3f1]">
          {message}
        </p>
      ) : null}
      <button
        type="button"
        disabled={!ready || activated}
        onClick={activate}
        className="inline-flex h-10 items-center justify-center rounded-full bg-[#f4f3f1] px-5 text-sm font-medium text-[#141416] transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-40"
      >
        {activated ? "Ventas activadas" : "Activar ventas"}
      </button>
    </div>
  );
}
