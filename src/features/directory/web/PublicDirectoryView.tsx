"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { PublicDirectoryTenant } from "@/features/tenancy/application/public-tenant.service";
import {
  buildGoogleMapsDirectUrl,
  buildGoogleMapsEmbedUrl,
} from "@/features/directory/utils/directory-maps";

export type DirectoryTenantItem = PublicDirectoryTenant & {
  storefrontUrl: string;
};

type Props = {
  tenants: DirectoryTenantItem[];
};

export function PublicDirectoryView({ tenants }: Props) {
  const [searchTerm, setSearchTerm] = useState("");
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.defaultMuted = true;
      videoRef.current.muted = true;
      videoRef.current.play().catch(() => {});
    }
  }, []);

  const filteredTenants = useMemo(() => {
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
              placeholder="Buscar por nombre de negocio o ubicación..."
              className="w-full rounded-2xl border-4 border-black bg-white/95 px-6 py-4 text-base font-normal text-zinc-900 placeholder:text-zinc-500 backdrop-blur-sm focus:outline-none focus:ring-4 focus:ring-[var(--color-accent-secondary)]"
            />
          </div>
          <p className="mt-3 text-left text-xs font-black uppercase tracking-wider text-zinc-400">
            {filteredTenants.length === 1
              ? "1 local disponible"
              : `${filteredTenants.length} locales disponibles`}
          </p>
        </div>
      </section>

      {/* Tenants Grid */}
      <section className="relative z-10 mx-auto px-6 pb-24">
        {filteredTenants.length > 0 ? (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-1 lg:mx-4">
            {filteredTenants.map((tenant) => (
              <article
                key={tenant.id}
                className="flex flex-col justify-between rounded-2xl border-4 border-black bg-white p-6 transition hover:-translate-y-1 hover:shadow-[8px_8px_0_0_black]"
              >
                <div>
                  <div className="flex items-start gap-4">
                    <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border-3 border-black bg-[var(--color-accent-secondary)] text-2xl font-black text-black shadow-[2px_2px_0_0_black]">
                      {tenant.name.slice(0, 1).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <h2 className="truncate text-xl font-black uppercase tracking-tight text-zinc-900">
                        {tenant.name}
                      </h2>
                      <p className="text-xs font-bold uppercase tracking-wider text-zinc-500">
                        @{tenant.slug}
                      </p>
                    </div>
                  </div>

                  <div className="mt-5 space-y-3">
                    {/* Mapa de Google Maps del local */}
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
                          <iframe
                            title={`Mapa de ubicación de ${tenant.name}`}
                            src={buildGoogleMapsEmbedUrl(tenant.mapQuery)}
                            className="h-full w-full border-0"
                            loading="lazy"
                            referrerPolicy="no-referrer-when-downgrade"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-8">
                  <a
                    href={tenant.storefrontUrl}
                    className="block w-full rounded-xl border-3 border-black bg-[var(--color-accent-primary)] py-3 px-4 text-center text-sm font-black uppercase tracking-wider text-[var(--color-accent-secondary)] shadow-[3px_3px_0_0_black] transition hover:bg-black active:translate-x-[1px] active:translate-y-[1px] active:shadow-[2px_2px_0_0_black]"
                  >
                    Ver Menú & Pedir →
                  </a>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border-4 border-dashed border-white/30 bg-black/40 p-12 text-center backdrop-blur-md">
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
                  No se encontraron locales
                </p>
                <p className="text-sm font-bold text-zinc-300">
                  Ningún negocio coincide con &ldquo;{searchTerm}&rdquo;. Intentá con otro término de búsqueda.
                </p>
                <button
                  type="button"
                  onClick={() => setSearchTerm("")}
                  className="mt-2 text-sm font-black underline uppercase text-[var(--color-accent-secondary)] hover:text-amber-300"
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
            <p className="text-sm font-bold text-white">
              Te interesa usar Komanda en tu negocio gastronómico?
            </p>
            <p className="text-xs text-zinc-400">
              Agenda una reunion mediante este link:
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
