"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import type { LocationAddress } from "@/features/location/application/location.schemas";
import { searchLocations, type GeocodingResult } from "@/features/location/infrastructure/location-geocoding";

const LocationMap = dynamic(
  () => import("./LocationMap").then((module) => module.LocationMap),
  { ssr: false, loading: () => <div className="grid h-full place-items-center text-sm text-zinc-500">Cargando mapa...</div> },
);

const configuredFallback = [
  Number(process.env.NEXT_PUBLIC_LOCATION_FALLBACK_LAT),
  Number(process.env.NEXT_PUBLIC_LOCATION_FALLBACK_LNG),
] as [number, number];
const PINAMAR_FALLBACK: [number, number] =
  Number.isFinite(configuredFallback[0]) && Number.isFinite(configuredFallback[1])
    ? configuredFallback
    : [-37.1075, -56.8614];

export function LocationPicker({
  initialValue,
  onConfirm,
  error,
}: {
  initialValue?: LocationAddress | null;
  onConfirm: (location: LocationAddress) => void;
  error?: string | null;
}) {
  const initialPosition: [number, number] = initialValue
    ? [initialValue.lat, initialValue.lng]
    : PINAMAR_FALLBACK;
  const [position, setPosition] = useState(initialPosition);
  const [address, setAddress] = useState(initialValue?.formattedAddress ?? "");
  const [query, setQuery] = useState(initialValue?.formattedAddress ?? "");
  const [results, setResults] = useState<GeocodingResult[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [hasConfirmed, setHasConfirmed] = useState(Boolean(initialValue));
  const hasInteracted = useRef(Boolean(initialValue));

  useEffect(() => {
    if (initialValue) return;
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        if (!hasInteracted.current) setPosition([coords.latitude, coords.longitude]);
      },
      () => undefined,
      { timeout: 5_000 },
    );
  }, [initialValue]);

  useEffect(() => {
    const normalized = query.trim();
    if (normalized.length < 3) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        setSearchError(null);
        setResults(await searchLocations(normalized, controller.signal));
      } catch (cause) {
        if (!controller.signal.aborted) setSearchError(cause instanceof Error ? cause.message : "No se pudo buscar la dirección.");
      }
    }, 350);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [query]);

  function moveMarker(lat: number, lng: number) {
    hasInteracted.current = true;
    setPosition([lat, lng]);
    setHasConfirmed(false);
  }

  function selectResult(result: GeocodingResult) {
    hasInteracted.current = true;
    setPosition([result.lat, result.lng]);
    setAddress(result.formattedAddress);
    setQuery(result.formattedAddress);
    setResults([]);
    setHasConfirmed(false);
  }

  function confirm() {
    const value: LocationAddress = {
      lat: Number(position[0].toFixed(6)),
      lng: Number(position[1].toFixed(6)),
      formattedAddress: address.trim() || null,
      geocoderProvider: address.trim() ? "photon" : undefined,
    };
    onConfirm(value);
    setHasConfirmed(true);
  }

  return (
    <div className="grid gap-4">
      <div className="grid gap-2">
        <label htmlFor="location-search" className="text-sm font-medium text-zinc-200">Buscar dirección</label>
        <input
          id="location-search"
          value={query}
          onChange={(event) => {
            const value = event.target.value;
            setQuery(value);
            setResults([]);
            setSearchError(null);
          }}
          placeholder="Escribí una dirección o comercio"
          className="rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm"
          aria-describedby="location-help"
        />
        {results.length > 0 ? (
          <ul className="grid gap-1 rounded-md border border-zinc-700 bg-zinc-950 p-1" role="listbox">
            {results.map((result) => (
              <li key={`${result.lat}:${result.lng}`}>
                <button type="button" className="w-full rounded px-2 py-2 text-left text-sm hover:bg-zinc-800" onClick={() => selectResult(result)}>
                  {result.formattedAddress}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        {searchError ? <p role="alert" className="text-sm text-amber-300">{searchError} Podés mover el pin manualmente.</p> : null}
      </div>
      <div className="h-64 overflow-hidden rounded-lg border border-zinc-700" aria-label="Mapa para confirmar ubicación">
        <LocationMap position={position} editable onMove={moveMarker} />
      </div>
      <p id="location-help" className="text-xs text-zinc-400">
        Arrastrá el pin o hacé clic en el mapa. La ubicación exacta se publicará en el directorio y podés cambiarla desde Settings.
      </p>
      <p className="text-xs text-zinc-300">{address || `${position[0].toFixed(6)}, ${position[1].toFixed(6)}`}</p>
      {error ? <p role="alert" className="text-sm text-red-400">{error}</p> : null}
      <button type="button" onClick={confirm} className="w-fit rounded-md bg-(--color-accent-secondary) px-4 py-2 text-sm font-semibold text-black">
        {hasConfirmed ? "Ubicación confirmada" : "Confirmar ubicación pública"}
      </button>
    </div>
  );
}
