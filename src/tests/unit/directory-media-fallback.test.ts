import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { LocationMapPreview } from "@/features/location/web/LocationMapPreview";
import { PublicDirectoryView } from "@/features/directory/web/PublicDirectoryView";

describe("public directory media fallbacks", () => {
  it("renders map tiles, a marker and attribution without waiting for client JavaScript", () => {
    const html = renderToStaticMarkup(
      createElement(LocationMapPreview, { lat: -37.1075, lng: -56.8614, name: "Pinamar" }),
    );
    expect(html).toContain("Mapa de ubicación de Pinamar");
    expect(html).toContain("tile.openstreetmap.fr/osmfr/15/11208/20025.png");
    expect(html).toContain("Ubicación de Pinamar: -37.107500, -56.861400");
    expect(html).toContain("OpenStreetMap contributors");
    expect(html).not.toContain("Cargando mapa...");
  });

  it("includes a static poster behind the muted inline background video", () => {
    const html = renderToStaticMarkup(createElement(PublicDirectoryView, { tenants: [] }));
    expect(html).toContain("bg-cover bg-center");
    expect(html).toContain("overflow-x-clip");
    expect(html).toContain("h-[65px]");
    expect(html).toContain("Registrar Negocio");
    expect(html).toContain('poster="/videos/directory-bg-poster.webp"');
    expect(html).toContain("playsinline");
    expect(html).toContain('muted=""');
  });
});
