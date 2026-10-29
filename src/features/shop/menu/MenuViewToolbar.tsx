"use client";

import Link from "next/link";
import type { ReactNode } from "react";

export const categoryPillClassName =
  "flex h-9 shrink-0 items-center rounded-full border px-4 text-xs font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 focus-visible:ring-inset";
export const inactiveCategoryPillClassName =
  "border-transparent bg-transparent text-[#c2c2cc] hover:bg-white/[0.08] hover:text-[#f4f3f1]";
export const activeCategoryPillClassName =
  "border-white bg-white text-black shadow-sm";

export default function MenuViewToolbar({
  mode,
  children,
}: {
  mode?: "reels" | "grid";
  children: ReactNode;
}) {
  const switchToGrid = mode === "reels";

  return (
    <div className="liquid-glass-pill pointer-events-auto flex min-w-0 items-center gap-1.5 rounded-full p-1.5 text-[#f4f3f1]">
      {mode && (
        <Link
          href={switchToGrid ? "/order?view=list" : "/order"}
          data-testid={
            switchToGrid ? "reels-view-list-btn" : "classic-view-reels-btn"
          }
          aria-label={
            switchToGrid ? "Ver el menú en grid" : "Volver a reels"
          }
          title={switchToGrid ? "Ver el menú en grid" : "Volver a reels"}
          className="flex size-9 shrink-0 items-center justify-center rounded-full border border-white/15 bg-white/8 text-[#f4f3f1] transition-colors hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-inset"
        >
          <svg
            className="size-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            {switchToGrid ? (
              <>
                <rect x="3" y="3" width="7" height="7" rx="1.5" />
                <rect x="14" y="3" width="7" height="7" rx="1.5" />
                <rect x="3" y="14" width="7" height="7" rx="1.5" />
                <rect x="14" y="14" width="7" height="7" rx="1.5" />
              </>
            ) : (
              <>
                <rect x="5" y="2" width="14" height="20" rx="4" />
                <path
                  d="m10 8 5 4-5 4V8Z"
                  fill="currentColor"
                  stroke="none"
                />
              </>
            )}
          </svg>
        </Link>
      )}
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
