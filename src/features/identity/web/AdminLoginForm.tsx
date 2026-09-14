"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function AdminLoginForm() {
  const router = useRouter();
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
      className="flex w-full flex-col gap-4 rounded-xl border border-[var(--color-accent-tertiary)]/15 bg-[var(--color-accent-primary)] p-6 shadow-sm"
    >
      <div className="space-y-1 mb-8">
        <h1 className="text-4xl font-normal text-[var(--color-accent-tertiary)] tracking-tighter justify-center flex">Komanda Business</h1>
        <h1 className="text-2xl font-thin text-[var(--color-accent-tertiary)] justify-center flex">Login</h1>
      </div>

      <label className="flex flex-col gap-2 text-sm text-[var(--color-accent-tertiary)]/80">
          <span>Email</span>
        <input
          required
            type="email"
            name="email"
            autoComplete="email"
            placeholder="Email"
          className="rounded-xl border border-[var(--color-accent-tertiary)]/15 px-4 py-3 text-[var(--color-accent-tertiary)] outline-none transition focus:border-[var(--color-accent-tertiary)]/40"
        />
      </label>

      <label className="flex flex-col gap-2 text-sm text-[var(--color-accent-tertiary)]/80">
        <span>Password</span>
        <input
          required
          type="password"
          name="password"
          autoComplete="current-password"
          placeholder="Password"
          className="rounded-xl border border-[var(--color-accent-tertiary)]/15 px-4 py-3 text-[var(--color-accent-tertiary)] outline-none transition focus:border-[var(--color-accent-tertiary)]/40"
        />
      </label>

      {message ? (
        <p
          aria-live="polite"
          className="text-sm text-red-600"
        >
          {message}
        </p>
      ) : null}


      <button
        type="submit"
        disabled={pending}
        className="rounded-xl bg-[var(--color-accent-secondary)] px-4 py-3 text-sm font-medium text-[var(--color-accent-primary)] transition hover:bg-[var(--color-accent-tertiary)] disabled:cursor-not-allowed disabled:bg-[var(--color-accent-tertiary)]/60"
      >
        {pending ? "Signing in..." : "Login"}
      </button>

      <div className="mt-2 text-center text-xs text-[var(--color-accent-tertiary)]/70">
        ¿Querés abrir tu propio local?{" "}
        <Link href="/register" className="font-semibold text-[var(--color-accent-tertiary)] underline hover:opacity-80">
          Registrá tu negocio
        </Link>
      </div>
    </form>
  );
}
