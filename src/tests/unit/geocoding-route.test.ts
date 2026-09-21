import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/geocoding/route";

describe("geocoding route", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("normalizes Photon longitude/latitude pairs and filters invalid features", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            features: [
              {
                geometry: { coordinates: [-56.8614, -37.1075] },
                properties: { street: "Av. Bunge", housenumber: "123", city: "Pinamar" },
              },
              { geometry: { coordinates: [181, -37] }, properties: { name: "invalid" } },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );

    const response = await GET(new Request("http://localhost/api/geocoding?q=Av%20Bunge"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.results).toEqual([
      {
        lat: -37.1075,
        lng: -56.8614,
        formattedAddress: "Av. Bunge, 123, Pinamar",
      },
    ]);
  });

  it("returns a bounded error when Photon is unavailable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 503 })));

    const response = await GET(new Request("http://localhost/api/geocoding?q=Pinamar"));

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ results: [], error: "GEOCODER_UNAVAILABLE" });
  });
});
