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

  const shouldRenderVideo = Boolean(videoUrl && !hasVideoError);

  if (shouldRenderVideo) {
    return (
      <div className="absolute inset-0 w-full h-full bg-black overflow-hidden z-[1]">
        <video
          ref={videoRef}
          data-testid="reel-video"
          src={videoUrl!}
          poster={image}
          muted
          playsInline
          loop
          preload="none"
          onError={() => setHasVideoError(true)}
          className="absolute inset-0 w-full h-full object-cover"
        />
      </div>
    );
  }

  return (
    <div
      data-testid="reel-blur-backdrop"
      className="absolute inset-0 w-full h-full overflow-hidden z-[1] bg-black flex items-center justify-center"
    >
      {/* Blurred background replicating image */}
      <img
        src={image}
        alt=""
        aria-hidden="true"
        className="absolute -inset-5 w-[calc(100%+40px)] h-[calc(100%+40px)] object-cover blur-[24px] brightness-[45%] scale-110 pointer-events-none"
        style={{ filter: "blur(24px) brightness(0.45)" }}
      />
      {/* Sharp centered foreground image */}
      <img
        src={image}
        alt={alt}
        className="relative w-full h-full object-contain z-[2]"
      />
    </div>
  );
}
