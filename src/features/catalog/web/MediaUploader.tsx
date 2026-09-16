"use client";

import { useRef, useState } from "react";
import {
  catalogFetch,
  CatalogRequestError,
} from "@/features/catalog/web/catalog-client";

type CompletedMedia = {
  assetId: string;
  publicUrl: string | null;
  status: string;
};

type Props = {
  tenantId: string;
  kind: "image" | "video";
  value: { assetId: string | null; publicUrl: string | null };
  onChange: (value: {
    assetId: string | null;
    publicUrl: string | null;
  }) => void;
  disabled?: boolean;
};

async function checksum(file: File) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    await file.arrayBuffer(),
  );
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function MediaUploader({
  tenantId,
  kind,
  value,
  onChange,
  disabled,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const accept =
    kind === "image"
      ? "image/jpeg,image/png,image/webp"
      : "video/mp4,video/webm";
  const label = kind === "image" ? "Imagen" : "Video corto";

  async function upload(file: File) {
    setBusy(true);
    setError(null);
    try {
      const result = await catalogFetch<{
        assetId: string;
        uploadUrl: string;
        requiredHeaders: Record<string, string>;
      }>(`/api/v1/tenants/${tenantId}/media/uploads`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileName: file.name,
          mimeType: file.type,
          byteSize: file.size,
          checksumSha256: await checksum(file),
        }),
      });

      const put = await fetch(result.uploadUrl, {
        method: "PUT",
        headers: result.requiredHeaders,
        body: file,
      });
      if (!put.ok)
        throw new Error("No se pudo transferir el archivo al almacenamiento.");

      const completed = await catalogFetch<CompletedMedia>(
        `/api/v1/tenants/${tenantId}/media/${result.assetId}/complete`,
        { method: "POST" },
      );
      onChange({ assetId: completed.assetId, publicUrl: completed.publicUrl });
    } catch (cause) {
      setError(
        cause instanceof CatalogRequestError || cause instanceof Error
          ? cause.message
          : "No se pudo subir el archivo.",
      );
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-semibold text-zinc-200">{label}</span>
        {value.assetId ? (
          <button
            type="button"
            disabled={disabled || busy}
            onClick={() => onChange({ assetId: null, publicUrl: null })}
            className="text-xs font-semibold text-[var(--color-accent-tertiary)] hover:opacity-80 disabled:opacity-40"
          >
            Quitar
          </button>
        ) : null}
      </div>
      {value.publicUrl ? (
        kind === "image" ? (
          <img
            src={value.publicUrl}
            alt="Vista previa"
            className="h-32 w-full rounded-lg object-cover"
          />
        ) : (
          <video
            src={value.publicUrl}
            controls
            muted
            className="h-32 w-full rounded-lg object-cover"
          />
        )
      ) : (
        <button
          type="button"
          disabled={disabled || busy}
          onClick={() => inputRef.current?.click()}
          className="flex h-24 w-full items-center justify-center rounded-lg border border-dashed border-zinc-700 bg-zinc-950 text-sm text-zinc-400 transition hover:border-[var(--color-accent-tertiary)] hover:text-[var(--color-accent-tertiary)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy
            ? "Subiendo..."
            : `Seleccionar ${kind === "image" ? "imagen" : "video"}`}
        </button>
      )}
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        disabled={disabled || busy}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void upload(file);
        }}
      />
      <p className="text-xs text-zinc-500">
        {kind === "image"
          ? "JPG, PNG o WebP. Máximo 10 MB."
          : "MP4 o WebM. Máximo 50 MB."}
      </p>
      {error ? (
        <p className="text-xs text-[var(--color-accent-tertiary)]">{error}</p>
      ) : null}
    </div>
  );
}
