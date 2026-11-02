"use client";

import { useEffect, useRef, type RefObject } from "react";

// 4x4 Bayer ordered dithering matrix from atlasum.net
const BAYER_4X4 = [
  0, 8, 2, 10,
  12, 4, 14, 6,
  3, 11, 1, 9,
  15, 7, 13, 5,
] as const;

const TWO_PI = Math.PI * 2;

/**
 * Renders the procedural Warp + 4x4 Bayer-dithered dot matrix animation
 * from atlasum.net (pure dots, no ASCII symbols), tuned to the graphite & warm-stone palette.
 */
export function AsciiVideoOverlay({
  videoRef: _videoRef,
}: {
  videoRef: RefObject<HTMLVideoElement | null>;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const context = canvas.getContext("2d");
    if (!context) return;

    const motionPreference = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    );

    let width = 0;
    let height = 0;
    let columns = 0;
    let rows = 0;
    let cellSize = 5;
    let frame = 0;
    let lastPaint = -Infinity;

    const resize = () => {
      const bounds = canvas.getBoundingClientRect();
      width = Math.max(1, bounds.width);
      height = Math.max(1, bounds.height);
      const ratio = Math.min(window.devicePixelRatio || 1, 1.5);
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);

      cellSize = width < 768 ? 5 : 6;
      columns = Math.max(1, Math.floor(width / cellSize));
      rows = Math.max(1, Math.floor(height / cellSize));
      lastPaint = -Infinity;
    };

    const paint = (time: number) => {
      frame = 0;
      if (document.hidden) return;
      if (!motionPreference.matches) {
        frame = window.requestAnimationFrame(paint);
      }

      if (time - lastPaint < 1000 / 40) return;
      lastPaint = time;

      if (!width || !height) return;

      // Fast, fluid warp time progression
      const t = time * 0.00055;

      context.fillStyle = "#141416";
      context.fillRect(0, 0, width, height);

      const cellWidth = width / columns;
      const cellHeight = height / rows;
      const dotRadius = Math.max(1.15, Math.min(cellWidth, cellHeight) * 0.34);
      const halfCols = columns * 0.5;
      const halfRows = rows * 0.5;
      const uvScale = cellSize * 0.0032;

      for (let y = 0; y < rows; y++) {
        const cy = (y + 0.5) * cellHeight;
        const ny = (y - halfRows) / Math.max(1, halfRows);
        const bayerRow = (y & 3) * 4;
        const isAmbientRow = (y & 3) === 0;
        const baseUy = (y - halfRows) * uvScale;

        for (let x = 0; x < columns; x++) {
          const cx = (x + 0.5) * cellWidth;
          const nx = (x - halfCols) / Math.max(1, halfCols);

          // Elliptical radial mask matching atlasum.net hero mask
          const radialDist = Math.sqrt(nx * nx * 0.85 + ny * ny * 0.95);
          if (radialDist >= 1.05) {
            if (isAmbientRow && (x & 3) === 0) {
              context.fillStyle = "rgba(244, 243, 241, 0.05)";
              context.beginPath();
              context.arc(cx, cy, 0.85, 0, TWO_PI);
              context.fill();
            }
            continue;
          }

          const rawMask =
            radialDist <= 0.36
              ? 1
              : Math.max(0, 1 - (radialDist - 0.36) / 0.69);
          const vignette = rawMask * rawMask * (3 - 2 * rawMask);

          // Procedural warp field from atlasum.net Dithering shader (shape = "warp")
          let ux = (x - halfCols) * uvScale;
          let uy = baseUy;
          for (let i = 1; i < 6; i++) {
            const nextX = ux + (0.6 / i) * Math.cos(i * 2.5 * uy + t);
            const nextY = uy + (0.6 / i) * Math.cos(i * 1.5 * ux + t);
            ux = nextX;
            uy = nextY;
          }

          const rawWave =
            0.15 / Math.max(0.001, Math.abs(Math.sin(t - uy - ux)));
          const clampedWave = Math.max(
            0,
            Math.min(1, (rawWave - 0.02) / 0.98),
          );
          const shape = clampedWave * clampedWave * (3 - 2 * clampedWave);

          // 4x4 Bayer ordered dithering threshold
          const bayer = (BAYER_4X4[bayerRow + (x & 3)] ?? 0) / 16 - 0.5;
          const dithered = shape + bayer;

          if (dithered < 0.5) {
            if (isAmbientRow && (x & 3) === 0) {
              context.fillStyle = "rgba(244, 243, 241, 0.06)";
              context.beginPath();
              context.arc(cx, cy, 0.85, 0, TWO_PI);
              context.fill();
            }
            continue;
          }

          const alpha = Math.min(0.62, (0.22 + shape * 0.44) * vignette);
          if (alpha < 0.04) continue;

          context.fillStyle = `rgba(244, 243, 241, ${alpha})`;
          context.beginPath();
          context.arc(cx, cy, dotRadius, 0, TWO_PI);
          context.fill();
        }
      }
    };

    const sync = () => {
      window.cancelAnimationFrame(frame);
      frame = 0;
      if (!document.hidden) {
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
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-10 h-full w-full opacity-100"
    />
  );
}
