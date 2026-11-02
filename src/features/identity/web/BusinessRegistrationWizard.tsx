"use client";

import { useState } from "react";
import Link from "next/link";
import {
  RiArrowLeftLine,
  RiArrowRightLine,
  RiBarcodeBoxLine,
  RiCheckLine,
  RiLockPasswordLine,
  RiMailLine,
  RiMapPin2Line,
  RiRestaurant2Line,
  RiStore2Line,
} from "@remixicon/react";
import { LocationPicker } from "@/features/location/web/LocationPicker";
import type { LocationAddress } from "@/features/location/application/location.schemas";
import { Button } from "@/components/base/buttons/button";
import { Chip } from "@/components/base/badges/chip";
import { Divider } from "@/components/base/divider/divider";
import { CheckboxGlyph } from "@/components/base/checkbox/checkbox-glyph";

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

      window.location.href = data.redirectUrl ?? `/admin/${data.tenantId}`;
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Error inesperado al registrar el negocio.");
      setIsSubmitting(false);
    }
  };

  const steps = [
    { id: 1 as const, label: "Tipo de Negocio", icon: RiStore2Line, enabled: true },
    { id: 2 as const, label: "Ubicación", icon: RiMapPin2Line, enabled: Boolean(businessName.trim() && slug.trim()) },
    { id: 3 as const, label: "Datos & Cuenta", icon: RiCheckLine, enabled: Boolean(location) },
  ];

  return (
    <div className="mx-auto w-full max-w-2xl">
      {/* Branding Header */}
      <div className="mb-7 space-y-2 text-center">
        <div className="flex items-center justify-center gap-2">
          <Link
            href="/"
            className="komanda-logo inline-block font-sans text-2xl font-normal tracking-tighter text-white normal-case transition-opacity hover:opacity-80"
          >
            Komanda
          </Link>
          <Chip variant="caption" color="blue">
            Alta de comercio
          </Chip>
        </div>
        <h1 className="text-title-1-semibold text-text-primary sm:text-display-4-semibold">
          Creá tu nuevo negocio
        </h1>
        <p className="mx-auto max-w-lg text-body-regular text-text-secondary">
          Configurá tu punto de venta en minutos. Elegí el modelo operativo que mejor se adapte a tu comercio.
        </p>
        {authenticatedEmail ? (
          <div className="pt-1">
            <Chip variant="subtle" color="cyan">
              Vas a usar la cuenta {authenticatedEmail}
            </Chip>
          </div>
        ) : null}
      </div>

      <div className="rounded-2xl border border-border-component-detail-container bg-background-secondary-default p-6 shadow-card sm:p-8">
        {/* BoardUI Step Indicator */}
        <div className="mb-7 grid grid-cols-3 gap-2 rounded-2lg bg-background-full p-1.5">
          {steps.map((item) => {
            const isCurrent = step === item.id;
            const isDone = step > item.id;
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                disabled={!item.enabled && !isCurrent}
                onClick={() => {
                  if (item.enabled) setStep(item.id);
                }}
                className={`flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-body-2-medium transition cursor-pointer disabled:cursor-not-allowed disabled:opacity-45 ${
                  isCurrent
                    ? "bg-background-primary-default text-text-primary shadow-2xs"
                    : isDone
                      ? "text-accent-400 hover:bg-background-primary-hover"
                      : "text-text-secondary hover:text-text-primary"
                }`}
              >
                <span
                  className={`flex size-5 shrink-0 items-center justify-center rounded-full text-caption-2-semibold ${
                    isCurrent
                      ? "bg-accent-500 text-white"
                      : isDone
                        ? "bg-status-lime-background text-status-lime-text"
                        : "bg-background-tertiary-default text-text-secondary"
                  }`}
                >
                  {isDone ? <Icon className="size-3.5" aria-hidden /> : item.id}
                </span>
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </div>

        {errorMessage ? (
          <div className="mb-6 rounded-2lg border border-red-500/30 bg-status-rose-background p-3.5 text-body-2-medium text-status-rose-text">
            {errorMessage}
          </div>
        ) : null}

        <form onSubmit={handleSubmit} className="space-y-6">
          {step === 1 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-headline-semibold text-text-primary">
                  ¿Cuál es el modelo principal de tu local?
                </h2>
                <p className="mt-1 text-body-2-regular text-text-secondary">
                  Esto adapta automáticamente los menús, pantallas y aplicaciones cliente.
                </p>
              </div>

              {/* BoardUI Checkbox-Card style Preset Selection */}
              <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
                {/* Option 1: Gastronomy */}
                <div
                  role="radio"
                  aria-checked={preset === "gastronomy"}
                  tabIndex={0}
                  onClick={() => setPreset("gastronomy")}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setPreset("gastronomy");
                    }
                  }}
                  className={`flex cursor-pointer flex-col justify-between gap-4 rounded-2xl border p-4 transition ${
                    preset === "gastronomy"
                      ? "border-accent-500 bg-background-primary-default ring-1 ring-accent-500 shadow-xs"
                      : "border-border-button-default bg-background-full/60 hover:border-border-button-hover hover:bg-background-primary-default/50"
                  }`}
                >
                  <div className="space-y-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <span className="flex size-9 items-center justify-center rounded-2lg bg-status-blue-background text-status-blue-text">
                        <RiRestaurant2Line className="size-5" aria-hidden />
                      </span>
                      <CheckboxGlyph
                        state={{
                          isSelected: preset === "gastronomy",
                          isIndeterminate: false,
                          isFocusVisible: false,
                          isDisabled: false,
                          isHovered: false,
                        }}
                      />
                    </div>
                    <div>
                      <span className="block text-body-semibold text-text-primary">
                        Gastronomía (Komanda POS)
                      </span>
                      <p className="mt-1 text-caption-1-regular text-text-secondary">
                        Restaurantes, cafeterías y locales de comida con menú digital QR y gestión de pedidos.
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    <Chip variant="caption" color="blue">Menú Digital QR</Chip>
                    <Chip variant="caption" color="neutral">Gestión de Pedidos</Chip>
                    <Chip variant="caption" color="lime">Pagos Online</Chip>
                  </div>
                </div>

                {/* Option 2: Express Retail */}
                <div
                  role="radio"
                  aria-checked={preset === "express_retail"}
                  tabIndex={0}
                  onClick={() => setPreset("express_retail")}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setPreset("express_retail");
                    }
                  }}
                  className={`flex cursor-pointer flex-col justify-between gap-4 rounded-2xl border p-4 transition ${
                    preset === "express_retail"
                      ? "border-accent-500 bg-background-primary-default ring-1 ring-accent-500 shadow-xs"
                      : "border-border-button-default bg-background-full/60 hover:border-border-button-hover hover:bg-background-primary-default/50"
                  }`}
                >
                  <div className="space-y-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <span className="flex size-9 items-center justify-center rounded-2lg bg-status-purple-background text-status-purple-text">
                        <RiBarcodeBoxLine className="size-5" aria-hidden />
                      </span>
                      <CheckboxGlyph
                        state={{
                          isSelected: preset === "express_retail",
                          isIndeterminate: false,
                          isFocusVisible: false,
                          isDisabled: false,
                          isHovered: false,
                        }}
                      />
                    </div>
                    <div>
                      <span className="block text-body-semibold text-text-primary">
                        Autoservicio &amp; Retail (Komanda Kiosk)
                      </span>
                      <p className="mt-1 text-caption-1-regular text-text-secondary">
                        Kioscos, minimarkets y locales comerciales con venta rápida o autoservicio.
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    <Chip variant="caption" color="purple">Komanda Kiosk</Chip>
                    <Chip variant="caption" color="neutral">Códigos de Barra</Chip>
                    <Chip variant="caption" color="cyan">Control de Stock</Chip>
                  </div>
                </div>
              </div>

              <Divider />

              {/* Business Name and Slug */}
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label htmlFor="businessName" className="block text-body-medium text-text-primary">
                    Nombre del comercio
                  </label>
                  <input
                    id="businessName"
                    type="text"
                    required
                    placeholder="Ej. Kiosco San Martín o La Pizzería Central"
                    value={businessName}
                    onChange={handleNameChange}
                    className="w-full rounded-2lg border border-border-button-default bg-background-tertiary-default px-3 py-2 text-body-regular text-text-primary placeholder:text-text-tertiary"
                  />
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label htmlFor="slug" className="block text-body-medium text-text-primary">
                      Identificador público (URL)
                    </label>
                    <span className="text-caption-1-regular text-text-tertiary">Autogenerado</span>
                  </div>
                  <div className="flex items-center rounded-2lg border border-border-button-default bg-background-tertiary-default px-3 py-2 focus-within:border-accent-500">
                    <span className="select-none text-body-2-medium text-text-tertiary">ka.ar/</span>
                    <input
                      id="slug"
                      type="text"
                      required
                      placeholder="kiosco-san-martin"
                      value={slug}
                      onChange={handleSlugChange}
                      className="w-full !border-0 !bg-transparent px-1 py-0 text-body-regular text-text-primary placeholder:text-text-tertiary focus:!ring-0 focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              <Button
                type="button"
                disabled={!businessName.trim() || !slug.trim()}
                onClick={() => setStep(2)}
                trailingIcon={RiArrowRightLine}
                className="w-full"
              >
                Continuar a Ubicación
              </Button>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-headline-semibold text-text-primary">
                  ¿Dónde funciona tu local?
                </h2>
                <p className="mt-1 text-body-2-regular text-text-secondary">
                  Confirmá el pin exacto. Esta ubicación será pública para tus clientes.
                </p>
              </div>
              <LocationPicker
                initialValue={location}
                onConfirm={(value) => {
                  setLocation(value);
                  setErrorMessage(null);
                }}
                error={errorMessage}
              />
              <div className="flex items-center gap-3 pt-2">
                <Button
                  type="button"
                  variant="secondary"
                  leadingIcon={RiArrowLeftLine}
                  onClick={() => setStep(1)}
                >
                  Volver
                </Button>
                <Button
                  type="button"
                  disabled={!location}
                  trailingIcon={RiArrowRightLine}
                  onClick={() => setStep(3)}
                  className="flex-1"
                >
                  Continuar a Datos de Cuenta
                </Button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-headline-semibold text-text-primary">
                  {authenticatedEmail ? "Usar tu cuenta actual" : "Creá tu cuenta de administrador"}
                </h2>
                <p className="mt-1 text-body-2-regular text-text-secondary">
                  {authenticatedEmail
                    ? `El negocio quedará vinculado a ${authenticatedEmail}.`
                    : "Con estos datos vas a iniciar sesión para gestionar tu catálogo, precios y reportes."}
                </p>
              </div>

              {/* Summary of Step 1 */}
              <div className="flex items-center justify-between rounded-2lg border border-border-button-default bg-background-primary-default p-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-body-semibold text-text-primary">{businessName}</span>
                    <Chip variant="caption" color="neutral">@{slug}</Chip>
                  </div>
                  <p className="text-caption-1-regular text-text-secondary">
                    Modo: {preset === "gastronomy" ? "Gastronomía (Komanda POS)" : "Autoservicio & Retail (Komanda Kiosk)"}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  size="small"
                  onClick={() => setStep(1)}
                >
                  Cambiar
                </Button>
              </div>

              {!authenticatedEmail ? (
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <label htmlFor="email" className="block text-body-medium text-text-primary">
                      Correo electrónico
                    </label>
                    <div className="flex items-center gap-2 rounded-2lg border border-border-button-default bg-background-tertiary-default px-3 py-2 focus-within:border-accent-500">
                      <RiMailLine className="size-4 shrink-0 text-foreground-icon-secondary" aria-hidden />
                      <input
                        id="email"
                        type="email"
                        required
                        autoComplete="email"
                        placeholder="dueno@tunegocio.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="w-full !border-0 !bg-transparent p-0 text-body-regular text-text-primary placeholder:text-text-tertiary focus:!ring-0 focus:outline-none"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label htmlFor="password" className="block text-body-medium text-text-primary">
                      Contraseña
                    </label>
                    <div className="flex items-center gap-2 rounded-2lg border border-border-button-default bg-background-tertiary-default px-3 py-2 focus-within:border-accent-500">
                      <RiLockPasswordLine className="size-4 shrink-0 text-foreground-icon-secondary" aria-hidden />
                      <input
                        id="password"
                        type="password"
                        required
                        minLength={8}
                        autoComplete="new-password"
                        placeholder="Mínimo 8 caracteres"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="w-full !border-0 !bg-transparent p-0 text-body-regular text-text-primary placeholder:text-text-tertiary focus:!ring-0 focus:outline-none"
                      />
                    </div>
                  </div>
                </div>
              ) : null}

              <div className="flex items-center gap-3 pt-2">
                <Button
                  type="button"
                  variant="secondary"
                  leadingIcon={RiArrowLeftLine}
                  onClick={() => setStep(1)}
                >
                  Volver
                </Button>

                <Button
                  type="submit"
                  disabled={isSubmitting || (!authenticatedEmail && (!email.trim() || password.length < 8))}
                  trailingIcon={RiCheckLine}
                  className="flex-1"
                >
                  {isSubmitting ? "Creando negocio..." : "Crear negocio y comenzar"}
                </Button>
              </div>
            </div>
          )}
        </form>
      </div>

      {/* Login link */}
      {!authenticatedEmail ? (
        <div className="mt-6 text-center text-body-2-regular text-text-secondary">
          ¿Ya tenés una cuenta en Komanda?{" "}
          <Link href="/login" className="text-body-2-semibold text-accent-400 hover:underline">
            Iniciá sesión acá
          </Link>
        </div>
      ) : null}
    </div>
  );
}
