"use client";

import { useState } from "react";
import Link from "next/link";
import { RiArrowRightLine, RiLockPasswordLine, RiMailLine } from "@remixicon/react";
import { Button } from "@/components/base/buttons/button";
import { Chip } from "@/components/base/badges/chip";
import { Divider } from "@/components/base/divider/divider";

export default function AdminLoginForm() {
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setPending(true);
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/v1/auth/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: form.get("email"), password: form.get("password") }),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { title?: string; detail?: string };
        throw new Error(payload.detail ?? payload.title ?? "No se pudo iniciar sesión. Verificá tus credenciales.");
      }
      window.location.href = "/admin/select-business";
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo iniciar sesión.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="flex w-full flex-col gap-5 rounded-2xl border border-border-component-detail-container bg-background-secondary-default p-6 shadow-card sm:p-8"
    >
      <div className="flex flex-col items-start gap-2">
        <div className="flex w-full items-center justify-between">
          <span className="komanda-logo font-sans text-2xl font-normal tracking-tighter text-white normal-case">
            Komanda Business
          </span>
          <Chip variant="caption" color="blue">
            Backoffice
          </Chip>
        </div>
        <h1 className="text-title-2-semibold text-text-primary">
          Iniciar sesión
        </h1>
        <p className="text-body-regular text-text-secondary">
          Ingresá con tu cuenta para administrar catálogo, pedidos y analíticas.
        </p>
      </div>

      <div className="flex flex-col gap-4">
        <label className="flex flex-col gap-1.5 text-body-medium text-text-primary">
          <span>Email</span>
          <div className="flex items-center gap-2 rounded-2lg border border-border-button-default bg-background-tertiary-default px-3 py-2 transition focus-within:border-accent-500">
            <RiMailLine className="size-4 shrink-0 text-foreground-icon-secondary" aria-hidden />
            <input
              required
              type="email"
              name="email"
              autoComplete="email"
              placeholder="tu@negocio.com"
              className="w-full !border-0 !bg-transparent p-0 text-body-regular text-text-primary placeholder:text-text-tertiary focus:!ring-0 focus:outline-none"
            />
          </div>
        </label>

        <label className="flex flex-col gap-1.5 text-body-medium text-text-primary">
          <div className="flex items-center justify-between">
            <span>Password</span>
            <Link
              href="/forgot-password"
              className="text-caption-1-medium text-accent-400 hover:underline"
            >
              ¿Olvidaste tu contraseña?
            </Link>
          </div>
          <div className="flex items-center gap-2 rounded-2lg border border-border-button-default bg-background-tertiary-default px-3 py-2 transition focus-within:border-accent-500">
            <RiLockPasswordLine className="size-4 shrink-0 text-foreground-icon-secondary" aria-hidden />
            <input
              required
              type="password"
              name="password"
              autoComplete="current-password"
              placeholder="••••••••"
              className="w-full !border-0 !bg-transparent p-0 text-body-regular text-text-primary placeholder:text-text-tertiary focus:!ring-0 focus:outline-none"
            />
          </div>
        </label>
      </div>

      {message ? (
        <div
          aria-live="polite"
          className="rounded-2lg border border-red-500/30 bg-status-rose-background px-3.5 py-2.5 text-body-2-medium text-status-rose-text"
        >
          {message}
        </div>
      ) : null}

      <Button
        type="submit"
        disabled={pending}
        trailingIcon={RiArrowRightLine}
        className="w-full"
      >
        {pending ? "Ingresando..." : "Iniciar sesión"}
      </Button>

      <Divider>o creá tu cuenta</Divider>

      <div className="flex items-center justify-between rounded-2lg border border-border-button-default bg-background-primary-default/50 px-4 py-3">
        <span className="text-body-2-regular text-text-secondary">
          ¿Querés abrir tu propio local?
        </span>
        <Link
          href="/register"
          className="text-body-2-semibold text-accent-400 hover:underline"
        >
          Registrá tu negocio →
        </Link>
      </div>
    </form>
  );
}
