import { isScaleEan13Prefix, parseScaleEan13 } from "@/features/catalog/domain/catalog.rules";

export function isMobileBarcodeDevice(device: { userAgent: string; maxTouchPoints: number }) {
  return /Android|iPhone|iPad|iPod/i.test(device.userAgent) ||
    (/Macintosh/i.test(device.userAgent) && device.maxTouchPoints > 1);
}

export function readProductBarcode(raw: string, itemType: "unit" | "weighted") {
  const value = raw.trim();
  if (itemType === "weighted") {
    const scale = parseScaleEan13(value);
    return scale && scale.pluCode !== "00000" ? scale.pluCode : null;
  }
  return value && value.length <= 64 && !isScaleEan13Prefix(value) ? value : null;
}

export function startProductBarcodeCamera({
  video,
  onCode,
  onReady,
  onError,
}: {
  video: HTMLVideoElement;
  onCode: (code: string) => void;
  onReady: () => void;
  onError: (error: unknown) => void;
}) {
  let active = true;
  let stream: MediaStream | undefined;
  let scanner: { stop: () => void } | undefined;

  function stop() {
    if (!active) return;
    active = false;
    scanner?.stop();
    stream?.getTracks().forEach((track) => track.stop());
    video.srcObject = null;
  }

  async function scan() {
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: "environment" } },
      });
      if (!active) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      const [{ BrowserMultiFormatOneDReader }, { BarcodeFormat, DecodeHintType }] = await Promise.all([
        import("@zxing/browser"),
        import("@zxing/library"),
      ]);
      if (!active) return;
      const reader = new BrowserMultiFormatOneDReader(new Map([
        [DecodeHintType.POSSIBLE_FORMATS, [
          BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A,
          BarcodeFormat.UPC_E, BarcodeFormat.CODE_128, BarcodeFormat.CODE_39, BarcodeFormat.ITF,
        ]],
      ]));
      const controls = await reader.decodeFromStream(stream, video, (result) => {
        if (!active || !result) return;
        const code = result.getText();
        stop();
        onCode(code);
      });
      if (!active) {
        controls.stop();
      } else {
        scanner = controls;
        onReady();
      }
    } catch (error) {
      if (!active) return;
      stop();
      onError(error);
    }
  }

  void scan();
  return stop;
}
