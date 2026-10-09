"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

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
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, password }),
      });
      setSuccess(response.ok);
      setMessage(response.ok ? "Contraseña actualizada. Iniciá sesión de nuevo." : "El enlace venció o ya se utilizó. Solicitá uno nuevo.");
    } catch {
      setMessage("No pudimos actualizar tu contraseña. Intentá nuevamente.");
    } finally {
      setPending(false);
    }
  }

  return <main className="mx-auto max-w-md p-6 text-[var(--color-accent-tertiary)]">
    <h1 className="text-2xl font-semibold">Restablecer contraseña</h1>
    {!token ? <p className="mt-4">El enlace no es válido.</p> : !success ? <form onSubmit={submit} className="mt-6 space-y-4">
      <label className="block">Nueva contraseña
        <input required type="password" autoComplete="new-password" minLength={8} maxLength={128} value={password} onChange={event => setPassword(event.target.value)} className="mt-2 w-full rounded border p-3 text-black" />
      </label>
      <button disabled={pending} className="rounded bg-[var(--color-accent-secondary)] px-4 py-3 text-[var(--color-accent-primary)] disabled:opacity-50">{pending ? "Guardando..." : "Guardar nueva contraseña"}</button>
    </form> : null}
    {message && <p role="status" className="mt-4">{message}</p>}
    <Link href={success ? "/login" : "/forgot-password"} className="mt-5 block underline">{success ? "Iniciar sesión" : "Solicitar un nuevo enlace"}</Link>
  </main>;
}

export default function ResetPasswordPage() {
  return <Suspense fallback={<p>Preparando formulario...</p>}><ResetPasswordForm /></Suspense>;
}
