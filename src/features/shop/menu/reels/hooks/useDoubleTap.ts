import { useCallback, useRef } from "react";

export interface UseDoubleTapOptions {
  threshold?: number;
  onSingleTap?: (event: React.SyntheticEvent) => void;
}

export type DoubleTapHandler = (event: React.SyntheticEvent) => void;

export class DoubleTapDetector {
  private threshold: number;
  private lastTap = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  public onDoubleTap: (event: React.SyntheticEvent) => void;
  public onSingleTap?: (event: React.SyntheticEvent) => void;

  constructor(
    onDoubleTap: (event: React.SyntheticEvent) => void,
    options: UseDoubleTapOptions = {}
  ) {
    this.onDoubleTap = onDoubleTap;
    this.threshold = options.threshold ?? 280;
    this.onSingleTap = options.onSingleTap;
  }

  public handleTap(event: React.SyntheticEvent): void {
    const now = Date.now();
    const diff = now - this.lastTap;

    // Ignore synthetic duplicate events within < 40ms (e.g. touchend immediately followed by click)
    if (diff > 0 && diff < 40) {
      return;
    }

    if (diff > 0 && diff <= this.threshold) {
      if (this.timer) {
        clearTimeout(this.timer);
        this.timer = null;
      }
      this.lastTap = 0;
      this.onDoubleTap(event);
    } else {
      this.lastTap = now;
      if (this.onSingleTap) {
        if (this.timer) {
          clearTimeout(this.timer);
        }
        this.timer = setTimeout(() => {
          this.onSingleTap?.(event);
          this.timer = null;
        }, this.threshold);
      }
    }
  }

  public reset(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.lastTap = 0;
  }
}

/**
 * useDoubleTap
 * Detects double tap/click gestures within a calibrated threshold window (default: 280ms).
 * Does not block vertical scroll (pan-y).
 */
export function useDoubleTap(
  callback: (event: React.SyntheticEvent) => void,
  options: UseDoubleTapOptions = {}
): DoubleTapHandler {
  const threshold = options.threshold ?? 280;
  const onSingleTap = options.onSingleTap;
  const lastTapRef = useRef<number>(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  return useCallback(
    (event: React.SyntheticEvent) => {
      const now = Date.now();
      const diff = now - lastTapRef.current;

      // Ignore synthetic duplicate events within < 40ms
      if (diff > 0 && diff < 40) {
        return;
      }

      if (diff > 0 && diff <= threshold) {
        if (timerRef.current) {
          clearTimeout(timerRef.current);
          timerRef.current = null;
        }
        lastTapRef.current = 0;
        callback(event);
      } else {
        lastTapRef.current = now;
        if (onSingleTap) {
          if (timerRef.current) {
            clearTimeout(timerRef.current);
          }
          timerRef.current = setTimeout(() => {
            onSingleTap(event);
            timerRef.current = null;
          }, threshold);
        }
      }
    },
    [callback, onSingleTap, threshold]
  );
}
