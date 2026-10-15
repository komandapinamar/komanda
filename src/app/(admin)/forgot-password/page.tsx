"use client";

import { useState } from "react";
import Link from "next/link";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    try {
      const response = await fetch("/api/v1/auth/password-resets", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }),
      });
      setMessage(response.ok
        ? "Si existe una cuenta activa, te enviaremos un enlace para restablecer la contraseña."
        : "No pudimos procesar tu solicitud. Intentá nuevamente.");
    } catch {
      setMessage("No pudimos procesar tu solicitud. Intentá nuevamente.");
    } finally {
      setPending(false);
    }
  }

  return <main className="mx-auto max-w-md p-6 text-[var(--color-accent-tertiary)]">
    <h1 className="text-2xl font-semibold">Recuperar contraseña</h1>
    <p className="mt-2">Ingresá el correo de tu cuenta de Komanda Business.</p>
    <form onSubmit={submit} className="mt-6 space-y-4">
      <label className="block">Correo electrónico
        <input required type="email" autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} className="mt-2 w-full rounded border p-3 text-black" />
      </label>
      <button disabled={pending} className="rounded bg-[var(--color-accent-secondary)] px-4 py-3 text-[var(--color-accent-primary)] disabled:opacity-50">{pending ? "Enviando..." : "Enviar enlace"}</button>
    </form>
    {message && <p role="status" className="mt-4">{message}</p>}
    <Link href="/login" className="mt-5 block underline">Volver al inicio de sesión</Link>
  </main>;
}
