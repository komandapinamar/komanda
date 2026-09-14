"use client";

import { useState, useCallback, type MouseEvent } from "react";
import type { MenuItem } from "@/types/types";
import { formatReelPrice } from "./ReelOverlay";

export interface ReelActionRailProps {
  item: MenuItem;
  onLike?: () => void;
  isLiked?: boolean;
  showHeart?: boolean;
  onOpenInfo?: () => void;
}

export default function ReelActionRail({
  item,
  onLike,
  isLiked: externalIsLiked = false,
  showHeart: externalShowHeart = false,
  onOpenInfo,
}: ReelActionRailProps) {
  const [internalIsLiked, setInternalIsLiked] = useState(false);
  const [internalShowHeart, setInternalShowHeart] = useState(false);
  const [isInfoOpen, setIsInfoOpen] = useState(false);

  const isLiked = externalIsLiked || internalIsLiked;
  const showHeart = externalShowHeart || internalShowHeart;

  const handleLikeClick = useCallback(
    (e: MouseEvent<HTMLButtonElement>) => {
      e.stopPropagation();

      // Trigger visual feedback
      setInternalIsLiked(true);
      setInternalShowHeart(true);

      setTimeout(() => {
        setInternalShowHeart(false);
      }, 650);

      setTimeout(() => {
        setInternalIsLiked(false);
      }, 800);

      onLike?.();
    },
    [onLike]
  );

  const handleInfoClick = useCallback(
    (e: MouseEvent<HTMLButtonElement>) => {
      e.stopPropagation();
      if (onOpenInfo) {
        onOpenInfo();
      } else {
        setIsInfoOpen(true);
      }
    },
    [onOpenInfo]
  );

  const handleCloseInfo = useCallback(
    (e?: MouseEvent) => {
      e?.stopPropagation();
      setIsInfoOpen(false);
    },
    []
  );

  return (
    <>
      {/* Micro-animation CSS keyframes for heartPop */}
      <style>{`
        @keyframes heartPop {
          0% { transform: scale(0.3); opacity: 0; }
          35% { transform: scale(1.35); opacity: 1; }
          70% { transform: scale(1.1); opacity: 1; }
          100% { transform: scale(1.4); opacity: 0; }
        }
        .animate-heart-pop {
          animation: heartPop 650ms cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards;
        }
      `}</style>

      {/* Floating heart burst animation (centered, 650ms, pointer-events: none) */}
      {showHeart ? (
        <div
          data-testid="reel-heart-pop"
          className="fixed inset-0 pointer-events-none z-50 flex items-center justify-center"
          aria-hidden="true"
        >
          <div
            className="animate-heart-pop drop-shadow-[0_10px_25px_rgba(255,42,85,0.6)]"
            style={{ filter: "drop-shadow(0 10px 25px rgba(255, 42, 85, 0.6))" }}
          >
            <svg
              width="100"
              height="100"
              viewBox="0 0 24 24"
              fill="#ff2a55"
              className="text-[#ff2a55]"
            >
              <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
            </svg>
          </div>
        </div>
      ) : null}

      {/* Vertical Action Rail */}
      <div
        data-testid="reel-action-rail"
        className="flex flex-col gap-4 items-center z-25 select-none"
      >
        {/* Like / Pedir Button */}
        <button
          type="button"
          data-testid="action-btn-like"
          data-liked={String(isLiked)}
          aria-label={`Agregar ${item.name} al carrito`}
          onClick={handleLikeClick}
          className={`w-[50px] h-[50px] rounded-full flex flex-col items-center justify-center border transition-all duration-200 cursor-pointer shadow-lg active:scale-90 ${
            isLiked
              ? "bg-[#ff2a55] border-[#ff2a55] text-white shadow-[0_4px_20px_rgba(255,42,85,0.5)] scale-105"
              : "bg-[rgba(18,20,29,0.65)] backdrop-blur-md border-white/20 text-white hover:bg-[rgba(25,28,40,0.8)]"
          }`}
        >
          <svg
            className="w-6 h-6 transition-transform"
            viewBox="0 0 24 24"
            fill="currentColor"
          >
            <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
          </svg>
          <span
            data-testid="action-like-label"
            className="text-[10px] font-bold tracking-tight leading-none mt-0.5"
          >
            +1
          </span>
        </button>

        {/* Dish Info Button */}
        <button
          type="button"
          data-testid="action-btn-info"
          aria-label="Información del plato"
          onClick={handleInfoClick}
          className="w-[50px] h-[50px] rounded-full flex flex-col items-center justify-center bg-[rgba(18,20,29,0.65)] backdrop-blur-md border border-white/20 text-white hover:bg-[rgba(25,28,40,0.8)] transition-all duration-200 cursor-pointer shadow-lg active:scale-90"
        >
          <svg
            className="w-5 h-5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="16" x2="12" y2="12" />
            <line x1="12" y1="8" x2="12.01" y2="8" />
          </svg>
          <span
            data-testid="action-info-label"
            className="text-[9px] font-bold tracking-tight leading-none mt-0.5"
          >
            Info
          </span>
        </button>
      </div>

      {/* Dish Information Modal */}
      {isInfoOpen ? (
        <div
          data-testid="reel-info-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="dish-info-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm pointer-events-auto"
          onClick={handleCloseInfo}
        >
          <div
            className="bg-[#161822] border border-white/16 rounded-2xl p-6 max-w-sm w-full space-y-4 shadow-2xl text-white"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 border-b border-white/10 pb-3">
              <div>
                <h3
                  id="dish-info-title"
                  data-testid="dish-info-title"
                  className="text-lg font-extrabold leading-snug"
                >
                  {item.name}
                </h3>
                <span className="text-sm font-black text-[#22c55e]">
                  ${formatReelPrice(item.price)}
                </span>
              </div>
              <button
                type="button"
                data-testid="dish-info-close"
                onClick={handleCloseInfo}
                className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-neutral-300 hover:text-white"
                aria-label="Cerrar información"
              >
                ✕
              </button>
            </div>

            <p
              data-testid="dish-info-description"
              className="text-sm text-neutral-300 leading-relaxed"
            >
              {item.description || "Sin descripción adicional de ingredientes para este plato."}
            </p>

            <button
              type="button"
              onClick={handleCloseInfo}
              className="w-full py-2.5 rounded-full bg-white/10 hover:bg-white/15 text-sm font-bold text-white transition-colors"
            >
              Cerrar
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
