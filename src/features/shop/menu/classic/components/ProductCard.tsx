import { MenuItem } from "@/types/types";
import { useState } from "react";
import Image from "next/image";

export interface ProductCardProps {
  item: MenuItem;
  showAddButton?: boolean;
}

export default function ProductCard({
  item,
  showAddButton = true,
}: ProductCardProps) {
  const [active, setActive] = useState<boolean>(false);
  const TIMEOUT_MS = 200;
  const hasImage = Boolean(item.image);

  function activateClass(timeout: number) {
    setActive(true);
    setTimeout(() => {
      setActive(false);
    }, timeout);
  }

  return (
    <div
      data-item-id={item.documentId}
      data-testid="menu-item-card"
      className={`menu-page__item liquid-glass-card group relative flex min-h-40 w-full items-stretch justify-between gap-4 overflow-hidden rounded-3xl p-4 sm:p-5 text-[#f4f3f1] transition-all duration-200 ease-out hover:-translate-y-0.5 hover:border-white/20 ${
        active ? "scale-[0.99] ring-1 ring-white/30" : ""
      }`}
      onClick={() => {
        activateClass(TIMEOUT_MS);
      }}
    >
      <div className="relative z-10 flex min-w-0 flex-1 flex-col justify-between gap-3">
        <div className="space-y-1.5">
          <h1 className="line-clamp-2 text-lg font-medium leading-snug tracking-tight text-[#f4f3f1] sm:text-xl">
            {item.name}
          </h1>
          {item.description ? (
            <p className="line-clamp-2 text-xs leading-relaxed text-[#9b9ba4] sm:text-sm">
              {item.description}
            </p>
          ) : null}
        </div>

        <div className="flex items-center gap-2">
          <p className="text-base font-medium tracking-tight text-[#f4f3f1] tabular-nums sm:text-lg">
            ${item.price}
          </p>
          {item.hasOptions ? (
            <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[10px] font-medium text-[#9b9ba4]">
              Personalizable
            </span>
          ) : null}
        </div>
      </div>

      {hasImage ? (
        <aside className="relative z-10 flex flex-none items-center">
          <div className="relative size-24 shrink-0 overflow-hidden rounded-2xl bg-[#202024] ring-1 ring-white/12 sm:size-28">
            <Image
              className="size-full object-cover transition duration-300 group-hover:scale-105"
              src={item.image}
              alt={item.name}
              width={128}
              height={128}
              loading="lazy"
              unoptimized
            />
          </div>
        </aside>
      ) : null}

      {showAddButton ? (
        <div className="absolute bottom-3.5 right-3.5 z-20">
          <button
            type="button"
            aria-label={`Agregar ${item.name}`}
            className="flex size-9 items-center justify-center rounded-full border border-white/15 bg-[#f4f3f1] text-lg font-medium leading-none text-[#141416] shadow-lg transition duration-200 ease-out hover:scale-105 hover:bg-white active:scale-95 cursor-pointer"
          >
            +
          </button>
        </div>
      ) : null}
    </div>
  );
}
