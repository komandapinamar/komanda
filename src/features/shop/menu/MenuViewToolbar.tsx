"use client";

import Link from "next/link";
import type { ReactNode } from "react";

export const categoryPillClassName = "flex h-11 shrink-0 items-center rounded-full border px-4 text-[13px] font-semibold transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 focus-visible:ring-inset";
export const inactiveCategoryPillClassName = "border-white/15 bg-white/5 text-slate-200 hover:border-white/30 hover:bg-white/10 hover:text-white";
export const activeCategoryPillClassName = "border-white bg-white text-black shadow-sm";

export default function MenuViewToolbar({
  mode,
  children,
}: {
  mode?: "reels" | "grid";
  children: ReactNode;
}) {
  const switchToGrid = mode === "reels";

  return (
    <div className="pointer-events-auto flex min-w-0 items-center gap-2 rounded-[28px] border border-white/10 bg-[#0f1117]/80 p-1.5 text-white shadow-lg backdrop-blur-xl">
      {mode && (
        <Link
          href={switchToGrid ? "/order?view=list" : "/order"}
          data-testid={switchToGrid ? "reels-view-list-btn" : "classic-view-reels-btn"}
          aria-label={switchToGrid ? "Ver el menú en grid" : "Volver a reels"}
          title={switchToGrid ? "Ver el menú en grid" : "Volver a reels"}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/20 bg-white/10 text-white transition-colors hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-inset"
        >
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
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
                <path d="m10 8 5 4-5 4V8Z" fill="currentColor" stroke="none" />
              </>
            )}
          </svg>
        </Link>
      )}
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
