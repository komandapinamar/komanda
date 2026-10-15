"use client";

import { useEffect, useState } from "react";

function readBrowserChromeOffset(): number {
  const visualViewport = window.visualViewport;
  if (!visualViewport) {
    return 0;
  }

  const layoutHeight = document.documentElement.clientHeight;
  const visualBottom = visualViewport.offsetTop + visualViewport.height;

  return Math.max(0, Math.round(layoutHeight - visualBottom));
}

/**
 * Distance (in px) between the bottom of the layout viewport and the bottom of
 * the visible viewport. On mobile browsers (e.g. Safari) the browser chrome
 * covers the bottom of the layout viewport, so fixed elements anchored to the
 * bottom would end up hidden behind it. Return 0 on desktop / no chrome.
 */
export function useBrowserChromeOffset(): number {
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    if (typeof window === "undefined" || !window.visualViewport) {
      return;
    }

    let frame: number | null = null;

    const update = () => {
      frame = null;
      setOffset(readBrowserChromeOffset());
    };

    const scheduleUpdate = () => {
      if (frame === null) {
        frame = window.requestAnimationFrame(update);
      }
    };

    update();

    window.visualViewport.addEventListener("resize", scheduleUpdate);
    window.visualViewport.addEventListener("scroll", scheduleUpdate);
    window.addEventListener("resize", scheduleUpdate);

    return () => {
      if (frame !== null) {
        window.cancelAnimationFrame(frame);
      }
      window.visualViewport?.removeEventListener("resize", scheduleUpdate);
      window.visualViewport?.removeEventListener("scroll", scheduleUpdate);
      window.removeEventListener("resize", scheduleUpdate);
    };
  }, []);

  return offset;
}
