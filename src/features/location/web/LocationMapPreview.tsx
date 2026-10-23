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
    <div className="relative h-44 w-full overflow-hidden bg-zinc-200" role="group" aria-label={`Mapa de ubicación de ${name}`}>
      <span className="absolute inset-0 grid place-items-center px-4 text-center text-sm text-zinc-700">
        Ubicación de {name}: {lat.toFixed(6)}, {lng.toFixed(6)}
      </span>
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
              className="pointer-events-none absolute max-w-none"
              width={TILE_SIZE}
              height={TILE_SIZE}
              style={{ left: `calc(50% + ${column * TILE_SIZE - offsetX}px)`, top: `calc(50% + ${row * TILE_SIZE - offsetY}px)` }}
            />
          );
        }),
      )}
      <span className="pointer-events-none absolute left-1/2 top-1/2 z-10 h-[18px] w-[18px] -translate-x-1/2 -translate-y-full rotate-[-45deg] rounded-[50%_50%_50%_0] border-[3px] border-white bg-zinc-950 shadow-md" />
      <span className="absolute bottom-0 right-0 z-10 bg-white/90 px-1 text-[10px] text-zinc-900">
        © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer" className="underline">OpenStreetMap contributors</a> · <a href="https://www.openstreetmap.fr/" target="_blank" rel="noreferrer" className="underline">OpenStreetMap France</a>
      </span>
    </div>
  );
}
