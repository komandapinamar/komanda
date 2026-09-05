"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface ReelMeta {
  reelId: string;
  categoryId?: string;
  index: number;
  videoElement: HTMLVideoElement | null;
}

export interface UseReelsMediaLifecycleOptions {
  threshold?: number;
  initialCategoryId?: string | null;
  onActiveCategoryChange?: (categoryId: string) => void;
  onActiveReelChange?: (reelId: string) => void;
}

export interface UseReelsMediaLifecycleReturn {
  activeReelId: string | null;
  activeCategoryId: string | null;
  registerReelElement: (
    reelId: string,
    element: HTMLElement | null,
    meta?: { categoryId?: string; index?: number }
  ) => void;
  registerVideoElement: (
    reelId: string,
    element: HTMLVideoElement | null
  ) => void;
  setActiveCategoryId: (categoryId: string) => void;
}

export class ReelsMediaLifecycleManager {
  private threshold: number;
  private elementToMetaMap = new Map<HTMLElement, ReelMeta>();
  private reelIdToElementMap = new Map<string, HTMLElement>();
  private reelIdToVideoMap = new Map<string, HTMLVideoElement>();
  private observer: IntersectionObserver | null = null;
  public onActiveReelChange?: (reelId: string) => void;
  public onActiveCategoryChange?: (categoryId: string) => void;

  constructor(options?: {
    threshold?: number;
    onActiveReelChange?: (reelId: string) => void;
    onActiveCategoryChange?: (categoryId: string) => void;
  }) {
    this.threshold = options?.threshold ?? 0.6;
    this.onActiveReelChange = options?.onActiveReelChange;
    this.onActiveCategoryChange = options?.onActiveCategoryChange;
  }

  public registerReelElement(
    reelId: string,
    element: HTMLElement | null,
    meta?: { categoryId?: string; index?: number }
  ): void {
    const existingElement = this.reelIdToElementMap.get(reelId);
    if (existingElement && existingElement !== element) {
      if (this.observer) {
        this.observer.unobserve(existingElement);
      }
      this.elementToMetaMap.delete(existingElement);
      this.reelIdToElementMap.delete(reelId);
    }

    if (!element) {
      return;
    }

    const videoElement = this.reelIdToVideoMap.get(reelId) ?? null;
    const reelMeta: ReelMeta = {
      reelId,
      categoryId: meta?.categoryId,
      index: meta?.index ?? 0,
      videoElement,
    };

    this.elementToMetaMap.set(element, reelMeta);
    this.reelIdToElementMap.set(reelId, element);

    if (this.observer) {
      this.observer.observe(element);
    }
  }

  public registerVideoElement(
    reelId: string,
    element: HTMLVideoElement | null
  ): void {
    if (element) {
      this.reelIdToVideoMap.set(reelId, element);
    } else {
      this.reelIdToVideoMap.delete(reelId);
    }

    const reelElement = this.reelIdToElementMap.get(reelId);
    if (reelElement) {
      const meta = this.elementToMetaMap.get(reelElement);
      if (meta) {
        meta.videoElement = element;
      }
    }
  }

  public connect(): () => void {
    if (
      typeof window === "undefined" ||
      typeof IntersectionObserver === "undefined"
    ) {
      return () => {};
    }

    const observer = new IntersectionObserver(
      (entries) => {
        this.handleIntersectionEntries(entries);
      },
      {
        threshold: [0.1, this.threshold],
      }
    );

    this.observer = observer;

    for (const el of this.elementToMetaMap.keys()) {
      observer.observe(el);
    }

    return () => {
      this.disconnect();
    };
  }

  public handleIntersectionEntries(
    entries: Partial<IntersectionObserverEntry>[]
  ): void {
    for (const entry of entries) {
      const target = entry.target as HTMLElement;
      const meta = this.elementToMetaMap.get(target);
      if (!meta) continue;

      const isOverThreshold =
        Boolean(entry.isIntersecting) &&
        (entry.intersectionRatio ?? 0) >= this.threshold;

      if (isOverThreshold) {
        this.onActiveReelChange?.(meta.reelId);

        if (meta.categoryId) {
          this.onActiveCategoryChange?.(meta.categoryId);
        }

        // Play active video
        if (meta.videoElement) {
          const playPromise = meta.videoElement.play();
          if (playPromise !== undefined) {
            playPromise.catch(() => {
              // Ignore autoplay policy or abort errors
            });
          }
        }

        // Preload next adjacent video (index + 1)
        const nextIndex = meta.index + 1;
        for (const itemMeta of this.elementToMetaMap.values()) {
          if (itemMeta.index === nextIndex && itemMeta.videoElement) {
            itemMeta.videoElement.preload = "metadata";
            break;
          }
        }
      } else if ((entry.intersectionRatio ?? 0) < this.threshold) {
        // Leaving threshold: pause and rewind
        if (meta.videoElement) {
          meta.videoElement.pause();
          try {
            meta.videoElement.currentTime = 0;
          } catch {
            // Ignore DOMException if metadata not loaded
          }
        }
      }
    }
  }

  public disconnect(): void {
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
  }
}

export function useReelsMediaLifecycle(
  options?: UseReelsMediaLifecycleOptions
): UseReelsMediaLifecycleReturn {
  const [activeReelId, setActiveReelId] = useState<string | null>(null);
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(
    options?.initialCategoryId ?? null
  );

  const managerRef = useRef<ReelsMediaLifecycleManager | null>(null);
  if (managerRef.current == null) {
    managerRef.current = new ReelsMediaLifecycleManager({
      threshold: options?.threshold ?? 0.6,
    });
  }

  useEffect(() => {
    if (managerRef.current) {
      managerRef.current.onActiveReelChange = (reelId) => {
        setActiveReelId(reelId);
        options?.onActiveReelChange?.(reelId);
      };
      managerRef.current.onActiveCategoryChange = (categoryId) => {
        setActiveCategoryId(categoryId);
        options?.onActiveCategoryChange?.(categoryId);
      };
    }
  });

  const registerReelElement = useCallback(
    (
      reelId: string,
      element: HTMLElement | null,
      meta?: { categoryId?: string; index?: number }
    ) => {
      managerRef.current?.registerReelElement(reelId, element, meta);
    },
    []
  );

  const registerVideoElement = useCallback(
    (reelId: string, element: HTMLVideoElement | null) => {
      managerRef.current?.registerVideoElement(reelId, element);
    },
    []
  );

  useEffect(() => {
    return managerRef.current?.connect();
  }, []);

  return {
    activeReelId,
    activeCategoryId,
    registerReelElement,
    registerVideoElement,
    setActiveCategoryId,
  };
}
