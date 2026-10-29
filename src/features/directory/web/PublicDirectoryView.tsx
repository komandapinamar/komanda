"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import type { PublicDirectoryTenant } from "@/features/tenancy/application/public-tenant.service";
import { buildGoogleMapsDirectUrl } from "@/features/directory/utils/directory-maps";
import { LocationMapPreview } from "@/features/location/web/LocationMapPreview";
import type { SearchResultData } from "@/features/search/domain/search.schemas";
import { ProductSearchResultCard } from "@/features/directory/web/ProductSearchResultCard";
import { OpeningHoursSummary } from "@/features/directory/web/OpeningHoursSummary";
import { AsciiVideoOverlay } from "@/features/directory/web/AsciiVideoOverlay";
import { buildStorefrontUrl } from "@/features/tenancy/utils/storefront-url";

export type DirectoryTenantItem = PublicDirectoryTenant & {
  storefrontUrl: string;
};

type Props = {
  tenants: DirectoryTenantItem[];
};

export function PublicDirectoryView({ tenants }: Props) {
  const [searchTerm, setSearchTerm] = useState("");
  const headerSlotRef = useRef<HTMLDivElement>(null);
  const [isPinned, setIsPinned] = useState(false);
  const [showRegister, setShowRegister] = useState(true);
  const videoRef = useRef<HTMLVideoElement>(null);
  const autoplayBlocked = useRef(false);
  const [videoPlaying, setVideoPlaying] = useState(false);

  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searchResults, setSearchResults] = useState<SearchResultData | null>(
    null,
  );

  useEffect(() => {
    let lastScrollY = Math.max(
      window.scrollY,
      document.documentElement.scrollTop,
      document.body.scrollTop,
    );
    const onScroll = () => {
      const scrollY = Math.max(
        window.scrollY,
        document.documentElement.scrollTop,
        document.body.scrollTop,
      );
      const pinned =
        (headerSlotRef.current?.getBoundingClientRect().top ?? 1) < 0;
      setIsPinned(pinned);
      if (!pinned) {
        setShowRegister(true);
        lastScrollY = scrollY;
      } else if (Math.abs(scrollY - lastScrollY) > 8) {
        setShowRegister(scrollY < lastScrollY);
        lastScrollY = scrollY;
      }
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    document.addEventListener("scroll", onScroll, {
      capture: true,
      passive: true,
    });
    const frame = window.requestAnimationFrame(onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      document.removeEventListener("scroll", onScroll, true);
      window.cancelAnimationFrame(frame);
    };
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const motionPreference = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    );
    video.defaultMuted = true;
    video.muted = true;

    const play = () => {
      if (
        document.hidden ||
        motionPreference.matches ||
        autoplayBlocked.current
      )
        return;
      video.play().catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "NotAllowedError") {
          autoplayBlocked.current = true;
        }
        setVideoPlaying(false);
      });
    };
    const onMotionChange = () => {
      if (motionPreference.matches) {
        video.pause();
        setVideoPlaying(false);
      } else {
        play();
      }
    };
    const onVisibilityChange = () => {
      if (!document.hidden) play();
    };
    if (motionPreference.matches) {
      video.pause();
    } else {
      play();
    }
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("pageshow", play);
    if (motionPreference.addEventListener) {
      motionPreference.addEventListener("change", onMotionChange);
    } else {
      motionPreference.addListener(onMotionChange);
    }
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("pageshow", play);
      if (motionPreference.removeEventListener) {
        motionPreference.removeEventListener("change", onMotionChange);
      } else {
        motionPreference.removeListener(onMotionChange);
      }
    };
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
  const isServerSearchActive =
    hasSearchQuery && searchResults !== null && !searchError;

  const directoryById = useMemo(
    () => new Map(tenants.map((tenant) => [tenant.id, tenant])),
    [tenants],
  );

  const products = isServerSearchActive ? searchResults.products : [];
  const businesses = isServerSearchActive ? searchResults.businesses : [];

  const totalResultsCount = isServerSearchActive
    ? products.length + businesses.length
    : fallbackFilteredTenants.length;

  return (
    <div className="relative flex min-h-svh flex-col justify-between overflow-x-clip bg-[#141416] text-[#f4f3f1] antialiased">
      {/* Background Video & Live ASCII Layer */}
      <div className="pointer-events-none fixed inset-x-0 top-0 z-0 h-[100svh] overflow-hidden bg-cover bg-center bg-[url('/videos/directory-bg-poster.webp')]">
        <video
          ref={videoRef}
          autoPlay
          loop
          muted
          playsInline
          webkit-playsinline="true"
          preload="auto"
          poster="/videos/directory-bg-poster.webp"
          onPlaying={() => setVideoPlaying(true)}
          onPause={() => setVideoPlaying(false)}
          onError={() => setVideoPlaying(false)}
          className={`h-full w-full object-cover ${videoPlaying ? "opacity-100" : "opacity-0"}`}
        >
          <source src="/videos/directory-bg.mp4" type="video/mp4" />
          <source src="/videos/directory-bg.webm" type="video/webm" />
        </video>
        <AsciiVideoOverlay videoRef={videoRef} />
      </div>

      {/* Architectural Dabbit Stage Container */}
      <div className="relative z-10 flex min-h-svh w-full flex-1 flex-col justify-between 2xl:mx-auto 2xl:max-w-[1440px] 2xl:border-x 2xl:border-white/[0.08]">
        <div>
          {/* Floating Liquid Glass Pill Navigation */}
          <div ref={headerSlotRef} className="relative z-30 h-[65px]">
            <header
              className={`${
                isPinned ? "fixed inset-x-0 top-4 z-50" : "relative pt-4"
              } px-5 sm:px-8 lg:px-10`}
            >
              <div className="liquid-glass-pill mx-auto flex max-w-4xl items-center justify-between rounded-full px-4 py-2">
                <div className="flex items-center gap-2.5 pl-2">
                  <Link
                    className="text-base font-medium tracking-tight text-[#f4f3f1] transition hover:opacity-80"
                    href="/"
                  >
                    Komanda
                  </Link>
                </div>

                <div className="flex items-center gap-2">
                  <Link
                    href="/login"
                    className="rounded-full px-3.5 py-1.5 text-xs font-medium text-[#9b9ba4] transition hover:text-[#f4f3f1]"
                  >
                    Ingresar
                  </Link>
                  <div
                    aria-hidden={isPinned && !showRegister}
                    className={`flex items-center overflow-hidden transition-[max-width,opacity,transform] duration-300 ease-out motion-reduce:transition-none ${
                      isPinned && !showRegister
                        ? "pointer-events-none max-w-0 translate-x-2 opacity-0"
                        : "max-w-48 translate-x-0 opacity-100"
                    }`}
                  >
                    <Link
                      href="/register"
                      tabIndex={isPinned && !showRegister ? -1 : undefined}
                      className="inline-flex h-8 items-center justify-center whitespace-nowrap rounded-full bg-[#f4f3f1] px-4 text-xs font-medium text-[#141416] transition hover:bg-white active:scale-[0.98]"
                    >
                      Registrar Negocio
                    </Link>
                  </div>
                </div>
              </div>
            </header>
          </div>

          {/* Dabbit Editorial Split Hero */}
          <section className="grid w-full grid-cols-1 gap-8 border-b border-white/[0.08] px-5 pt-12 pb-12 sm:px-8 lg:grid-cols-[1.15fr_0.85fr] lg:items-end lg:px-10 lg:pt-16 lg:pb-14">
            <div className="max-w-xl space-y-3 text-pretty">
              <h1 className="text-3xl font-medium tracking-tight text-[#f4f3f1] sm:text-5xl lg:text-balance">
                Pedí, pagá y disfrutá sin filas.
              </h1>
              <p className="text-base/6 text-[#9b9ba4] sm:text-lg/7">
                Explorá comercios y cartas digitales en vivo. Elegí tus platos
                o productos, personalizalos a tu gusto y retiralos listos.
              </p>
            </div>

            {/* Liquid Glass Loupe Search Module */}
            <div className="w-full">
              <div className="liquid-prism-ring liquid-glass-card rounded-3xl p-4 sm:p-5">
                <div className="relative flex items-center">
                  <svg
                    className="pointer-events-none absolute left-4 size-4 text-[#9b9ba4]"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <circle cx="11" cy="11" r="8" />
                    <path d="m21 21-4.3-4.3" />
                  </svg>
                  <input
                    type="search"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Buscá productos, negocios o ubicaciones..."
                    className="h-11 w-full rounded-full border border-white/10 bg-[#141416]/85 pl-11 pr-10 text-sm text-[#f4f3f1] placeholder:text-[#9b9ba4]/75 focus:border-white/30 focus:outline-none focus:ring-2 focus:ring-white/15"
                  />
                  {isSearching && (
                    <div className="absolute right-4 top-1/2 -translate-y-1/2">
                      <span className="inline-block size-4 animate-spin rounded-full border-2 border-white/25 border-t-[#f4f3f1]" />
                    </div>
                  )}
                </div>

                <div className="mt-3 flex items-center justify-between px-2 text-xs text-[#9b9ba4] tabular-nums">
                  <span className="flex items-center gap-2">
                    <span className="size-1.5 rounded-full bg-emerald-400" />
                    {hasSearchQuery
                      ? isServerSearchActive
                        ? `${products.length} productos · ${businesses.length} locales`
                        : `${totalResultsCount} resultados`
                      : `${tenants.length} ${tenants.length === 1 ? "local disponible" : "locales disponibles"}`}
                  </span>
                  {hasSearchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchTerm("")}
                      className="font-medium text-[#f4f3f1] transition hover:opacity-75 cursor-pointer"
                    >
                      Limpiar
                    </button>
                  )}
                </div>

                {searchError && (
                  <div className="mt-3 rounded-2xl border border-amber-400/20 bg-amber-500/10 px-3.5 py-2.5 text-left text-xs text-amber-200">
                    <p className="font-medium">
                      Búsqueda en vivo no disponible: {searchError}
                    </p>
                    <p className="mt-0.5 text-amber-200/70">
                      Mostrando comercios disponibles localmente.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* Search Results / Tenants Architectural Grid */}
          <section className="w-full px-5 py-10 sm:px-8 lg:px-10 space-y-12">
            {/* SECTION 1: PRODUCTOS */}
            {isServerSearchActive && products.length > 0 && (
              <div className="space-y-5">
                <div className="flex items-center justify-between border-b border-white/[0.08] pb-3">
                  <h2 className="flex items-center gap-2.5 text-xl font-medium tracking-tight text-[#f4f3f1]">
                    <span>Productos encontrados</span>
                    <span className="rounded-full border border-white/12 bg-white/8 px-2.5 py-0.5 text-xs font-medium text-[#9b9ba4] tabular-nums">
                      {products.length}
                    </span>
                  </h2>
                </div>

                <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                  {products.map((product) => (
                    <ProductSearchResultCard
                      key={product.itemId}
                      product={product}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* SECTION 2: COMERCIOS */}
            {(!isServerSearchActive ||
              businesses.length > 0 ||
              !hasSearchQuery) && (
              <div className="space-y-5">
                {isServerSearchActive && (
                  <div className="flex items-center justify-between border-b border-white/[0.08] pb-3">
                    <h2 className="flex items-center gap-2.5 text-xl font-medium tracking-tight text-[#f4f3f1]">
                      <span>Comercios</span>
                      <span className="rounded-full border border-white/12 bg-white/8 px-2.5 py-0.5 text-xs font-medium text-[#9b9ba4] tabular-nums">
                        {businesses.length}
                      </span>
                    </h2>
                  </div>
                )}

                <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-2">
                  {(isServerSearchActive
                    ? businesses
                    : fallbackFilteredTenants
                  ).map((tenant) => {
                    const storefrontUrl =
                      "storefrontUrl" in tenant
                        ? (tenant as DirectoryTenantItem).storefrontUrl
                        : `${buildStorefrontUrl(tenant.slug, typeof window !== "undefined" ? { host: window.location.host, protocol: window.location.protocol } : undefined)}/order`;
                    const directoryTenant = directoryById.get(tenant.id);
                    const openingHours = directoryTenant?.openingHours ?? null;
                    const contactPhone = directoryTenant?.contactPhone ?? null;

                    return (
                      <article
                        key={tenant.id}
                        data-testid="search-business-card"
                        className="liquid-prism-ring liquid-glass-card flex flex-col justify-between rounded-3xl p-6 sm:p-7 transition duration-300 ease-out hover:-translate-y-0.5"
                      >
                        <div>
                          {/* Card Header */}
                          <div className="flex items-center justify-between gap-4">
                            <div className="flex min-w-0 items-center gap-3.5">
                              <div className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-[#f4f3f1] text-lg font-semibold text-[#141416] ring-1 ring-white/15">
                                {tenant.name === "refill" ? (
                                  <Image
                                    src="/images/logo_refill.jpg"
                                    alt={tenant.name}
                                    width={48}
                                    height={48}
                                    className="size-full object-cover"
                                  />
                                ) : (
                                  tenant.name.slice(0, 1).toUpperCase()
                                )}
                              </div>
                              <div className="min-w-0">
                                <h2 className="truncate text-2xl font-medium tracking-tight text-[#f4f3f1]">
                                  {tenant.name}
                                </h2>
                                <p className="text-xs font-medium text-[#9b9ba4]">
                                  @{tenant.slug}
                                </p>
                              </div>
                            </div>

                            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs font-medium text-[#9b9ba4]">
                              <span className="size-1.5 rounded-full bg-emerald-400" />
                              Online
                            </span>
                          </div>

                          {/* Divided Info Panel (Dabbit Widget Style) */}
                          <div className="mt-6 divide-y divide-white/[0.08] overflow-hidden rounded-2xl border border-white/10 bg-[#141416]/65 text-xs">
                            <div className="p-3.5">
                              <div className="mb-2 flex items-center justify-between text-[#9b9ba4]">
                                <span className="font-medium">
                                  Horarios de atención
                                </span>
                              </div>
                              <OpeningHoursSummary
                                openingHours={openingHours}
                              />
                            </div>

                            {contactPhone ? (
                              <div className="flex items-center justify-between gap-3 px-3.5 py-2.5">
                                <span className="font-medium text-[#9b9ba4]">
                                  Contacto directo
                                </span>
                                <a
                                  href={`tel:${contactPhone.replace(/[^\d+]/g, "")}`}
                                  className="font-medium text-[#f4f3f1] tabular-nums underline decoration-white/25 underline-offset-4 transition hover:decoration-white"
                                >
                                  {contactPhone}
                                </a>
                              </div>
                            ) : null}

                            {/* Map Loupe Frame */}
                            <div className="p-2">
                              <div className="relative overflow-hidden rounded-xl ring-1 ring-white/10">
                                <div className="relative h-44 w-full bg-[#202024]">
                                  <LocationMapPreview
                                    lat={tenant.lat}
                                    lng={tenant.lng}
                                    name={tenant.name}
                                  />
                                </div>
                                <div className="pointer-events-none absolute inset-x-0 bottom-2.5 z-20 flex justify-center px-3">
                                  <a
                                    href={buildGoogleMapsDirectUrl(
                                      tenant.mapQuery,
                                    )}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="pointer-events-auto inline-flex h-7 items-center gap-2 rounded-full border border-white/15 bg-[#141416]/90 px-3 text-[11px] font-medium text-[#f4f3f1] shadow-lg backdrop-blur-md transition hover:bg-[#141416]"
                                    title="Abrir en Google Maps"
                                  >
                                    <span className="size-2 rounded-full bg-[#d97757]" />
                                    <span>Cómo llegar</span>
                                    <span className="text-[#9b9ba4]">↗</span>
                                  </a>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Primary Pill Action */}
                        <div className="mt-6 flex items-center justify-between gap-3">
                          <a
                            href={storefrontUrl}
                            className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-full bg-[#f4f3f1] px-5 text-sm font-medium text-[#141416] transition duration-200 ease-out hover:bg-white active:scale-[0.98]"
                          >
                            <span>Ver carta y pedir</span>
                            <span aria-hidden="true">→</span>
                          </a>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </div>
            )}

            {/* EMPTY STATES */}
            {((isServerSearchActive &&
              products.length === 0 &&
              businesses.length === 0) ||
              (!isServerSearchActive &&
                fallbackFilteredTenants.length === 0)) && (
              <div className="liquid-glass-card rounded-3xl p-12 text-center">
                {tenants.length === 0 ? (
                  <div className="mx-auto max-w-md space-y-4">
                    <p className="text-xl font-medium tracking-tight text-[#f4f3f1]">
                      No hay locales activos disponibles
                    </p>
                    <p className="text-sm text-[#9b9ba4]">
                      Actualmente no hay comercios disponibles para pedir. Si
                      administrás un local, ingresá a tu panel.
                    </p>
                    <Link
                      href="/login"
                      className="inline-flex h-9 items-center justify-center rounded-full bg-[#f4f3f1] px-5 text-sm font-medium text-[#141416] transition hover:bg-white"
                    >
                      Ir al panel de administración
                    </Link>
                  </div>
                ) : (
                  <div className="mx-auto max-w-md space-y-3">
                    <p className="text-xl font-medium tracking-tight text-[#f4f3f1]">
                      Sin resultados para &ldquo;{searchTerm}&rdquo;
                    </p>
                    <p className="text-sm text-[#9b9ba4]">
                      Probá buscando otro plato, bebida o nombre de comercio.
                    </p>
                    <button
                      type="button"
                      onClick={() => setSearchTerm("")}
                      className="mt-2 inline-flex h-9 items-center justify-center rounded-full border border-white/15 bg-white/5 px-4 text-xs font-medium text-[#f4f3f1] transition hover:bg-white/10 cursor-pointer"
                    >
                      Restablecer búsqueda
                    </button>
                  </div>
                )}
              </div>
            )}
          </section>
        </div>

        {/* Minimal Dabbit Footer */}
        <footer className="mt-auto flex w-full flex-col items-start justify-between gap-4 border-t border-white/[0.08] px-5 py-6 text-xs text-[#9b9ba4] sm:flex-row sm:items-center sm:px-8 lg:px-10">
          <div className="flex items-center gap-2.5">
            <span className="font-medium text-[#f4f3f1]">Komanda</span>
            <span>·</span>
            <span>Plataforma gastronómica y retail</span>
          </div>
          <div className="flex items-center gap-4">
            <Link
              className="font-medium text-[#9b9ba4] transition hover:text-[#f4f3f1]"
              href="/login"
            >
              Komanda Business
            </Link>
            <Link
              className="font-medium text-[#9b9ba4] transition hover:text-[#f4f3f1]"
              href="/register"
            >
              Sumar mi comercio
            </Link>
          </div>
        </footer>
      </div>
    </div>
  );
}
