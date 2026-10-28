"use client";

import { useEffect, useRef, type RefObject } from "react";

const GLYPHS = " .:-=+*#%@";

/**
 * Renders the background logo video as a continuously animated ASCII canvas.
 */
export function AsciiVideoOverlay({
  videoRef,
}: {
  videoRef: RefObject<HTMLVideoElement | null>;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;

    const context = canvas.getContext("2d");
    const sample = document.createElement("canvas");
    const pixels = sample.getContext("2d", { willReadFrequently: true });
    if (!context || !pixels) return;

    const posterImage = new window.Image();
    posterImage.decoding = "async";
    posterImage.src = "/videos/directory-bg-poster.webp";

    let width = 0;
    let height = 0;
    let columns = 0;
    let rows = 0;
    let cellSize = 11;
    let frame = 0;
    let lastPaint = -Infinity;
    let failed = false;

    const resize = () => {
      const bounds = canvas.getBoundingClientRect();
      width = Math.max(1, bounds.width);
      height = Math.max(1, bounds.height);
      const ratio = Math.min(window.devicePixelRatio || 1, 1.5);
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);

      cellSize = width < 768 ? 9 : 11;
      columns = Math.max(1, Math.min(180, Math.floor(width / cellSize)));
      rows = Math.max(1, Math.min(110, Math.floor(height / cellSize)));
      sample.width = columns;
      sample.height = rows;

      context.font = `700 ${Math.round(cellSize * 1.05)}px "Geist Mono", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
      context.textAlign = "center";
      context.textBaseline = "middle";
      lastPaint = -Infinity;
    };

    const paint = (time: number) => {
      frame = 0;
      if (failed || document.hidden) return;
      frame = window.requestAnimationFrame(paint);

      if (time - lastPaint < 1000 / 24) return;
      lastPaint = time;

      if (!width || !height) return;

      const hasVideoFrame =
        video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0;
      const hasPosterFrame =
        posterImage.complete &&
        posterImage.naturalWidth > 0 &&
        posterImage.naturalHeight > 0;

      if (!hasVideoFrame && !hasPosterFrame) return;

      const sourceWidth = hasVideoFrame
        ? video.videoWidth
        : posterImage.naturalWidth;
      const sourceHeight = hasVideoFrame
        ? video.videoHeight
        : posterImage.naturalHeight;
      const sourceElement = hasVideoFrame ? video : posterImage;

      const scale = Math.max(width / sourceWidth, height / sourceHeight);
      const cropWidth = width / scale;
      const cropHeight = height / scale;

      try {
        pixels.drawImage(
          sourceElement,
          (sourceWidth - cropWidth) / 2,
          (sourceHeight - cropHeight) / 2,
          cropWidth,
          cropHeight,
          0,
          0,
          columns,
          rows,
        );
        const data = pixels.getImageData(0, 0, columns, rows).data;

        context.fillStyle = "#050508";
        context.fillRect(0, 0, width, height);

        const cellWidth = width / columns;
        const cellHeight = height / rows;

        for (let y = 0; y < rows; y++) {
          const cy = (y + 0.5) * cellHeight;
          for (let x = 0; x < columns; x++) {
            const offset = (y * columns + x) * 4;
            const r = data[offset] ?? 0;
            const g = data[offset + 1] ?? 0;
            const b = data[offset + 2] ?? 0;

            const luminance = (r * 0.2126 + g * 0.7152 + b * 0.0722) / 255;
            if (luminance < 0.012) continue;

            const boosted = Math.min(1, Math.pow(luminance, 0.5) * 1.28);
            const glyphIndex = Math.min(
              GLYPHS.length - 1,
              Math.max(1, Math.floor(boosted * GLYPHS.length)),
            );
            const glyph = GLYPHS[glyphIndex];
            if (!glyph || glyph === " ") continue;

            const cr = Math.min(255, Math.round(r * 1.4 + 80));
            const cg = Math.min(255, Math.round(g * 1.4 + 85));
            const cb = Math.min(255, Math.round(b * 1.4 + 95));

            context.fillStyle = `rgb(${cr} ${cg} ${cb})`;
            context.fillText(glyph, (x + 0.5) * cellWidth, cy);
          }
        }
      } catch {
        failed = true;
        window.cancelAnimationFrame(frame);
      }
    };

    const sync = () => {
      window.cancelAnimationFrame(frame);
      frame = 0;
      if (!document.hidden && !failed) {
        frame = window.requestAnimationFrame(paint);
      }
    };

    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();
    sync();

    document.addEventListener("visibilitychange", sync);
    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
      document.removeEventListener("visibilitychange", sync);
    };
  }, [videoRef]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-10 h-full w-full opacity-100"
    />
  );
}
