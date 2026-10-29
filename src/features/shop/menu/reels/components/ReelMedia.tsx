"use client";

import { useState } from "react";

export interface ReelMediaProps {
  image: string;
  videoUrl?: string | null;
  alt: string;
  videoRef?: React.Ref<HTMLVideoElement>;
}

export default function ReelMedia({
  image,
  videoUrl,
  alt,
  videoRef,
}: ReelMediaProps) {
  const [hasVideoError, setHasVideoError] = useState(false);

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
