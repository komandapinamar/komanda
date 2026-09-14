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
    <div className="relative w-full h-[100dvh] bg-black flex items-center justify-center overflow-hidden">
      <div
        ref={containerRef}
        data-testid="reel-feed-container"
        className={`relative w-full h-[100dvh] overflow-y-scroll [scroll-snap-type:y_mandatory] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:max-w-md md:h-[92vh] md:rounded-[40px] md:border-8 md:border-[#20222e] md:shadow-2xl flex flex-col bg-black ${className}`}
        style={{
          scrollSnapType: "y mandatory",
        }}
      >
        {children}
      </div>
    </div>
  );
}
