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
    <div className="space-y-4 rounded-2xl border border-red-500/30 bg-background-secondary-default p-6 shadow-card sm:p-7">
      <div>
        <h3 className="text-title-3-semibold text-status-rose-text">Zona de peligro</h3>
        <p className="mt-1 text-body-2-regular text-text-secondary">
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
        className="bg-button-danger button-press-motion inline-flex h-9 items-center justify-center rounded-2lg px-4 text-body-medium text-text-white shadow-xs cursor-pointer"
      >
        Eliminar negocio
      </button>

      {isOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
        >
          <div className="w-full max-w-md space-y-5 rounded-2xl border border-border-component-detail-container bg-background-secondary-default p-6 shadow-xl sm:p-7">
            <div>
              <h4 className="text-title-3-semibold text-status-rose-text">¿Estás completamente seguro?</h4>
              <p className="mt-2 text-body-2-regular leading-relaxed text-text-secondary">
                Estás a punto de borrar <strong className="text-text-primary">{tenantName}</strong> ({tenantSlug}).
                Se eliminarán de forma definitiva todos los datos asociados, incluyendo catálogo, comandas, turnos de caja y accesos de operadores.
              </p>
            </div>

            <div className="space-y-2">
              <label className="block text-body-2-medium text-text-secondary">
                Escribí <span className="select-all font-mono text-text-primary">{tenantSlug}</span> para confirmar:
              </label>
              <input
                type="text"
                value={confirmationInput}
                onChange={(e) => setConfirmationInput(e.target.value)}
                placeholder={tenantSlug}
                className="w-full px-3.5 py-2 text-body-regular"
                autoFocus
              />
            </div>

            {error ? (
              <p className="rounded-2lg border border-red-500/30 bg-status-rose-background p-3 text-body-2-medium text-status-rose-text">
                {error}
              </p>
            ) : null}

            <div className="flex justify-end gap-2.5 pt-2">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setIsOpen(false)}
                className="inline-flex h-9 cursor-pointer items-center justify-center rounded-2lg border border-border-button-default bg-background-primary-default px-4 text-body-medium text-text-primary transition hover:bg-background-primary-hover disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={!isConfirmed || isDeleting}
                onClick={handleDelete}
                className="bg-button-danger button-press-motion inline-flex h-9 cursor-pointer items-center justify-center rounded-2lg px-4 text-body-medium text-text-white shadow-xs disabled:cursor-not-allowed disabled:opacity-40"
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
