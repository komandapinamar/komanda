"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  login,
  type LoginActionState,
} from "@/features/admin-panel/actions/login.action";

const initialLoginActionState: LoginActionState = {
  success: false,
  message: null,
};

export default function AdminLoginForm() {
  const router = useRouter();
  const [state, action, pending] = useActionState(
    login,
    initialLoginActionState,
  );

  useEffect(() => {
    if (state.success) {
      router.push("/admin/dashboard");
    }
  }, [state.success, router]);

  return (
    <form
      action={action}
      className="flex w-full flex-col gap-4 rounded-2xl border border-[var(--color-accent-tertiary)]/15 bg-[var(--color-accent-primary)] p-6 shadow-sm"
    >
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold text-[var(--color-accent-tertiary)]">Admin login</h1>
        <p className="text-sm text-[var(--color-accent-tertiary)]/70">
          Sign in to have admin privileges.
        </p>
      </div>

      <label className="flex flex-col gap-2 text-sm text-[var(--color-accent-tertiary)]/80">
        <span>Username</span>
        <input
          required
          type="text"
          name="username"
          autoComplete="username"
          placeholder="Username"
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

      {state.message ? (
        <p
          aria-live="polite"
          className={state.success ? "text-sm text-green-700" : "text-sm text-red-600"}
        >
          {state.message}
        </p>
      ) : null}


      <button
        type="submit"
        disabled={pending}
        className="rounded-xl bg-[var(--color-accent-secondary)] px-4 py-3 text-sm font-medium text-[var(--color-accent-primary)] transition hover:bg-[var(--color-accent-tertiary)] disabled:cursor-not-allowed disabled:bg-[var(--color-accent-tertiary)]/60"
      >
        {pending ? "Signing in..." : "Login"}
      </button>
    </form>
  );
}
