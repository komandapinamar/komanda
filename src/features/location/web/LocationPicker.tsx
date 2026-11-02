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
      <div className="grid gap-1.5">
        <label htmlFor="location-search" className="text-body-medium text-text-primary">Buscar dirección</label>
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
          className="rounded-2lg border border-border-button-default bg-background-tertiary-default px-3.5 py-2 text-body-regular text-text-primary placeholder:text-text-tertiary"
          aria-describedby="location-help"
        />
        {results.length > 0 ? (
          <ul className="grid gap-1 rounded-2lg border border-border-button-default bg-background-primary-default p-1.5 shadow-dropdown" role="listbox">
            {results.map((result) => (
              <li key={`${result.lat}:${result.lng}`}>
                <button type="button" className="w-full cursor-pointer rounded-lg px-3 py-2 text-left text-body-2-regular text-text-primary transition hover:bg-background-primary-hover" onClick={() => selectResult(result)}>
                  {result.formattedAddress}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        {searchError ? <p role="alert" className="text-body-2-medium text-status-yellow-text">{searchError} Podés mover el pin manualmente.</p> : null}
      </div>
      <div className="h-64 overflow-hidden rounded-2xl border border-border-button-default" aria-label="Mapa para confirmar ubicación">
        <LocationMap position={position} editable onMove={moveMarker} />
      </div>
      <p id="location-help" className="text-caption-1-regular text-text-secondary">
        Arrastrá el pin o hacé clic en el mapa. La ubicación exacta se publicará en el directorio y podés cambiarla desde Settings.
      </p>
      <p className="text-caption-1-medium text-text-primary">{address || `${position[0].toFixed(6)}, ${position[1].toFixed(6)}`}</p>
      {error ? <p role="alert" className="text-body-2-medium text-status-rose-text">{error}</p> : null}
      <button
        type="button"
        onClick={confirm}
        className={`inline-flex h-9 w-fit cursor-pointer items-center justify-center rounded-2lg px-3.5 text-body-medium transition ${
          hasConfirmed
            ? "bg-status-lime-background text-status-lime-text border border-emerald-500/30"
            : "bg-background-primary-default text-text-primary border border-border-button-default hover:bg-background-primary-hover"
        }`}
      >
        {hasConfirmed ? "Ubicación confirmada" : "Confirmar ubicación pública"}
      </button>
    </div>
  );
}
