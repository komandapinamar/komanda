"use client";

import { useEffect, useState } from "react";
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import type { LatLngExpression } from "leaflet";

const markerIcon = L.divIcon({
  className: "komanda-map-marker",
  html: '<span style="display:block;width:18px;height:18px;border:3px solid white;border-radius:50% 50% 50% 0;background:#111;transform:rotate(-45deg);box-shadow:0 1px 4px #000"></span>',
  iconSize: [18, 18],
  iconAnchor: [9, 18],
});

function MapController({ center }: { center: LatLngExpression }) {
  const map = useMap();
  useEffect(() => {
    map.setView(center);
  }, [center, map]);
  return null;
}

function MapClickHandler({ onMove }: { onMove: (lat: number, lng: number) => void }) {
  useMapEvents({ click: (event) => onMove(event.latlng.lat, event.latlng.lng) });
  return null;
}

export function LocationMap({
  position,
  editable,
  onMove,
}: {
  position: [number, number];
  editable: boolean;
  onMove?: (lat: number, lng: number) => void;
}) {
  const [tileError, setTileError] = useState(false);
  const [tileVersion, setTileVersion] = useState(0);
  return (
    <div className="relative h-full w-full">
    <MapContainer center={position} zoom={15} scrollWheelZoom className="h-full w-full">
      <TileLayer
        key={tileVersion}
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap contributors</a> &middot; <a href="https://www.openstreetmap.fr/" target="_blank" rel="noreferrer">OpenStreetMap France</a>'
        subdomains={["a", "b", "c"]}
        url="https://{s}.tile.openstreetmap.fr/osmfr/{z}/{x}/{y}.png"
        eventHandlers={{ error: () => setTileError(true), load: () => setTileError(false) }}
      />
      <MapController center={position} />
      {editable && onMove ? <MapClickHandler onMove={onMove} /> : null}
      <Marker
        position={position}
        icon={markerIcon}
        draggable={editable}
        eventHandlers={editable && onMove ? { dragend: (event) => {
          const marker = event.target as L.Marker;
          const point = marker.getLatLng();
          onMove(point.lat, point.lng);
        } } : undefined}
      />
    </MapContainer>
    {tileError ? <div className="absolute inset-x-2 top-2 z-[1000] rounded bg-white/95 p-2 text-xs text-zinc-800 shadow">No se pudieron cargar los tiles. <button type="button" className="font-semibold underline" onClick={() => { setTileError(false); setTileVersion((value) => value + 1); }}>Reintentar</button></div> : null}
    </div>
  );
}
