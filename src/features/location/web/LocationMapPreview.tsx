const ZOOM = 15;
const TILE_SIZE = 256;
const TILE_COUNT = 2 ** ZOOM;

function tilePosition(lat: number, lng: number) {
  const safeLat = Math.max(-85.0511, Math.min(85.0511, lat));
  const radians = (safeLat * Math.PI) / 180;
  return {
    x: ((lng + 180) / 360) * TILE_COUNT,
    y: ((1 - Math.asinh(Math.tan(radians)) / Math.PI) / 2) * TILE_COUNT,
  };
}

export function LocationMapPreview({ lat, lng, name }: { lat: number; lng: number; name: string }) {
  const center = tilePosition(lat, lng);
  const tileX = Math.floor(center.x);
  const tileY = Math.floor(center.y);
  const offsetX = Math.round((center.x - tileX) * TILE_SIZE);
  const offsetY = Math.round((center.y - tileY) * TILE_SIZE);

  return (
    <div
      className="relative h-44 w-full overflow-hidden bg-[#141417]"
      role="group"
      aria-label={`Mapa de ubicación de ${name}`}
    >
      <span className="sr-only">
        Ubicación de {name}: {lat.toFixed(6)}, {lng.toFixed(6)}
      </span>

      <div className="pointer-events-none absolute inset-0 [filter:invert(1)_hue-rotate(180deg)_saturate(0.35)_brightness(0.88)_contrast(0.95)]">
        {[-1, 0, 1].flatMap((row) =>
          [-3, -2, -1, 0, 1, 2, 3].map((column) => {
            const x = (tileX + column + TILE_COUNT) % TILE_COUNT;
            const y = tileY + row;
            if (y < 0 || y >= TILE_COUNT) return null;
            return (
              // Tiles are decorative; coordinates and directions remain available in the card.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={`${x}:${y}`}
                src={`https://${["a", "b", "c"][(column + 3) % 3]}.tile.openstreetmap.fr/osmfr/${ZOOM}/${x}/${y}.png`}
                alt=""
                loading="lazy"
                draggable={false}
                className="pointer-events-none absolute max-w-none select-none"
                width={TILE_SIZE}
                height={TILE_SIZE}
                style={{
                  left: `calc(50% + ${column * TILE_SIZE - offsetX}px)`,
                  top: `calc(50% + ${row * TILE_SIZE - offsetY}px)`,
                }}
              />
            );
          }),
        )}
      </div>

      {/* Subtle dark vignette + bottom fade for CTA legibility */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-10 bg-[radial-gradient(circle_at_center,transparent_35%,rgba(16,16,19,0.55)_100%)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-14 bg-gradient-to-t from-[#101013]/80 via-[#101013]/30 to-transparent"
      />

      {/* Minimalist dark-mode pin with warm accent halo */}
      <span
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/2 z-10 size-9 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#d97757]/20 ring-1 ring-[#d97757]/35"
      />
      <span
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/2 z-10 flex size-6 -translate-x-1/2 -translate-y-full rotate-[-45deg] items-center justify-center rounded-[50%_50%_50%_0] border-2 border-[#f4f3f1] bg-[#d97757] shadow-[0_4px_12px_rgba(0,0,0,0.65)]"
      >
        <span className="size-2 rounded-full bg-[#141417]" />
      </span>

      <span className="absolute right-2 top-1.5 z-10 rounded-md border border-white/10 bg-[#101013]/75 px-1.5 py-0.5 text-[9px] leading-tight text-white/50 backdrop-blur-sm">
        ©{" "}
        <a
          href="https://www.openstreetmap.org/copyright"
          target="_blank"
          rel="noreferrer"
          className="hover:text-white/80 hover:underline"
        >
          OpenStreetMap contributors
        </a>{" "}
        ·{" "}
        <a
          href="https://www.openstreetmap.fr/"
          target="_blank"
          rel="noreferrer"
          className="hover:text-white/80 hover:underline"
        >
          OpenStreetMap France
        </a>
      </span>
    </div>
  );
}
