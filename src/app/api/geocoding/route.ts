import { NextResponse } from "next/server";

export const runtime = "nodejs";

type PhotonFeature = {
  geometry?: { coordinates?: [number, number] };
  properties?: Record<string, string | undefined>;
};

const cache = new Map<string, { expiresAt: number; results: unknown[] }>();
const requestWindows = new Map<string, { startedAt: number; count: number }>();
const CACHE_TTL_MS = 60_000;
const RATE_WINDOW_MS = 60_000;
const RATE_LIMIT = 30;

function evictExpiredEntries(now: number) {
  for (const [key, value] of cache) {
    if (value.expiresAt <= now) cache.delete(key);
  }
  for (const [key, value] of requestWindows) {
    if (now - value.startedAt >= RATE_WINDOW_MS) requestWindows.delete(key);
  }
}

function formatFeature(feature: PhotonFeature) {
  const coordinates = feature.geometry?.coordinates;
  if (!coordinates || !Number.isFinite(coordinates[0]) || !Number.isFinite(coordinates[1])) {
    return null;
  }
  if (
    coordinates[1] < -90 ||
    coordinates[1] > 90 ||
    coordinates[0] < -180 ||
    coordinates[0] > 180
  ) return null;
  const properties = feature.properties ?? {};
  const address = [
    properties.name,
    properties.street,
    properties.housenumber,
    properties.city,
    properties.state,
    properties.country,
  ]
    .filter(Boolean)
    .join(", ");
  return {
    lat: coordinates[1],
    lng: coordinates[0],
    formattedAddress: address || `${coordinates[1]}, ${coordinates[0]}`,
  };
}

export async function GET(request: Request) {
  const now = Date.now();
  evictExpiredEntries(now);
  const query = new URL(request.url).searchParams.get("q")?.trim().replace(/\s+/g, " ") ?? "";
  if (query.length < 3 || query.length > 200) {
    return NextResponse.json({ results: [] });
  }

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const current = requestWindows.get(ip);
  const window = !current || now - current.startedAt >= RATE_WINDOW_MS
    ? { startedAt: now, count: 1 }
    : { ...current, count: current.count + 1 };
  requestWindows.set(ip, window);
  if (window.count > RATE_LIMIT) {
    return NextResponse.json({ results: [], error: "RATE_LIMITED" }, { status: 429 });
  }

  const cached = cache.get(query.toLowerCase());
  if (cached && cached.expiresAt > Date.now()) return NextResponse.json({ results: cached.results });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5_000);
  try {
    const response = await fetch(
      `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=5`,
      {
        signal: controller.signal,
        headers: {
          Accept: "application/json",
          "User-Agent": "Komanda/1.0 location-search",
        },
      },
    );
    if (!response.ok) {
      return NextResponse.json({ results: [], error: "GEOCODER_UNAVAILABLE" }, { status: 502 });
    }
    const body = (await response.json()) as { features?: PhotonFeature[] };
    const results = (body.features ?? []).map(formatFeature).filter(Boolean).slice(0, 5);
    cache.set(query.toLowerCase(), { expiresAt: Date.now() + CACHE_TTL_MS, results });
    return NextResponse.json({ results });
  } catch {
    return NextResponse.json({ results: [], error: "GEOCODER_UNAVAILABLE" }, { status: 504 });
  } finally {
    clearTimeout(timeout);
  }
}
