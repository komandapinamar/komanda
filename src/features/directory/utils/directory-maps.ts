export type LocationAddressPayload = {
  street?: string;
  number?: string | number;
  city?: string;
  state?: string;
  country?: string;
  postalCode?: string;
  formatted?: string;
  formattedAddress?: string;
  query?: string;
  raw?: string;
  lat?: number;
  lng?: number;
  latitude?: number;
  longitude?: number;
};

export type ResolvedLocationInfo = {
  displayAddress: string | null;
  mapQuery: string;
};

export function parseLocationAddress(
  rawAddress: unknown,
  locationName: string | null,
  tenantName: string,
): ResolvedLocationInfo {
  if (typeof rawAddress === "string" && rawAddress.trim()) {
    const cleaned = rawAddress.trim();
    return {
      displayAddress: cleaned,
      mapQuery: cleaned,
    };
  }

  if (rawAddress && typeof rawAddress === "object" && !Array.isArray(rawAddress)) {
    const obj = rawAddress as LocationAddressPayload;

    const lat =
      typeof obj.lat === "number"
        ? obj.lat
        : typeof obj.latitude === "number"
          ? obj.latitude
          : null;
    const lng =
      typeof obj.lng === "number"
        ? obj.lng
        : typeof obj.longitude === "number"
          ? obj.longitude
          : null;

    const formatted =
      (typeof obj.formattedAddress === "string" && obj.formattedAddress.trim()) ||
      (typeof obj.formatted === "string" && obj.formatted.trim()) ||
      (typeof obj.raw === "string" && obj.raw.trim()) ||
      null;

    const streetParts = [obj.street, obj.number].filter(Boolean).map(String).join(" ").trim();
    const addressParts = [streetParts, obj.city, obj.state, obj.country]
      .filter(Boolean)
      .map(String)
      .join(", ")
      .trim();

    const displayAddress = formatted || (addressParts.length > 0 ? addressParts : null);

    let mapQuery = "";
    if (lat !== null && lng !== null) {
      mapQuery = `${lat},${lng}`;
    } else if (typeof obj.query === "string" && obj.query.trim()) {
      mapQuery = obj.query.trim();
    } else if (formatted) {
      mapQuery = formatted;
    } else if (addressParts) {
      mapQuery = addressParts;
    }

    if (mapQuery) {
      return {
        displayAddress,
        mapQuery,
      };
    }
  }

  const isGeneric =
    !locationName ||
    ["local principal", "sede principal", "sucursal principal"].includes(
      locationName.trim().toLowerCase(),
    );

  const meaningfulLocationName = !isGeneric ? locationName!.trim() : null;
  const fallbackQuery = meaningfulLocationName
    ? `${tenantName}, ${meaningfulLocationName}`
    : tenantName;

  return {
    displayAddress: meaningfulLocationName,
    mapQuery: fallbackQuery,
  };
}

export function buildGoogleMapsEmbedUrl(query: string): string {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY;
  if (apiKey) {
    return `https://www.google.com/maps/embed/v1/place?key=${encodeURIComponent(apiKey)}&q=${encodeURIComponent(query)}`;
  }
  return `https://www.google.com/maps?q=${encodeURIComponent(query)}&output=embed`;
}

export function buildGoogleMapsDirectUrl(query: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}
