"use client";

import { useId } from "react";

/**
 * Komanda "K" Monogram with Liquid-Glass / Chrome Specular Bevel
 * and Chromatic Dispersion (inspired by Dabbit's shader finish, using Komanda's own mark).
 */
export function LiquidGlassMark({ className = "size-14" }: { className?: string }) {
  const uid = useId().replace(/:/g, "");
  const chromeGradId = `komanda-chrome-${uid}`;
  const chromaGradId = `komanda-chroma-${uid}`;
  const frameGradId = `komanda-frame-${uid}`;
  const bevelFilterId = `komanda-bevel-${uid}`;

  const kPath =
    "M 68 56 H 106 V 118 L 160 56 H 204 L 142 124 L 206 200 H 160 L 115 145 L 106 155 V 200 H 68 Z";

  return (
    <div
      className={`relative select-none ${className}`}
      role="img"
      aria-label="Komanda mark"
    >
      <svg
        viewBox="0 0 256 256"
        className="size-full drop-shadow-[0_10px_24px_rgba(0,0,0,0.5)]"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <linearGradient id={chromeGradId} x1="15%" y1="8%" x2="88%" y2="92%">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="24%" stopColor="#d8dce6" />
            <stop offset="44%" stopColor="#2b2d36" />
            <stop offset="58%" stopColor="#fbfaf9" />
            <stop offset="78%" stopColor="#949cae" />
            <stop offset="100%" stopColor="#f4f3f1" />
          </linearGradient>

          <linearGradient id={chromaGradId} x1="0%" y1="100%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#d97757" stopOpacity="0.8" />
            <stop offset="35%" stopColor="#e3b878" stopOpacity="0.45" />
            <stop offset="70%" stopColor="#9ec4b5" stopOpacity="0.6" />
            <stop offset="100%" stopColor="#9ab3d5" stopOpacity="0.85" />
          </linearGradient>

          <linearGradient id={frameGradId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="rgba(255,255,255,0.28)" />
            <stop offset="50%" stopColor="rgba(255,255,255,0.06)" />
            <stop offset="100%" stopColor="rgba(217,119,87,0.24)" />
          </linearGradient>

          <filter id={bevelFilterId} x="-15%" y="-15%" width="130%" height="130%">
            <feGaussianBlur in="SourceAlpha" stdDeviation="3.2" result="blur" />
            <feSpecularLighting
              in="blur"
              surfaceScale="6"
              specularConstant="1.2"
              specularExponent="30"
              lightingColor="#ffffff"
              result="specOut"
            >
              <fePointLight x="60" y="45" z="140" />
            </feSpecularLighting>
            <feComposite in="specOut" in2="SourceAlpha" operator="in" result="specMask" />
            <feMerge>
              <feMergeNode in="SourceGraphic" />
              <feMergeNode in="specMask" />
            </feMerge>
          </filter>
        </defs>

        {/* Frosted Liquid Glass Squircle Container */}
        <rect
          x="10"
          y="10"
          width="236"
          height="236"
          rx="56"
          fill="#18181c"
          fillOpacity="0.88"
        />
        <rect
          x="12"
          y="12"
          width="232"
          height="232"
          rx="54"
          stroke={`url(#${frameGradId})`}
          strokeWidth="3.5"
        />
        <rect
          x="18"
          y="18"
          width="220"
          height="220"
          rx="48"
          stroke={`url(#${chromaGradId})`}
          strokeWidth="1.5"
          strokeOpacity="0.55"
        />

        {/* Chromatic Dispersion Offset Layer on the K */}
        <path
          d={kPath}
          fill="none"
          stroke={`url(#${chromaGradId})`}
          strokeWidth="5"
          strokeLinejoin="round"
          transform="translate(2.5, -2)"
          opacity="0.75"
        />

        {/* Main Liquid-Chrome Komanda "K" Monogram */}
        <path
          d={kPath}
          fill={`url(#${chromeGradId})`}
          filter={`url(#${bevelFilterId})`}
        />
      </svg>
    </div>
  );
}
