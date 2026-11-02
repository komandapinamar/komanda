"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/base/buttons/button";

function ResetPasswordForm() {
  const token = useSearchParams().get("token");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState(false);
  const [pending, setPending] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!token) return;
    setPending(true);
    try {
      const response = await fetch("/api/v1/auth/password-resets/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      setSuccess(response.ok);
      setMessage(
        response.ok
          ? "Contraseña actualizada. Iniciá sesión de nuevo."
          : "El enlace venció o ya se utilizó. Solicitá uno nuevo.",
      );
    } catch {
      setMessage("No pudimos actualizar tu contraseña. Intentá nuevamente.");
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-[calc(100dvh-4rem)] max-w-md items-center px-4 py-12">
      <div className="w-full rounded-2xl border border-border-component-detail-container bg-background-secondary-default p-6 shadow-card sm:p-8">
        <h1 className="text-title-2-semibold text-text-primary">Restablecer contraseña</h1>
        {!token ? (
          <p className="mt-3 text-body-regular text-text-secondary">El enlace no es válido.</p>
        ) : !success ? (
          <form onSubmit={submit} className="mt-6 space-y-4">
            <label className="block space-y-1.5 text-body-medium text-text-primary">
              <span>Nueva contraseña</span>
              <input
                required
                type="password"
                autoComplete="new-password"
                minLength={8}
                maxLength={128}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="w-full px-3 py-2 text-body-regular"
              />
            </label>
            <Button type="submit" disabled={pending} className="w-full">
              {pending ? "Guardando..." : "Guardar nueva contraseña"}
            </Button>
          </form>
        ) : null}
        {message ? (
          <p role="status" className="mt-4 rounded-2lg bg-background-primary-default p-3 text-body-2-regular text-text-secondary">
            {message}
          </p>
        ) : null}
        <Link
          href={success ? "/login" : "/forgot-password"}
          className="mt-5 inline-block text-body-2-medium text-accent-400 hover:underline"
        >
          {success ? "Iniciar sesión →" : "Solicitar un nuevo enlace"}
        </Link>
      </div>
    </main>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<p className="p-6 text-body-regular text-text-secondary">Preparando formulario...</p>}>
      <ResetPasswordForm />
    </Suspense>
  );
}
