"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/base/buttons/button";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    try {
      const response = await fetch("/api/v1/auth/password-resets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      setMessage(
        response.ok
          ? "Si existe una cuenta activa, te enviaremos un enlace para restablecer la contraseña."
          : "No pudimos procesar tu solicitud. Intentá nuevamente.",
      );
    } catch {
      setMessage("No pudimos procesar tu solicitud. Intentá nuevamente.");
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-[calc(100dvh-4rem)] max-w-md items-center px-4 py-12">
      <div className="w-full rounded-2xl border border-border-component-detail-container bg-background-secondary-default p-6 shadow-card sm:p-8">
        <h1 className="text-title-2-semibold text-text-primary">Recuperar contraseña</h1>
        <p className="mt-1.5 text-body-regular text-text-secondary">
          Ingresá el correo de tu cuenta de Komanda Business.
        </p>
        <form onSubmit={submit} className="mt-6 space-y-4">
          <label className="block space-y-1.5 text-body-medium text-text-primary">
            <span>Correo electrónico</span>
            <input
              required
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="tu@negocio.com"
              className="w-full px-3 py-2 text-body-regular"
            />
          </label>
          <Button type="submit" disabled={pending} className="w-full">
            {pending ? "Enviando..." : "Enviar enlace"}
          </Button>
        </form>
        {message ? (
          <p role="status" className="mt-4 rounded-2lg bg-background-primary-default p-3 text-body-2-regular text-text-secondary">
            {message}
          </p>
        ) : null}
        <Link href="/login" className="mt-5 inline-block text-body-2-medium text-accent-400 hover:underline">
          Volver al inicio de sesión
        </Link>
      </div>
    </main>
  );
}
