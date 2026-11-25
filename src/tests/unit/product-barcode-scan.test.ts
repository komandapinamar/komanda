import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  isMobileBarcodeDevice,
  readProductBarcode,
  startProductBarcodeCamera,
} from "@/features/catalog/web/product-barcode-scan";

const { decodeFromStream } = vi.hoisted(() => ({ decodeFromStream: vi.fn() }));
vi.mock("@zxing/browser", () => ({
  BrowserMultiFormatOneDReader: class { decodeFromStream = decodeFromStream; },
}));

describe("Express Retail barcode scanning", () => {
  it("recognizes mobile devices without treating a small desktop viewport as mobile", () => {
    expect(isMobileBarcodeDevice({ userAgent: "iPhone", maxTouchPoints: 5 })).toBe(true);
    expect(isMobileBarcodeDevice({ userAgent: "Android", maxTouchPoints: 5 })).toBe(true);
    expect(isMobileBarcodeDevice({ userAgent: "Macintosh", maxTouchPoints: 5 })).toBe(true);
    expect(isMobileBarcodeDevice({ userAgent: "Macintosh", maxTouchPoints: 0 })).toBe(false);
    expect(isMobileBarcodeDevice({ userAgent: "Windows", maxTouchPoints: 1 })).toBe(false);
  });

  it("preserves codes as strings and keeps only the PLU from a valid scale label", () => {
    expect(readProductBarcode(" 0012345678905 ", "unit")).toBe("0012345678905");
    expect(readProductBarcode("2000123024509", "weighted")).toBe("00123");
    expect(readProductBarcode("2000123024509", "unit")).toBeNull();
    expect(readProductBarcode("2000123024500", "weighted")).toBeNull();
    expect(readProductBarcode("0012345678905", "weighted")).toBeNull();
  });
});

describe("product scanner camera lifecycle", () => {
  const getUserMedia = vi.fn();
  const stopTrack = vi.fn();
  const stopReader = vi.fn();
  const stream = { getTracks: () => [{ stop: stopTrack }] };
  const onCode = vi.fn();
  const onReady = vi.fn();
  const onError = vi.fn();
  const video = { srcObject: null } as HTMLVideoElement;

  beforeEach(() => {
    vi.resetAllMocks();
    getUserMedia.mockResolvedValue(stream);
    decodeFromStream.mockResolvedValue({ stop: stopReader });
    vi.stubGlobal("navigator", { mediaDevices: { getUserMedia } });
  });

  afterEach(() => vi.unstubAllGlobals());

  it("requests the rear camera and stops it on the first result", async () => {
    const dispose = startProductBarcodeCamera({ video, onCode, onReady, onError });
    await vi.waitFor(() => expect(onReady).toHaveBeenCalledOnce());
    expect(getUserMedia).toHaveBeenCalledWith({
      audio: false, video: { facingMode: { ideal: "environment" } },
    });
    const callback = decodeFromStream.mock.calls[0][2];
    callback({ getText: () => "0012345678905" });
    callback({ getText: () => "0012345678905" });
    dispose();
    expect(onCode).toHaveBeenCalledExactlyOnceWith("0012345678905");
    expect(stopTrack).toHaveBeenCalledOnce();
    expect(stopReader).toHaveBeenCalledOnce();
  });

  it("stops a stream when permission finishes after the scanner has closed", async () => {
    let grant!: (value: typeof stream) => void;
    getUserMedia.mockImplementation(() => new Promise((resolve) => { grant = resolve; }));
    startProductBarcodeCamera({ video, onCode, onReady, onError })();
    grant(stream);
    await vi.waitFor(() => expect(stopTrack).toHaveBeenCalledOnce());
    expect(decodeFromStream).not.toHaveBeenCalled();
    expect(onCode).not.toHaveBeenCalled();
  });

  it("reports a rejected permission request without trying to decode", async () => {
    const error = new DOMException("Denied", "NotAllowedError");
    getUserMedia.mockRejectedValue(error);
    const dispose = startProductBarcodeCamera({ video, onCode, onReady, onError });
    await vi.waitFor(() => expect(onError).toHaveBeenCalledExactlyOnceWith(error));
    dispose();
    expect(decodeFromStream).not.toHaveBeenCalled();
    expect(onCode).not.toHaveBeenCalled();
  });
});
