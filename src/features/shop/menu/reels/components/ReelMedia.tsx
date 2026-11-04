"use client";

import { useState } from "react";
import type { ComboMediaSlot } from "@/types/types";

export interface ReelMediaProps {
  image: string;
  videoUrl?: string | null;
  comboMedia?: ComboMediaSlot[];
  alt: string;
  videoRef?: React.Ref<HTMLVideoElement>;
}

export default function ReelMedia({
  image,
  videoUrl,
  comboMedia,
  alt,
  videoRef,
}: ReelMediaProps) {
  const [hasVideoError, setHasVideoError] = useState(false);
  const [failedSlotVideos, setFailedSlotVideos] = useState<
    Record<string, boolean>
  >({});

  const visibleSlots = (comboMedia ?? []).filter(
    (slot) => Boolean(slot.image) || Boolean(slot.videoUrl),
  );

  if (visibleSlots.length > 1) {
    const slots = visibleSlots.slice(0, 4);
    const gridClass =
      slots.length === 2
        ? "grid-rows-2"
        : "grid-cols-2 grid-rows-2";
    const firstVideoIndex = slots.findIndex(
      (slot) => Boolean(slot.videoUrl) && !failedSlotVideos[slot.itemId],
    );

    return (
      <div
        data-testid="reel-combo-split-media"
        className={`absolute inset-0 z-[1] grid h-full w-full overflow-hidden bg-white/15 gap-[1.5px] ${gridClass}`}
      >
        {slots.map((slot, idx) => {
          const spanFullRow = slots.length === 3 && idx === 2;
          const showSlotVideo =
            Boolean(slot.videoUrl) && !failedSlotVideos[slot.itemId];
          const isPrimaryVideo = idx === firstVideoIndex;

          return (
            <div
              key={`${slot.itemId}-${idx}`}
              className={`relative h-full w-full overflow-hidden bg-[#141416] ${
                spanFullRow ? "col-span-2" : ""
              }`}
            >
              {showSlotVideo ? (
                <video
                  ref={isPrimaryVideo ? videoRef : undefined}
                  data-testid={isPrimaryVideo ? "reel-video" : undefined}
                  src={slot.videoUrl!}
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
                  onError={() =>
                    setFailedSlotVideos((prev) => ({
                      ...prev,
                      [slot.itemId]: true,
                    }))
                  }
                  className="pointer-events-none absolute inset-0 h-full w-full object-cover select-none"
                />
              ) : slot.image ? (
                <img
                  src={slot.image}
                  alt={slot.name}
                  className="h-full w-full object-cover"
                />
              ) : null}

              <div className="pointer-events-none absolute top-3 left-3 z-10 rounded-full border border-white/15 bg-black/55 px-2.5 py-0.5 text-[11px] font-medium text-[#f4f3f1] backdrop-blur-md">
                {slot.quantity > 1 ? `${slot.quantity} × ` : ""}
                {slot.name}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  const hasImage = Boolean(image);
  const shouldRenderVideo = Boolean(videoUrl && !hasVideoError);

  if (shouldRenderVideo) {
    return (
      <div className="absolute inset-0 z-[1] h-full w-full overflow-hidden bg-[#141416]">
        <video
          ref={videoRef}
          data-testid="reel-video"
          src={videoUrl!}
          poster={hasImage ? image : undefined}
          muted
          playsInline
          loop
          controls={false}
          disablePictureInPicture
          disableRemotePlayback
          controlsList="nodownload nofullscreen noremoteplayback"
          preload="none"
          onError={() => setHasVideoError(true)}
          className="pointer-events-none absolute inset-0 h-full w-full object-cover select-none"
        />
      </div>
    );
  }

  return (
    <div
      data-testid="reel-blur-backdrop"
      className="absolute inset-0 z-[1] flex h-full w-full items-center justify-center overflow-hidden bg-[#141416]"
    >
      {hasImage ? (
        <>
          {/* Blurred background replicating image */}
          <img
            src={image}
            alt=""
            aria-hidden="true"
            className="pointer-events-none absolute -inset-5 h-[calc(100%+40px)] w-[calc(100%+40px)] scale-110 object-cover blur-[24px] brightness-[45%]"
            style={{ filter: "blur(24px) brightness(0.45)" }}
          />
          {/* Sharp centered foreground image */}
          <img
            src={image}
            alt={alt}
            className="relative z-[2] h-full w-full object-contain"
          />
        </>
      ) : null}
    </div>
  );
}
