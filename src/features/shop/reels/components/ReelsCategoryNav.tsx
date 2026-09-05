"use client";

import type { Category } from "@/types/types";

export interface ReelsCategoryNavProps {
  categories: Category[];
  activeCategoryId: string | null;
  onSelectCategory?: (categoryId: string) => void;
}

export default function ReelsCategoryNav({
  categories,
  activeCategoryId,
  onSelectCategory,
}: ReelsCategoryNavProps) {
  const handleCategoryClick = (categoryId: string) => {
    onSelectCategory?.(categoryId);

    if (typeof document !== "undefined") {
      const targetReel = document.querySelector(
        `[data-category-id="${categoryId}"]`
      );
      if (targetReel && typeof targetReel.scrollIntoView === "function") {
        const prefersReducedMotion =
          typeof window !== "undefined" &&
          window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;

        targetReel.scrollIntoView({
          behavior: prefersReducedMotion ? "auto" : "smooth",
          block: "start",
        });
      }
    }
  };

  if (!categories || categories.length === 0) {
    return null;
  }

  return (
    <nav
      data-testid="reels-category-nav"
      aria-label="Categorías de menú"
      className="absolute top-4 left-0 right-0 z-30 px-4 pointer-events-auto"
    >
      <div className="flex gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden pb-1">
        {categories.map((cat) => {
          const isActive = activeCategoryId === cat.documentId;
          return (
            <button
              key={cat.documentId}
              type="button"
              data-testid={`category-pill-${cat.documentId}`}
              data-active={isActive ? "true" : "false"}
              onClick={() => handleCategoryClick(cat.documentId)}
              className={`shrink-0 px-4 py-2 rounded-full text-[13px] font-semibold transition-all duration-200 cursor-pointer ${
                isActive
                  ? "bg-white text-black border border-white shadow-[0_4px_14px_rgba(255,255,255,0.25)] scale-105"
                  : "bg-[rgba(15,17,23,0.72)] border border-white/15 text-slate-200 backdrop-blur-md hover:text-white"
              }`}
            >
              {cat.name}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
