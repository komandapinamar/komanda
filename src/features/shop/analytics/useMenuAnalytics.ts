"use client";

import { useEffect, useRef } from "react";
import type { TelemetryItemEvent } from "@/features/analytics/domain/analytics.schemas";

function getOrCreateSessionKey(): string {
  if (typeof window === "undefined") return "";
  const STORAGE_KEY = "komanda_menu_session_key";
  let key = sessionStorage.getItem(STORAGE_KEY);
  if (!key) {
    key = `s_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    sessionStorage.setItem(STORAGE_KEY, key);
  }
  return key;
}

function getDeviceType(): "mobile" | "tablet" | "desktop" {
  if (typeof window === "undefined") return "desktop";
  const width = window.innerWidth;
  if (width < 768) return "mobile";
  if (width < 1024) return "tablet";
  return "desktop";
}

function detectSurface(): "classic" | "reels" {
  if (typeof document === "undefined") return "classic";
  if (
    document.querySelector('[data-testid="reels-menu-view"]') ||
    document.querySelector('[data-testid="reel-item"]')
  ) {
    return "reels";
  }
  return "classic";
}

type ExposureTracker = {
  itemId: string;
  exposureId: string;
  startTime: number;
  impressionSent: boolean;
  qualifiedViewSent: boolean;
};

export function useMenuAnalytics(tenantSlug: string) {
  const dwellTimeRef = useRef(0);
  const categoryDwellRef = useRef<Record<string, number>>({});
  const itemViewsMapRef = useRef<Record<string, number>>({});
  const activeCategoryRef = useRef<string | null>(null);
  const isVisibleRef = useRef(true);
  const lastSyncDwellRef = useRef(0);

  const pendingEventsRef = useRef<TelemetryItemEvent[]>([]);
  const activeExposuresRef = useRef<Map<string, ExposureTracker>>(new Map());

  useEffect(() => {
    if (!tenantSlug) return;
    const sessionKey = getOrCreateSessionKey();
    const deviceType = getDeviceType();

    const flushBatchEvents = (isFinal = false) => {
      if (pendingEventsRef.current.length === 0) return;
      const eventsToSend = pendingEventsRef.current.splice(0, 50);

      const payload = JSON.stringify({
        sessionId: sessionKey,
        events: eventsToSend,
      });

      const url = `/api/v1/storefronts/${encodeURIComponent(tenantSlug)}/analytics/events`;

      if (isFinal && typeof navigator !== "undefined" && navigator.sendBeacon) {
        const blob = new Blob([payload], { type: "application/json" });
        navigator.sendBeacon(url, blob);
      } else {
        fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: payload,
          keepalive: isFinal,
        }).catch(() => {
          // Non-blocking telemetry
        });
      }
    };

    const sendSessionSummary = (isFinal = false) => {
      if (!isFinal && dwellTimeRef.current === lastSyncDwellRef.current) return;
      lastSyncDwellRef.current = dwellTimeRef.current;

      const payload = JSON.stringify({
        sessionKey,
        deviceType,
        dwellTimeSeconds: Math.floor(dwellTimeRef.current),
        categoryDwellMap: Object.fromEntries(
          Object.entries(categoryDwellRef.current).map(([k, v]) => [
            k,
            Math.floor(v),
          ]),
        ),
        itemViewsMap: { ...itemViewsMapRef.current },
        cartCreated: false,
        orderPlaced: false,
      });

      const url = `/api/v1/storefronts/${encodeURIComponent(tenantSlug)}/analytics/events`;

      if (isFinal && typeof navigator !== "undefined" && navigator.sendBeacon) {
        const blob = new Blob([payload], { type: "application/json" });
        navigator.sendBeacon(url, blob);
      } else {
        fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: payload,
          keepalive: isFinal,
        }).catch(() => {
          // Non-blocking telemetry
        });
      }
    };

    const queueEvent = (event: TelemetryItemEvent) => {
      pendingEventsRef.current.push(event);
      if (pendingEventsRef.current.length >= 20) {
        flushBatchEvents(false);
      }
    };

    // Item Visibility Checker loop (every 200ms)
    const exposureCheckInterval = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      const now = Date.now();
      const surface = detectSurface();

      activeExposuresRef.current.forEach((tracker) => {
        const elapsed = now - tracker.startTime;

        // Impression: >= 500ms
        if (elapsed >= 500 && !tracker.impressionSent) {
          tracker.impressionSent = true;
          queueEvent({
            itemId: tracker.itemId,
            surface,
            eventType: "impression",
            dwellDurationMs: 500,
            exposureId: tracker.exposureId,
            occurredAt: new Date().toISOString(),
          });
        }

        // Qualified view: >= 1000ms (1s)
        if (elapsed >= 1000 && !tracker.qualifiedViewSent) {
          tracker.qualifiedViewSent = true;
          itemViewsMapRef.current[tracker.itemId] =
            (itemViewsMapRef.current[tracker.itemId] || 0) + 1;
          queueEvent({
            itemId: tracker.itemId,
            surface,
            eventType: "qualified_view",
            dwellDurationMs: 1000,
            exposureId: tracker.exposureId,
            occurredAt: new Date().toISOString(),
          });
        }
      });
    }, 200);

    // Active timer loop (every second)
    const dwellInterval = setInterval(() => {
      if (document.visibilityState === "visible") {
        dwellTimeRef.current += 1;
        if (activeCategoryRef.current) {
          categoryDwellRef.current[activeCategoryRef.current] =
            (categoryDwellRef.current[activeCategoryRef.current] || 0) + 1;
        }
      }
    }, 1000);

    // Periodic synchronization
    const syncInterval = setInterval(() => {
      flushBatchEvents(false);
      sendSessionSummary(false);
    }, 12000);

    // Cart addition listener
    const handleCartAdd = (event: Event) => {
      const customEvent = event as CustomEvent<{ itemId: string }>;
      const itemId = customEvent.detail?.itemId;
      if (itemId) {
        queueEvent({
          itemId,
          surface: detectSurface(),
          eventType: "cart_add",
          dwellDurationMs: 0,
          occurredAt: new Date().toISOString(),
        });
        flushBatchEvents(false);
      }
    };
    window.addEventListener("komanda:cart_add", handleCartAdd);

    // Visibility listener
    const handleVisibilityChange = () => {
      isVisibleRef.current = document.visibilityState === "visible";
      if (!isVisibleRef.current) {
        flushBatchEvents(false);
        sendSessionSummary(false);
      }
    };

    // Unload / pagehide listener
    const handlePageHide = () => {
      flushBatchEvents(true);
      sendSessionSummary(true);
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("pagehide", handlePageHide);
    window.addEventListener("beforeunload", handlePageHide);

    // Intersection observer for menu category sections
    const categoryObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && entry.intersectionRatio > 0.3) {
            activeCategoryRef.current = entry.target.id;
          }
        }
      },
      { threshold: [0.3, 0.6] },
    );
    const sections = document.querySelectorAll("section[id]");
    sections.forEach((sec) => categoryObserver.observe(sec));

    // Intersection observer for items (>= 50% visibility)
    const itemObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const target = entry.target as HTMLElement;
          const itemId =
            target.getAttribute("data-item-id") ||
            target.getAttribute("data-id");
          if (!itemId) continue;

          if (entry.isIntersecting && entry.intersectionRatio >= 0.5) {
            if (!activeExposuresRef.current.has(itemId)) {
              activeExposuresRef.current.set(itemId, {
                itemId,
                exposureId: `exp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
                startTime: Date.now(),
                impressionSent: false,
                qualifiedViewSent: false,
              });
            }
          } else {
            const tracker = activeExposuresRef.current.get(itemId);
            if (tracker) {
              const dwellMs = Date.now() - tracker.startTime;
              if (dwellMs >= 3000) {
                queueEvent({
                  itemId,
                  surface: detectSurface(),
                  eventType: "dwell_heartbeat",
                  dwellDurationMs: Math.min(dwellMs, 10000),
                  exposureId: tracker.exposureId,
                  occurredAt: new Date().toISOString(),
                });
              }
              activeExposuresRef.current.delete(itemId);
            }
          }
        }
      },
      { threshold: [0.5] },
    );

    const observeItems = () => {
      const itemElements = document.querySelectorAll(
        "[data-item-id], [data-id]",
      );
      itemElements.forEach((el) => itemObserver.observe(el));
    };

    observeItems();

    // Observe dynamic elements via MutationObserver
    const mutationObserver = new MutationObserver(() => {
      observeItems();
    });
    mutationObserver.observe(document.body, { childList: true, subtree: true });

    return () => {
      clearInterval(exposureCheckInterval);
      clearInterval(dwellInterval);
      clearInterval(syncInterval);
      window.removeEventListener("komanda:cart_add", handleCartAdd);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pagehide", handlePageHide);
      window.removeEventListener("beforeunload", handlePageHide);
      categoryObserver.disconnect();
      itemObserver.disconnect();
      mutationObserver.disconnect();
      flushBatchEvents(true);
      sendSessionSummary(true);
    };
  }, [tenantSlug]);
}

