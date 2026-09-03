"use client";

import { useEffect, useRef } from "react";

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

export function useMenuAnalytics(tenantSlug: string) {
  const dwellTimeRef = useRef(0);
  const categoryDwellRef = useRef<Record<string, number>>({});
  const activeCategoryRef = useRef<string | null>(null);
  const isVisibleRef = useRef(true);
  const lastSyncDwellRef = useRef(0);

  useEffect(() => {
    if (!tenantSlug) return;
    const sessionKey = getOrCreateSessionKey();
    const deviceType = getDeviceType();

    const sendTelemetry = (isFinal = false) => {
      // Don't spam if no new time accumulated and not final
      if (!isFinal && dwellTimeRef.current === lastSyncDwellRef.current) return;
      lastSyncDwellRef.current = dwellTimeRef.current;

      const payload = JSON.stringify({
        sessionKey,
        deviceType,
        dwellTimeSeconds: Math.floor(dwellTimeRef.current),
        categoryDwellMap: Object.fromEntries(
          Object.entries(categoryDwellRef.current).map(([k, v]) => [k, Math.floor(v)]),
        ),
        itemViewsMap: {},
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

    // Active timer loop (every second)
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") {
        dwellTimeRef.current += 1;
        if (activeCategoryRef.current) {
          categoryDwellRef.current[activeCategoryRef.current] =
            (categoryDwellRef.current[activeCategoryRef.current] || 0) + 1;
        }
      }
    }, 1000);

    // Heartbeat sync every 25 seconds
    const syncInterval = setInterval(() => {
      sendTelemetry(false);
    }, 25000);

    // Visibility listener
    const handleVisibilityChange = () => {
      isVisibleRef.current = document.visibilityState === "visible";
      if (!isVisibleRef.current) {
        sendTelemetry(false);
      }
    };

    // Unload / pagehide listener
    const handlePageHide = () => {
      sendTelemetry(true);
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("pagehide", handlePageHide);
    window.addEventListener("beforeunload", handlePageHide);

    // Intersection observer for menu category sections
    const observer = new IntersectionObserver(
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
    sections.forEach((sec) => observer.observe(sec));

    return () => {
      clearInterval(interval);
      clearInterval(syncInterval);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pagehide", handlePageHide);
      window.removeEventListener("beforeunload", handlePageHide);
      observer.disconnect();
      sendTelemetry(true);
    };
  }, [tenantSlug]);
}
