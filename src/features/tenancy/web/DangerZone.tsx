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
    <div className="rounded-xl border border-red-500/30 bg-red-950/10 p-6 space-y-4">
      <div>
        <h3 className="text-base font-semibold text-red-400">Zona de peligro</h3>
        <p className="mt-1 text-sm text-zinc-400">
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
        className="rounded-md border border-red-500/50 bg-red-600/20 px-4 py-2 text-sm font-semibold text-red-300 transition hover:bg-red-600/30 hover:border-red-500"
      >
        Eliminar negocio
      </button>

      {isOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
        >
          <div className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-900 p-6 shadow-2xl space-y-5">
            <div>
              <h4 className="text-lg font-bold text-red-400">¿Estás completamente seguro?</h4>
              <p className="mt-2 text-sm text-zinc-300 leading-relaxed">
                Estás a punto de borrar <strong className="text-white">{tenantName}</strong> ({tenantSlug}).
                Se eliminarán de forma definitiva todos los datos asociados, incluyendo catálogo, comandas, turnos de caja y accesos de operadores.
              </p>
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-semibold text-zinc-400">
                Escribí <span className="font-mono text-zinc-200 select-all">{tenantSlug}</span> para confirmar:
              </label>
              <input
                type="text"
                value={confirmationInput}
                onChange={(e) => setConfirmationInput(e.target.value)}
                placeholder={tenantSlug}
                className="w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white focus:border-red-500 focus:outline-none"
                autoFocus
              />
            </div>

            {error ? (
              <p className="text-xs text-red-400 bg-red-500/10 p-2.5 rounded border border-red-500/20">
                {error}
              </p>
            ) : null}

            <div className="flex gap-3 justify-end pt-2">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setIsOpen(false)}
                className="rounded-md border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-300 hover:bg-zinc-800 disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={!isConfirmed || isDeleting}
                onClick={handleDelete}
                className="rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-40"
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
