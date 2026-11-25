"use client";

import { useEffect, useEffectEvent, useRef, useState, useSyncExternalStore } from "react";
import { isMobileBarcodeDevice, readProductBarcode, startProductBarcodeCamera } from "./product-barcode-scan";

const subscribe = () => () => {};
const isMobile = () => isMobileBarcodeDevice(navigator);
const isServerMobile = () => false;
const actionClass = "min-h-12 rounded-lg border border-white/15 px-3 py-2 text-sm font-semibold text-white hover:bg-white/10 active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white";

export function ProductBarcodeScanner({
  itemType,
  onCode,
}: {
  itemType: "unit" | "weighted";
  onCode: (barcode: string) => void;
}) {
  const showScanner = useSyncExternalStore(subscribe, isMobile, isServerMobile);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  if (!showScanner) return null;

  function close() {
    setOpen(false);
    trigger.current?.focus();
  }

  return (
    <div className="space-y-2">
      <button
        ref={trigger}
        type="button"
        aria-expanded={open}
        className={actionClass}
        onClick={() => {
          setError(null);
          if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
            setError("La cámara no está disponible en este navegador. Ingresá el código a mano.");
            return;
          }
          setOpen((previous) => !previous);
        }}
      >
        {open ? "Cerrar cámara" : "Escanear código"}
      </button>
      {error ? <p role="alert" className="text-sm text-amber-200">{error}</p> : null}
      {open ? (
        <BarcodePreview
          onRead={(raw) => {
            const barcode = readProductBarcode(raw, itemType);
            if (barcode !== null) onCode(barcode);
            else setError(itemType === "weighted"
              ? "Ese código no corresponde a una etiqueta de balanza válida. Volvé a escanear o ingresá el PLU a mano."
              : "Ese código no corresponde a un producto por unidad. Volvé a escanear o ingresá el código a mano.");
            close();
          }}
          onError={(cause) => {
            setError(cause instanceof DOMException && cause.name === "NotAllowedError"
              ? "No se pudo acceder a la cámara. Revisá los permisos o ingresá el código a mano."
              : "No pudimos iniciar la cámara. Volvé a intentar o ingresá el código a mano.");
            close();
          }}
        />
      ) : null}
    </div>
  );
}

function BarcodePreview({
  onRead,
  onError,
}: {
  onRead: (raw: string) => void;
  onError: (error: unknown) => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const [ready, setReady] = useState(false);
  const handleRead = useEffectEvent(onRead);
  const handleError = useEffectEvent(onError);

  useEffect(() => {
    if (!video.current) return;
    return startProductBarcodeCamera({
      video: video.current,
      onCode: (value) => handleRead(value),
      onReady: () => setReady(true),
      onError: (error) => handleError(error),
    });
  }, []);

  return (
    <div className="space-y-2">
      <p role="status" className="text-sm text-[#c2c2cc]">
        {ready ? "Apuntá la cámara al código de barras." : "Abriendo la cámara…"}
      </p>
      <video ref={video} playsInline muted className="aspect-video w-full rounded-lg bg-black object-cover" />
    </div>
  );
}
