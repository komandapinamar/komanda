import type { ReactNode } from "react";

export interface ReelFeedContainerProps {
  children: ReactNode;
  containerRef?: React.Ref<HTMLDivElement>;
  className?: string;
}

export default function ReelFeedContainer({
  children,
  containerRef,
  className = "",
}: ReelFeedContainerProps) {
  return (
    <div className="relative flex h-full h-[100dvh] max-h-full w-full max-w-full items-center justify-center overflow-hidden bg-[#141416]">
      <div
        ref={containerRef}
        data-testid="reel-feed-container"
        className={`liquid-prism-ring relative flex h-full h-[100dvh] max-h-full w-full min-w-0 flex-col overflow-x-hidden overflow-y-scroll bg-[#141416] [scroll-snap-type:y_mandatory] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:h-[92vh] md:max-h-[92vh] md:max-w-md md:rounded-[36px] md:border md:border-white/15 md:shadow-[0_32px_90px_-15px_rgba(0,0,0,0.85)] ${className}`}
        style={{
          scrollSnapType: "y mandatory",
        }}
      >
        {children}
      </div>
    </div>
  );
}
