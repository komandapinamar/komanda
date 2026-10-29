"use client";

/**
 * Chromatic Liquid-Glass Emblem inspired by Dabbit's HeroMark shader.
 * Renders a four-loop command/clover mark with animated liquid-chrome
 * specular bands and subtle red/blue chromatic dispersion.
 */
export function LiquidGlassMark({ className = "size-14" }: { className?: string }) {
  return (
    <div
      className={`relative select-none ${className}`}
      role="img"
      aria-label="Komanda mark"
    >
      <svg
        viewBox="0 0 120 120"
        className="size-full drop-shadow-[0_8px_24px_rgba(0,0,0,0.45)]"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <linearGradient id="komanda-liquid-chrome" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="22%" stopColor="#d4d8e2" />
            <stop offset="42%" stopColor="#262830" />
            <stop offset="56%" stopColor="#faf9f6" />
            <stop offset="76%" stopColor="#8e96a8" />
            <stop offset="100%" stopColor="#f4f3f1" />
          </linearGradient>
          <linearGradient id="komanda-chromatic-red" x1="0%" y1="100%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#ff6b4a" stopOpacity="0.65" />
            <stop offset="45%" stopColor="#e3b878" stopOpacity="0.15" />
            <stop offset="100%" stopColor="#60a5fa" stopOpacity="0.7" />
          </linearGradient>
          <filter id="komanda-glass-bevel" x="-15%" y="-15%" width="130%" height="130%">
            <feGaussianBlur in="SourceAlpha" stdDeviation="2.2" result="blur" />
            <feSpecularLighting
              in="blur"
              surfaceScale="5"
              specularConstant="1.15"
              specularExponent="28"
              lightingColor="#ffffff"
              result="specOut"
            >
              <fePointLight x="25" y="20" z="90" />
            </feSpecularLighting>
            <feComposite in="specOut" in2="SourceAlpha" operator="in" result="specMask" />
            <feMerge>
              <feMergeNode in="SourceGraphic" />
              <feMergeNode in="specMask" />
            </feMerge>
          </filter>
        </defs>

        {/* Subtle chromatic dispersion rim */}
        <g
          stroke="url(#komanda-chromatic-red)"
          strokeWidth="12.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity="0.8"
          transform="translate(1.2, -1)"
        >
          <path d="M36 52H28C19.163 52 12 44.837 12 36C12 27.163 19.163 20 28 20C36.837 20 44 27.163 44 36V52H36Z" />
          <path d="M84 52H92C100.837 52 108 44.837 108 36C108 27.163 100.837 20 92 20C83.163 20 76 27.163 76 36V52H84Z" />
          <path d="M36 68H28C19.163 68 12 75.163 12 84C12 92.837 19.163 100 28 100C36.837 100 44 92.837 44 84V68H36Z" />
          <path d="M84 68H92C100.837 68 108 75.163 108 84C108 92.837 100.837 100 92 100C83.163 100 76 92.837 76 84V68H84Z" />
        </g>

        {/* Main Liquid Metal / Glass Body */}
        <g
          filter="url(#komanda-glass-bevel)"
          stroke="url(#komanda-liquid-chrome)"
          strokeWidth="11"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M36 52H28C19.163 52 12 44.837 12 36C12 27.163 19.163 20 28 20C36.837 20 44 27.163 44 36V52H36Z" />
          <path d="M84 52H92C100.837 52 108 44.837 108 36C108 27.163 100.837 20 92 20C83.163 20 76 27.163 76 36V52H84Z" />
          <path d="M36 68H28C19.163 68 12 75.163 12 84C12 92.837 19.163 100 28 100C36.837 100 44 92.837 44 84V68H36Z" />
          <path d="M84 68H92C100.837 68 108 75.163 108 84C108 92.837 100.837 100 92 100C83.163 100 76 92.837 76 84V68H84Z" />
        </g>
      </svg>
    </div>
  );
}
