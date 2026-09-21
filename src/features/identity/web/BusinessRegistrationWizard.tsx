"use client";

import { useState } from "react";
import Link from "next/link";
import { LocationPicker } from "@/features/location/web/LocationPicker";
import type { LocationAddress } from "@/features/location/application/location.schemas";

type Preset = "gastronomy" | "express_retail";

function generateSlug(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export default function BusinessRegistrationWizard({
  authenticatedEmail,
}: {
  authenticatedEmail?: string;
}) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [preset, setPreset] = useState<Preset>("gastronomy");
  const [businessName, setBusinessName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugManual, setSlugManual] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [location, setLocation] = useState<LocationAddress | null>(null);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setBusinessName(val);
    if (!slugManual) {
      setSlug(generateSlug(val));
    }
  };

  const handleSlugChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSlugManual(true);
    setSlug(generateSlug(e.target.value));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!businessName.trim()) {
      setErrorMessage("Por favor ingresá el nombre del negocio.");
      return;
    }
    if (!slug.trim()) {
      setErrorMessage("Por favor ingresá un enlace identificador (slug).");
      return;
    }
    if (!location) {
      setErrorMessage("Confirmá la ubicación exacta del local antes de continuar.");
      return;
    }
    if (!authenticatedEmail && (!email.trim() || !password.trim())) {
      setErrorMessage("Completá tu email y una contraseña de al menos 8 caracteres.");
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch("/api/v1/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessName: businessName.trim(),
          slug: slug.trim(),
          preset,
          location,
          ...(authenticatedEmail ? {} : { email: email.trim(), password }),
        }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.detail ?? data.title ?? "No se pudo registrar el negocio.");
      }

      // Hard redirect to populate cookies and load dashboard
      window.location.href = data.redirectUrl ?? `/admin/${data.tenantId}`;
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Error inesperado al registrar el negocio.");
      setIsSubmitting(false);
    }
  };

  return (
    <div className="w-full max-w-xl mx-auto">
      {/* Branding Header */}
      <div className="text-center mb-8 space-y-2">
        <Link
          href="/"
          className="inline-block text-2xl font-bold tracking-tight text-[var(--color-accent-tertiary)] hover:opacity-80 transition-opacity"
        >
          Komanda
        </Link>
        <h1 className="text-3xl font-extrabold tracking-tight text-[var(--color-accent-tertiary)] sm:text-4xl">
          Creá tu nuevo negocio
        </h1>
        <p className="text-sm text-[var(--color-accent-tertiary)]/70">
          Configurá tu punto de venta en minutos. Elegí el modelo operativo que mejor se adapte a tu comercio.
        </p>
        {authenticatedEmail && (
          <p className="text-xs font-medium text-[var(--color-accent-tertiary)]/70">
            Vas a usar la cuenta {authenticatedEmail}.
          </p>
        )}
      </div>

      <div className="rounded-2xl border border-[var(--color-accent-tertiary)]/15 bg-[var(--color-accent-primary)] p-6 sm:p-8 shadow-sm">
        {/* Step Indicator */}
        <div className="flex items-center justify-between mb-8 pb-4 border-b border-[var(--color-accent-tertiary)]/15 text-xs">
          <button
            type="button"
            onClick={() => setStep(1)}
            className={`flex items-center gap-2 font-semibold ${
              step === 1 ? "text-[var(--color-accent-tertiary)]" : "text-[var(--color-accent-tertiary)]/50 hover:text-[var(--color-accent-tertiary)]"
            }`}
          >
            <span
              className={`flex h-6 w-6 items-center justify-center rounded-full text-xs ${
                step === 1
                  ? "bg-[var(--color-accent-secondary)] text-[var(--color-accent-primary)] font-bold"
                  : "bg-[var(--color-accent-tertiary)]/10 text-[var(--color-accent-tertiary)]/50"
              }`}
            >
              1
            </span>
            <span>Tipo de Negocio</span>
          </button>

          <div className="h-0.5 flex-1 mx-4 bg-[var(--color-accent-tertiary)]/15" />

          <button
            type="button"
            onClick={() => {
              if (businessName.trim() && slug.trim()) setStep(2);
            }}
            className={`flex items-center gap-2 font-semibold ${
              step === 2 ? "text-[var(--color-accent-tertiary)]" : "text-[var(--color-accent-tertiary)]/40"
            }`}
          >
            <span
              className={`flex h-6 w-6 items-center justify-center rounded-full text-xs ${
                step === 2
                  ? "bg-[var(--color-accent-secondary)] text-[var(--color-accent-primary)] font-bold"
                  : "bg-[var(--color-accent-tertiary)]/10 text-[var(--color-accent-tertiary)]/40"
              }`}
            >
              2
            </span>
            <span>Ubicación</span>
          </button>

          <div className="h-0.5 flex-1 mx-4 bg-[var(--color-accent-tertiary)]/15" />
          <button type="button" onClick={() => location && setStep(3)} className={`flex items-center gap-2 font-semibold ${step === 3 ? "text-[var(--color-accent-tertiary)]" : "text-[var(--color-accent-tertiary)]/40"}`}>
            <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs ${step === 3 ? "bg-[var(--color-accent-secondary)] text-[var(--color-accent-primary)] font-bold" : "bg-[var(--color-accent-tertiary)]/10 text-[var(--color-accent-tertiary)]/40"}`}>3</span>
            <span>Datos &amp; Cuenta</span>
          </button>
        </div>

        {errorMessage && (
          <div className="mb-6 rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-400">
            {errorMessage}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {step === 1 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-base font-semibold text-[var(--color-accent-tertiary)]">
                  ¿Cuál es el modelo principal de tu local?
                </h2>
                <p className="text-xs text-[var(--color-accent-tertiary)]/70 mt-1">
                  Esto adapta automáticamente los menús, pantallas y aplicaciones cliente.
                </p>
              </div>

              {/* Vertical Selection Cards */}
              <div className="grid grid-cols-1 gap-4">
                {/* Option 1: Gastronomy */}
                <div
                  onClick={() => setPreset("gastronomy")}
                  className={`cursor-pointer rounded-xl border p-5 transition-all ${
                    preset === "gastronomy"
                      ? "border-[var(--color-accent-tertiary)] bg-[var(--color-accent-tertiary)]/10 ring-1 ring-[var(--color-accent-tertiary)]"
                      : "border-[var(--color-accent-tertiary)]/15 bg-[var(--color-accent-primary)] hover:border-[var(--color-accent-tertiary)]/40"
                  }`}
                >
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-base font-semibold text-[var(--color-accent-tertiary)]">
                        Gastronomía (Komanda POS)
                      </span>
                      {preset === "gastronomy" && (
                        <span className="rounded-full bg-[var(--color-accent-tertiary)] px-2.5 py-0.5 text-[10px] font-bold text-[var(--color-accent-primary)] uppercase">
                          Seleccionado
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-[var(--color-accent-tertiary)]/70 leading-relaxed">
                      Restaurantes, cafeterías y locales de comida con menú digital QR y gestión de pedidos.
                    </p>
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      <span className="rounded-md border border-[var(--color-accent-tertiary)]/15 bg-[var(--color-accent-tertiary)]/10 px-2 py-0.5 text-[10px] text-[var(--color-accent-tertiary)]">
                        Menú Digital QR
                      </span>
                      <span className="rounded-md border border-[var(--color-accent-tertiary)]/15 bg-[var(--color-accent-tertiary)]/10 px-2 py-0.5 text-[10px] text-[var(--color-accent-tertiary)]">
                        Gestión de Pedidos
                      </span>
                      <span className="rounded-md border border-[var(--color-accent-tertiary)]/15 bg-[var(--color-accent-tertiary)]/10 px-2 py-0.5 text-[10px] text-[var(--color-accent-tertiary)]">
                        Pagos Online
                      </span>
                    </div>
                  </div>
                </div>

                {/* Option 2: Express Retail */}
                <div
                  onClick={() => setPreset("express_retail")}
                  className={`cursor-pointer rounded-xl border p-5 transition-all ${
                    preset === "express_retail"
                      ? "border-[var(--color-accent-tertiary)] bg-[var(--color-accent-tertiary)]/10 ring-1 ring-[var(--color-accent-tertiary)]"
                      : "border-[var(--color-accent-tertiary)]/15 bg-[var(--color-accent-primary)] hover:border-[var(--color-accent-tertiary)]/40"
                  }`}
                >
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-base font-semibold text-[var(--color-accent-tertiary)]">
                        Autoservicio & Retail (Komanda Kiosk)
                      </span>
                      {preset === "express_retail" && (
                        <span className="rounded-full bg-[var(--color-accent-tertiary)] px-2.5 py-0.5 text-[10px] font-bold text-[var(--color-accent-primary)] uppercase">
                          Seleccionado
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-[var(--color-accent-tertiary)]/70 leading-relaxed">
                      Kioscos, minimarkets y locales comerciales con venta rápida o autoservicio.
                    </p>
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      <span className="rounded-md border border-[var(--color-accent-tertiary)]/15 bg-[var(--color-accent-tertiary)]/10 px-2 py-0.5 text-[10px] text-[var(--color-accent-tertiary)]">
                        Códigos de Barra
                      </span>
                      <span className="rounded-md border border-[var(--color-accent-tertiary)]/15 bg-[var(--color-accent-tertiary)]/10 px-2 py-0.5 text-[10px] text-[var(--color-accent-tertiary)]">
                        Control de Stock
                      </span>
                      <span className="rounded-md border border-[var(--color-accent-tertiary)]/15 bg-[var(--color-accent-tertiary)]/10 px-2 py-0.5 text-[10px] text-[var(--color-accent-tertiary)]">
                        Arqueo de Caja
                      </span>
                      <span className="rounded-md border border-[var(--color-accent-tertiary)]/30 bg-[var(--color-accent-tertiary)]/15 px-2 py-0.5 text-[10px] text-[var(--color-accent-tertiary)] font-semibold">
                        Komanda Kiosk
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Business Name and Slug */}
              <div className="space-y-4 pt-2">
                <div className="space-y-1.5">
                  <label htmlFor="businessName" className="block text-xs font-semibold text-[var(--color-accent-tertiary)]/80 uppercase tracking-wider">
                    Nombre del comercio
                  </label>
                  <input
                    id="businessName"
                    type="text"
                    required
                    placeholder="Ej. Kiosco San Martín o La Pizzería Central"
                    value={businessName}
                    onChange={handleNameChange}
                    className="w-full rounded-xl border border-[var(--color-accent-tertiary)]/15 bg-[var(--color-accent-primary)] px-4 py-2.5 text-sm text-[var(--color-accent-tertiary)] placeholder-[var(--color-accent-tertiary)]/40 outline-none transition focus:border-[var(--color-accent-tertiary)]/50"
                  />
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label htmlFor="slug" className="block text-xs font-semibold text-[var(--color-accent-tertiary)]/80 uppercase tracking-wider">
                      Identificador público (URL)
                    </label>
                    <span className="text-[11px] text-[var(--color-accent-tertiary)]/50">Se autogenera del nombre</span>
                  </div>
                  <div className="flex items-center rounded-xl border border-[var(--color-accent-tertiary)]/15 bg-[var(--color-accent-primary)] px-3 py-2 text-sm focus-within:border-[var(--color-accent-tertiary)]/50">
                    <span className="text-xs text-[var(--color-accent-tertiary)]/50 select-none">komanda.app/</span>
                    <input
                      id="slug"
                      type="text"
                      required
                      placeholder="kiosco-san-martin"
                      value={slug}
                      onChange={handleSlugChange}
                      className="w-full bg-transparent px-1 text-sm text-[var(--color-accent-tertiary)] outline-none placeholder-[var(--color-accent-tertiary)]/40"
                    />
                  </div>
                </div>
              </div>

              <button
                type="button"
                disabled={!businessName.trim() || !slug.trim()}
                onClick={() => setStep(2)}
                className="w-full rounded-xl bg-[var(--color-accent-secondary)] py-3 text-sm font-semibold text-[var(--color-accent-primary)] hover:bg-[var(--color-accent-tertiary)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Continuar a Ubicación →
              </button>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-base font-semibold text-[var(--color-accent-tertiary)]">¿Dónde funciona tu local?</h2>
                <p className="mt-1 text-xs text-[var(--color-accent-tertiary)]/70">Confirmá el pin exacto. Esta ubicación será pública para tus clientes.</p>
              </div>
              <LocationPicker initialValue={location} onConfirm={(value) => { setLocation(value); setErrorMessage(null); }} error={errorMessage} />
              <div className="flex items-center gap-3 pt-2">
                <button type="button" onClick={() => setStep(1)} className="rounded-xl border border-[var(--color-accent-tertiary)]/20 px-4 py-3 text-sm font-semibold text-[var(--color-accent-tertiary)]">← Volver</button>
                <button type="button" disabled={!location} onClick={() => setStep(3)} className="flex-1 rounded-xl bg-[var(--color-accent-secondary)] py-3 text-sm font-semibold text-black disabled:cursor-not-allowed disabled:opacity-40">Continuar a Datos de Cuenta →</button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-base font-semibold text-[var(--color-accent-tertiary)]">
                  {authenticatedEmail ? "Usar tu cuenta actual" : "Creá tu cuenta de administrador"}
                </h2>
                <p className="text-xs text-[var(--color-accent-tertiary)]/70 mt-1">
                  {authenticatedEmail
                    ? `El negocio quedará vinculado a ${authenticatedEmail}.`
                    : "Con estos datos vas a iniciar sesión para gestionar tu catálogo, precios y reportes."}
                </p>
              </div>

              {/* Summary of Step 1 */}
              <div className="flex items-center justify-between rounded-xl border border-[var(--color-accent-tertiary)]/15 bg-[var(--color-accent-primary)] p-3.5 text-xs">
                <div>
                  <span className="font-bold text-[var(--color-accent-tertiary)]">{businessName}</span>
                  <span className="text-[var(--color-accent-tertiary)]/50 ml-2">({slug})</span>
                  <p className="text-[var(--color-accent-tertiary)]/70 text-[11px] mt-0.5">
                    Modo: {preset === "gastronomy" ? "Gastronomía (Komanda POS)" : "Autoservicio & Retail (Komanda Kiosk)"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="text-[var(--color-accent-tertiary)] hover:underline font-medium"
                >
                  Cambiar
                </button>
              </div>

              {!authenticatedEmail && <div className="space-y-4">
                <div className="space-y-1.5">
                  <label htmlFor="email" className="block text-xs font-semibold text-[var(--color-accent-tertiary)]/80 uppercase tracking-wider">
                    Correo electrónico
                  </label>
                  <input
                    id="email"
                    type="email"
                    required
                    autoComplete="email"
                    placeholder="dueno@tunegocio.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full rounded-xl border border-[var(--color-accent-tertiary)]/15 bg-[var(--color-accent-primary)] px-4 py-2.5 text-sm text-[var(--color-accent-tertiary)] placeholder-[var(--color-accent-tertiary)]/40 outline-none transition focus:border-[var(--color-accent-tertiary)]/50"
                  />
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="password" className="block text-xs font-semibold text-[var(--color-accent-tertiary)]/80 uppercase tracking-wider">
                    Contraseña
                  </label>
                  <input
                    id="password"
                    type="password"
                    required
                    minLength={8}
                    autoComplete="new-password"
                    placeholder="Mínimo 8 caracteres"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full rounded-xl border border-[var(--color-accent-tertiary)]/15 bg-[var(--color-accent-primary)] px-4 py-2.5 text-sm text-[var(--color-accent-tertiary)] placeholder-[var(--color-accent-tertiary)]/40 outline-none transition focus:border-[var(--color-accent-tertiary)]/50"
                  />
                </div>
              </div>}

              <div className="flex items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="rounded-xl border border-[var(--color-accent-tertiary)]/20 px-4 py-3 text-sm font-semibold text-[var(--color-accent-tertiary)] hover:bg-[var(--color-accent-tertiary)]/10 transition-colors"
                >
                  ← Volver
                </button>

                <button
                  type="submit"
                   disabled={isSubmitting || (!authenticatedEmail && (!email.trim() || password.length < 8))}
                  className="flex-1 rounded-xl bg-[var(--color-accent-secondary)] py-3 text-sm font-semibold text-[var(--color-accent-primary)] hover:bg-[var(--color-accent-tertiary)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {isSubmitting ? "Creando negocio..." : "Crear negocio y comenzar"}
                </button>
              </div>
            </div>
          )}
        </form>
      </div>

      {/* Login link */}
      <div className="mt-8 text-center text-xs text-[var(--color-accent-tertiary)]/70">
        ¿Ya tenés una cuenta en Komanda?{" "}
        <Link href="/login" className="font-semibold text-[var(--color-accent-tertiary)] underline hover:opacity-80">
          Iniciá sesión acá
        </Link>
      </div>
    </div>
  );
}
