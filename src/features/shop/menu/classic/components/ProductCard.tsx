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
  const comboSlots = (item.comboMedia ?? []).filter(
    (slot) => Boolean(slot.image) || Boolean(slot.videoUrl),
  );
  const hasSplitComboMedia = comboSlots.length > 1;
  const hasImage = Boolean(item.image);
  const hasVideo = Boolean(item.videoUrl);
  const hasMedia = hasSplitComboMedia || hasImage || hasVideo;

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
          {item.kind === "combo" ? (
            <span className="rounded-full border border-emerald-400/25 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-300">
              Combo
            </span>
          ) : null}
          {item.hasOptions ? (
            <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[10px] font-medium text-[#9b9ba4]">
              Personalizable
            </span>
          ) : null}
        </div>
      </div>

      {hasMedia ? (
        <aside className="relative z-10 flex flex-none items-center">
          <div className="relative size-24 shrink-0 overflow-hidden rounded-2xl bg-[#202024] ring-1 ring-white/12 sm:size-28">
            {hasSplitComboMedia ? (
              <div
                data-testid="combo-split-thumbnail"
                className={`grid size-full gap-[1px] bg-white/15 ${
                  comboSlots.length === 2
                    ? "grid-cols-2"
                    : "grid-cols-2 grid-rows-2"
                }`}
              >
                {comboSlots.slice(0, 4).map((slot, idx) => {
                  const spanFullRow = comboSlots.length === 3 && idx === 2;
                  return (
                    <div
                      key={`${slot.itemId}-${idx}`}
                      className={`relative size-full overflow-hidden bg-[#141416] ${
                        spanFullRow ? "col-span-2" : ""
                      }`}
                    >
                      {slot.videoUrl ? (
                        <video
                          src={slot.videoUrl}
                          poster={slot.image ?? undefined}
                          autoPlay
                          muted
                          playsInline
                          loop
                          controls={false}
                          disablePictureInPicture
                          disableRemotePlayback
                          controlsList="nodownload nofullscreen noremoteplayback"
                          preload="metadata"
                          className="pointer-events-none size-full object-cover select-none"
                        />
                      ) : slot.image ? (
                        <Image
                          className="size-full object-cover"
                          src={slot.image}
                          alt={slot.name}
                          width={64}
                          height={64}
                          loading="lazy"
                          unoptimized
                        />
                      ) : null}
                    </div>
                  );
                })}
              </div>
            ) : hasImage ? (
              <Image
                className="size-full object-cover transition duration-300 group-hover:scale-105"
                src={item.image}
                alt={item.name}
                width={128}
                height={128}
                loading="lazy"
                unoptimized
              />
            ) : hasVideo ? (
              <video
                src={item.videoUrl!}
                autoPlay
                muted
                playsInline
                loop
                controls={false}
                disablePictureInPicture
                disableRemotePlayback
                controlsList="nodownload nofullscreen noremoteplayback"
                preload="metadata"
                className="pointer-events-none size-full object-cover select-none"
              />
            ) : null}
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
