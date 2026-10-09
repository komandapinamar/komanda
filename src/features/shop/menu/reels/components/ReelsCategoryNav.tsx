"use client";

import type { Category } from "@/types/types";
import { activeCategoryPillClassName, categoryPillClassName, inactiveCategoryPillClassName } from "../../MenuViewToolbar";

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
      className="min-w-0"
    >
      <div className="flex items-center gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {categories.map((cat) => {
          const isActive = activeCategoryId === cat.documentId;
          return (
            <button
              key={cat.documentId}
              type="button"
              data-testid={`category-pill-${cat.documentId}`}
              data-active={isActive ? "true" : "false"}
              aria-pressed={isActive}
              onClick={() => handleCategoryClick(cat.documentId)}
              className={`${categoryPillClassName} cursor-pointer ${
                isActive
                  ? activeCategoryPillClassName
                  : inactiveCategoryPillClassName
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
