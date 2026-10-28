"use client";

import { useEffect, useRef, type RefObject } from "react";

const GLYPHS = " .:-=+*#%@";

/**
 * Renders the background logo video as a live animated ASCII canvas.
 * Time drives the continuous animation; scroll position drives the crossfade blend.
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

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let width = 0;
    let height = 0;
    let columns = 0;
    let rows = 0;
    let cellSize = 10;
    let frame = 0;
    let lastPaint = -Infinity;
    let failed = false;

    const getScrollY = () =>
      Math.max(
        window.scrollY,
        document.documentElement.scrollTop,
        document.body.scrollTop,
      );

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

      context.font = `600 ${cellSize}px "Geist Mono", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
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

      const scrollY = getScrollY();
      const rawProgress = Math.min(
        1,
        Math.max(0, scrollY / Math.max(1, height * 0.45)),
      );
      const blend = rawProgress * rawProgress * (3 - 2 * rawProgress);

      if (blend <= 0.01 || !width || !height) {
        canvas.style.opacity = "0";
        return;
      }

      const hasVideoFrame =
        video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0;
      const hasPosterFrame =
        posterImage.complete &&
        posterImage.naturalWidth > 0 &&
        posterImage.naturalHeight > 0;

      if (!hasVideoFrame && !hasPosterFrame) {
        canvas.style.opacity = "0";
        return;
      }

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

        context.fillStyle = "#08080a";
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
            if (luminance < 0.04) continue;

            const boosted = Math.min(1, Math.pow(luminance, 0.78) * 1.15);
            const glyphIndex = Math.min(
              GLYPHS.length - 1,
              Math.floor(boosted * GLYPHS.length),
            );
            const glyph = GLYPHS[glyphIndex];
            if (!glyph || glyph === " ") continue;

            const lift = 35;
            const cr = Math.min(255, r + lift);
            const cg = Math.min(255, g + lift);
            const cb = Math.min(255, b + lift);

            context.fillStyle = `rgb(${cr} ${cg} ${cb})`;
            context.fillText(glyph, (x + 0.5) * cellWidth, cy, cellWidth);
          }
        }

        canvas.style.opacity = String(blend);
      } catch {
        failed = true;
        canvas.style.opacity = "0";
        window.cancelAnimationFrame(frame);
      }
    };

    const sync = () => {
      window.cancelAnimationFrame(frame);
      frame = 0;
      if (document.hidden || reducedMotion.matches) {
        canvas.style.opacity = "0";
      } else if (!failed) {
        frame = window.requestAnimationFrame(paint);
      }
    };

    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();
    sync();

    document.addEventListener("visibilitychange", sync);
    reducedMotion.addEventListener("change", sync);
    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
      document.removeEventListener("visibilitychange", sync);
      reducedMotion.removeEventListener("change", sync);
    };
  }, [videoRef]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 h-full w-full opacity-0 transition-opacity duration-150"
    />
  );
}
