"use client";

import dynamic from "next/dynamic";

const LocationMap = dynamic(
  () => import("./LocationMap").then((module) => module.LocationMap),
  { ssr: false, loading: () => <div className="grid h-full place-items-center text-sm text-zinc-500">Cargando mapa...</div> },
);

export function LocationMapPreview({ lat, lng, name }: { lat: number; lng: number; name: string }) {
  return (
    <div className="h-44 w-full" aria-label={`Mapa de ubicación de ${name}`}>
      <LocationMap position={[lat, lng]} editable={false} />
    </div>
  );
}
