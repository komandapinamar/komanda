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
    <div className="relative flex h-[100dvh] w-full items-center justify-center overflow-hidden bg-[#141416] md:p-4">
      {/* Subtle Ambient Stage Glow on Desktop */}
      <div
        aria-hidden="true"
        className="pointer-events-none hidden md:block absolute h-[75vh] w-[32rem] rounded-full bg-white/[0.03] blur-3xl"
      />
      <div
        ref={containerRef}
        data-testid="reel-feed-container"
        className={`liquid-prism-ring relative flex h-[100dvh] w-full flex-col overflow-y-scroll bg-[#141416] [scroll-snap-type:y_mandatory] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:h-[92vh] md:max-w-md md:rounded-[36px] md:border md:border-white/15 md:shadow-[0_32px_90px_-15px_rgba(0,0,0,0.85)] ${className}`}
        style={{
          scrollSnapType: "y mandatory",
        }}
      >
        {children}
      </div>
    </div>
  );
}
