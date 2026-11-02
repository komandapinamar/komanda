"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type DangerZoneProps = {
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  isOwner: boolean;
};

export function DangerZone({
  tenantId,
  tenantName,
  tenantSlug,
  isOwner,
}: DangerZoneProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [confirmationInput, setConfirmationInput] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOwner) return null;

  const isConfirmed =
    confirmationInput.trim().toLowerCase() === tenantSlug.toLowerCase() ||
    confirmationInput.trim().toLowerCase() === tenantName.toLowerCase();

  const handleDelete = async () => {
    if (!isConfirmed || isDeleting) return;
    setIsDeleting(true);
    setError(null);

    try {
      const response = await fetch(`/api/v1/tenants/${encodeURIComponent(tenantId)}`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(
          (data as { detail?: string }).detail ??
          (data as { title?: string }).title ??
          "No se pudo eliminar el negocio. Verificá tus permisos e intentá de nuevo."
        );
      }

      // Redirect to select-business to refresh session and tenant memberships
      router.push("/admin/select-business");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al eliminar el negocio.");
      setIsDeleting(false);
    }
  };

  return (
    <div className="liquid-glass-card rounded-3xl border-red-400/25 p-6 sm:p-7 space-y-4">
      <div>
        <h3 className="text-lg font-medium tracking-tight text-red-300">Zona de peligro</h3>
        <p className="mt-1 text-xs text-[#c2c2cc]">
          Eliminar este negocio borrará permanentemente sus productos, pedidos, configuraciones e historial.
          Esta acción no se puede deshacer.
        </p>
      </div>

      <button
        type="button"
        onClick={() => {
          setIsOpen(true);
          setConfirmationInput("");
          setError(null);
        }}
        className="inline-flex h-9 items-center justify-center rounded-full border border-red-400/40 bg-red-500/15 px-4 text-xs font-medium text-red-200 transition hover:bg-red-500/25"
      >
        Eliminar negocio
      </button>

      {isOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
        >
          <div className="liquid-glass-card w-full max-w-md rounded-3xl p-6 sm:p-7 shadow-2xl space-y-5">
            <div>
              <h4 className="text-lg font-medium tracking-tight text-red-300">¿Estás completamente seguro?</h4>
              <p className="mt-2 text-xs text-[#d4d4dc] leading-relaxed">
                Estás a punto de borrar <strong className="text-[#f4f3f1]">{tenantName}</strong> ({tenantSlug}).
                Se eliminarán de forma definitiva todos los datos asociados, incluyendo catálogo, comandas, turnos de caja y accesos de operadores.
              </p>
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-medium text-[#c2c2cc]">
                Escribí <span className="font-mono text-[#f4f3f1] select-all">{tenantSlug}</span> para confirmar:
              </label>
              <input
                type="text"
                value={confirmationInput}
                onChange={(e) => setConfirmationInput(e.target.value)}
                placeholder={tenantSlug}
                className="w-full rounded-2xl border border-white/15 bg-[#101013] px-3.5 py-2.5 text-sm text-[#f4f3f1] focus:border-red-400 focus:outline-none"
                autoFocus
              />
            </div>

            {error ? (
              <p className="rounded-2xl border border-red-400/30 bg-red-500/10 p-3 text-xs text-red-300">
                {error}
              </p>
            ) : null}

            <div className="flex gap-2.5 justify-end pt-2">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setIsOpen(false)}
                className="inline-flex h-9 items-center justify-center rounded-full border border-white/15 bg-white/[0.05] px-4 text-xs font-medium text-[#f4f3f1] transition hover:bg-white/[0.12] disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={!isConfirmed || isDeleting}
                onClick={handleDelete}
                className="inline-flex h-9 items-center justify-center rounded-full bg-red-500 px-4 text-xs font-medium text-white transition hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {isDeleting ? "Eliminando..." : "Sí, eliminar definitivamente"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
