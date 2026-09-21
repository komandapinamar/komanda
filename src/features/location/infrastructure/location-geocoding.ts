export type GeocodingResult = {
  lat: number;
  lng: number;
  formattedAddress: string;
};

export async function searchLocations(
  query: string,
  signal?: AbortSignal,
): Promise<GeocodingResult[]> {
  const normalized = query.trim();
  if (normalized.length < 3) return [];

  const response = await fetch(`/api/geocoding?q=${encodeURIComponent(normalized)}`, {
    signal,
  });
  if (!response.ok) throw new Error("No se pudo buscar la dirección.");
  const data = (await response.json()) as { results?: GeocodingResult[] };
  return data.results ?? [];
}
