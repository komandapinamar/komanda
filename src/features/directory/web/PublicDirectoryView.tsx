"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import type { PublicDirectoryTenant } from "@/features/tenancy/application/public-tenant.service";
import {
  buildGoogleMapsDirectUrl,
} from "@/features/directory/utils/directory-maps";
import { LocationMapPreview } from "@/features/location/web/LocationMapPreview";
import type {
  SearchResultData,
} from "@/features/search/domain/search.schemas";
import { ProductSearchResultCard } from "@/features/directory/web/ProductSearchResultCard";
import { buildStorefrontUrl } from "@/features/tenancy/utils/storefront-url";

export type DirectoryTenantItem = PublicDirectoryTenant & {
  storefrontUrl: string;
};

type Props = {
  tenants: DirectoryTenantItem[];
};

function checkIsMobile(): boolean {
  if (typeof window === "undefined" || typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  const mobileRegex = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i;
  return mobileRegex.test(ua) || window.innerWidth < 768;
}

const emptySubscribe = () => () => {};

export function PublicDirectoryView({ tenants }: Props) {
  const [searchTerm, setSearchTerm] = useState("");
  const isMobile = useSyncExternalStore(emptySubscribe, checkIsMobile, () => false);
  const [showAppBanner, setShowAppBanner] = useState(true);
  const videoRef = useRef<HTMLVideoElement>(null);

  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searchResults, setSearchResults] = useState<SearchResultData | null>(null);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.defaultMuted = true;
      videoRef.current.muted = true;
      videoRef.current.play().catch(() => {});
    }
  }, []);

  // Debounced server search with AbortController (AD-7)
  useEffect(() => {
    const trimmed = searchTerm.trim();
    if (!trimmed) {
      setSearchResults(null);
      setSearchError(null);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    setSearchError(null);

    const controller = new AbortController();
    const timeoutId = setTimeout(async () => {
      try {
        const response = await fetch(
          `/api/v1/search?q=${encodeURIComponent(trimmed)}`,
          {
            signal: controller.signal,
          },
        );

        if (!response.ok) {
          throw new Error(`HTTP error ${response.status}`);
        }

        const json = await response.json();
        if (json.success && json.data) {
          setSearchResults(json.data);
        } else {
          throw new Error(json.error?.message || "Error al buscar productos.");
        }
      } catch (err: unknown) {
        if ((err as Error)?.name === "AbortError") {
          return;
        }
        setSearchResults(null);
        setSearchError(
          err instanceof Error
            ? err.message
            : "No se pudo conectar con el servidor de búsqueda.",
        );
      } finally {
        if (!controller.signal.aborted) {
          setIsSearching(false);
        }
      }
    }, 250);

    return () => {
      clearTimeout(timeoutId);
      controller.abort();
    };
  }, [searchTerm]);

  // Client-side fallback filter if server search fails or is empty
  const fallbackFilteredTenants = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return tenants;
    return tenants.filter(
      (t) =>
        t.name.toLowerCase().includes(term) ||
        t.slug.toLowerCase().includes(term) ||
        (t.locationName && t.locationName.toLowerCase().includes(term)) ||
        (t.locationAddress && t.locationAddress.toLowerCase().includes(term)),
    );
  }, [tenants, searchTerm]);

  const hasSearchQuery = searchTerm.trim().length > 0;
  const isServerSearchActive = hasSearchQuery && searchResults !== null && !searchError;

  const products = isServerSearchActive ? searchResults.products : [];
  const businesses = isServerSearchActive ? searchResults.businesses : [];

  const totalResultsCount = isServerSearchActive
    ? products.length + businesses.length
    : fallbackFilteredTenants.length;

  return (
    <div className="relative flex min-h-screen flex-col justify-between overflow-x-hidden text-zinc-100">
      {/* Background Video Layer */}
      <div className="fixed inset-0 z-0 overflow-hidden pointer-events-none">
        <video
          ref={videoRef}
          autoPlay
          loop
          muted
          playsInline
          poster="/videos/directory-bg-poster.webp"
          className="h-full w-full object-cover scale-105"
        >
          <source src="/videos/directory-bg.mp4" type="video/mp4" />
          <source src="/videos/directory-bg.webm" type="video/webm" />
        </video>
        {/* Dark Overlay for Readability and Contrast */}
        <div className="absolute inset-0 bg-black/45" />
      </div>

      <div className="flex-1">
        {/* Mobile Device Banner for Komanda App */}
        {isMobile && showAppBanner && (
          <aside
            aria-label="Descargar Komanda App"
            className="sticky top-0 z-30 flex items-center justify-between border-b border-[var(--color-accent-tertiary)]/20 bg-[var(--color-accent-primary)] px-4 py-2.5 text-xs text-[var(--color-accent-tertiary)] backdrop-blur-md"
          >
            <div className="flex flex-col sm:flex-row sm:items-center gap-0.5 sm:gap-2">
              <span className="font-semibold text-[var(--color-accent-tertiary)]">¿Estás en tu celular?</span>
              <span className="text-[var(--color-accent-tertiary)]/80">Podés usar Komanda App para una mejor experiencia.</span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Link
                href="/app"
                className="rounded-full bg-[var(--color-accent-secondary)] px-3 py-1 font-semibold text-[var(--color-accent-primary)] hover:bg-[var(--color-accent-tertiary)] transition-colors whitespace-nowrap"
              >
                Abrir App
              </Link>
              <button
                type="button"
                onClick={() => setShowAppBanner(false)}
                className="text-[var(--color-accent-tertiary)]/60 hover:text-[var(--color-accent-tertiary)] px-1"
                aria-label="Cerrar aviso"
              >
                ✕
              </button>
            </div>
          </aside>
        )}

        {/* Top Navigation */}
        <header className="sticky top-0 z-20 border-b-2 border-white/10 bg-black/60 px-6 py-4 backdrop-blur-md">
          <div className="mx-auto flex max-w-6xl items-center justify-between">
            <div className="flex items-center gap-2">
              <Link
                className="text-2xl font-black tracking-tighter text-white transition hover:text-[var(--color-accent-secondary)] font-semibold"
                href="/"
              >
                Komanda
              </Link>
            </div>
            <div className="flex items-center gap-3">
              <Link
                href="/register"
                className="rounded-lg bg-[var(--color-accent-secondary)] px-4 py-1.5 text-xs font-semibold text-[var(--color-accent-primary)] transition hover:bg-[var(--color-accent-tertiary)] hover:opacity-90"
              >
                Registrar Negocio
              </Link>
            </div>
          </div>
        </header>

        {/* Hero Section */}
        <section className="relative z-10 mx-auto max-w-6xl px-6 pt-20 pb-12 text-center">
          <h1 className="mb-6 text-6xl font-black uppercase leading-[0.9] tracking-tighter text-white md:text-7xl drop-shadow-lg">
            Pedí, Pagá y Disfrutá.
          </h1>
          <p className="mx-auto max-w-2xl text-lg font-bold text-zinc-300 drop-shadow">
            Explorá nuestra oferta gastronómica y gestioná tu pedido en segundos.
          </p>

          {/* Search Bar */}
          <div className="mx-auto mt-10 max-w-xl">
            <div className="relative">
              <input
                type="search"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscá productos, negocios o ubicaciones..."
                className="w-full rounded-2xl bg-white/95 px-6 py-4 text-base font-normal text-zinc-900 placeholder:text-zinc-500 backdrop-blur-sm focus:outline-none focus:ring-4 focus:ring-[var(--color-accent-secondary)]"
              />
              {isSearching && (
                <div className="absolute right-4 top-1/2 -translate-y-1/2">
                  <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-zinc-400 border-t-black" />
                </div>
              )}
            </div>

            <div className="mt-3 flex items-center justify-between text-xs font-black uppercase tracking-wider text-zinc-400">
              <span>
                {hasSearchQuery
                  ? isServerSearchActive
                    ? `${products.length} productos y ${businesses.length} locales encontrados`
                    : `${totalResultsCount} resultados`
                  : `${tenants.length} locales disponibles`}
              </span>
              {hasSearchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchTerm("")}
                  className="text-zinc-400 hover:text-white underline cursor-pointer"
                >
                  Limpiar
                </button>
              )}
            </div>

            {searchError && (
              <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-950/40 p-3 text-left text-xs text-amber-200">
                <p className="font-semibold">Búsqueda en vivo no disponible: {searchError}</p>
                <p className="mt-0.5 text-amber-300/80">Mostrando comercios disponibles localmente.</p>
              </div>
            )}
          </div>
        </section>

        {/* Search Results / Tenants Grid */}
        <section className="relative z-10 mx-auto max-w-6xl px-6 pb-24 space-y-12">
          {/* SECTION 1: PRODUCTOS (when searching on server and products exist) */}
          {isServerSearchActive && products.length > 0 && (
            <div className="space-y-6">
              <div className="border-b-2 border-white/20 pb-3 flex items-center justify-between">
                <h2 className="text-2xl font-black uppercase tracking-tight text-white flex items-center gap-2">
                  <span>Productos</span>
                  <span className="rounded-full bg-[var(--color-accent-secondary)] px-2.5 py-0.5 text-xs text-black">
                    {products.length}
                  </span>
                </h2>
              </div>

              <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {products.map((product) => (
                  <ProductSearchResultCard key={product.itemId} product={product} />
                ))}
              </div>
            </div>
          )}

          {/* SECTION 2: COMERCIOS (either from server search or initial directory list) */}
          {(!isServerSearchActive || businesses.length > 0 || !hasSearchQuery) && (
            <div className="space-y-6">
              {isServerSearchActive && (
                <div className="border-b-2 border-white/20 pb-3 flex items-center justify-between">
                  <h2 className="text-2xl font-black uppercase tracking-tight text-white flex items-center gap-2">
                    <span>Comercios</span>
                    <span className="rounded-full bg-[var(--color-accent-secondary)] px-2.5 py-0.5 text-xs text-black">
                      {businesses.length}
                    </span>
                  </h2>
                </div>
              )}

              <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-1">
                {(isServerSearchActive ? businesses : fallbackFilteredTenants).map((tenant) => {
                  const storefrontUrl =
                    "storefrontUrl" in tenant
                      ? (tenant as DirectoryTenantItem).storefrontUrl
                      : `${buildStorefrontUrl(tenant.slug, typeof window !== "undefined" ? { host: window.location.host, protocol: window.location.protocol } : undefined)}/order`;

                  return (
                    <article
                      key={tenant.id}
                      data-testid="search-business-card"
                      className="flex flex-col justify-between rounded-xl border-2 border-zinc-200 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] backdrop-blur-2xl p-6 transition hover:-translate-y-1 hover:shadow-[8px_8px_0_0_var(--color-zinc-200)]"
                    >
                      <div>
                        <div className="flex items-start gap-4">
                          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-sm border-3 border-black bg-[var(--color-accent-secondary)] text-2xl font-black text-black shadow-[0px_0px_0px_3px_var(--color-zinc-100)]">
                            {tenant.name.slice(0, 1).toUpperCase()}
                          </div>
                          <div className="min-w-0 flex-1">
                            <h2 className="truncate text-3xl font-black uppercase tracking-tight text-white underline">
                              {tenant.name}
                            </h2>
                            <p className="text-xs font-bold uppercase tracking-wider text-zinc-500">
                              @{tenant.slug}
                            </p>
                          </div>
                        </div>

                        <div className="mt-5 space-y-3">
                          {/* Mapa abierto del local confirmado */}
                          <div className="pt-1">
                            <div className="overflow-hidden rounded-xl border-3 border-black bg-zinc-100 shadow-[3px_3px_0_0_black]">
                              <div className="flex items-center justify-between border-b-2 border-black bg-zinc-50 px-3 py-1.5 text-xs font-bold text-zinc-800">
                                <span className="truncate text-[11px] font-bold text-zinc-700">
                                  Ubicación
                                </span>
                                <a
                                  href={buildGoogleMapsDirectUrl(tenant.mapQuery)}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="shrink-0 text-[10px] font-black uppercase tracking-wide text-zinc-900 underline hover:text-black"
                                  title="Abrir en Google Maps"
                                >
                                  Como llegar ↗
                                </a>
                              </div>
                              <div className="relative h-44 w-full bg-zinc-200">
                                <LocationMapPreview
                                  lat={tenant.lat}
                                  lng={tenant.lng}
                                  name={tenant.name}
                                />
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="mt-8">
                        <a
                          href={storefrontUrl}
                          className="block w-full rounded-xl border-2 border-[var(--color-zinc-200)] py-3 px-4 text-center text-sm font-black uppercase tracking-wider text-[var(--color-accent-secondary)] shadow-[3px_3px_0_0_black] transition hover:bg-zinc-500 active:translate-x-[1px] active:translate-y-[1px] active:shadow-[2px_2px_0_0_white]"
                        >
                          Ver Menú & Pedir →
                        </a>
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>
          )}

          {/* EMPTY STATES */}
          {((isServerSearchActive && products.length === 0 && businesses.length === 0) ||
            (!isServerSearchActive && fallbackFilteredTenants.length === 0)) && (
            <div className="rounded-2xl border-4 border-dashed border-white/30 bg-black/40 p-12 text-center backdrop-blur-sm">
              {tenants.length === 0 ? (
                <div className="mx-auto max-w-md space-y-4">
                  <p className="text-2xl font-black uppercase text-white">
                    No hay locales activos disponibles
                  </p>
                  <p className="text-sm font-bold text-zinc-300">
                    Actualmente no hay locales gastronómicos disponibles para pedir. Si administrás un local, ingresá a tu panel.
                  </p>
                  <Link
                    href="/login"
                    className="inline-block rounded-xl border-3 border-black bg-[var(--color-accent-secondary)] px-6 py-3 text-sm font-black uppercase tracking-wider text-black shadow-[3px_3px_0_0_black]"
                  >
                    Ir al Panel de Administración
                  </Link>
                </div>
              ) : (
                <div className="mx-auto max-w-md space-y-3">
                  <p className="text-xl font-black uppercase text-white">
                    No se encontraron productos ni locales
                  </p>
                  <p className="text-sm font-bold text-zinc-300">
                    Ningún producto ni comercio coincide con &ldquo;{searchTerm}&rdquo;. Intentá con otro término de búsqueda.
                  </p>
                  <button
                    type="button"
                    onClick={() => setSearchTerm("")}
                    className="mt-2 text-sm font-black underline uppercase text-[var(--color-accent-secondary)] hover:text-amber-300 cursor-pointer"
                  >
                    Restablecer búsqueda
                  </button>
                </div>
              )}
            </div>
          )}
        </section>
      </div>

      {/* Footer */}
      <footer className="relative z-10 mt-auto border-t border-white/10 bg-black/60 px-6 py-6 backdrop-blur-md mb-0">
        <div className="mx-auto flex flex-col items-center justify-between gap-4 text-center">
          <div>
            <Link href="/login" className="text-2xl font-normal text-white tracking-tighter">
              Komanda Business
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
