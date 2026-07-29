"use client";

import { useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

function AcceptInvitationForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const tenantId = searchParams.get("tenantId") || "your team";

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  if (!token) {
    return (
      <div className="text-center">
        <h2 className="mb-4 text-2xl font-bold">Invalid Link</h2>
        <p>This invitation link appears to be invalid or missing its secure token.</p>
      </div>
    );
  }

  if (success) {
    return (
      <div className="text-center">
        <h2 className="mb-4 text-3xl font-black uppercase text-[var(--color-accent-primary)]">Account Activated</h2>
        <p className="mb-8 text-xl font-bold">Your password has been successfully set.</p>
        <Link
          href={`/admin/${tenantId}`}
          className="rounded-full border-4 border-black bg-[var(--color-accent-primary)] px-8 py-3 text-xl font-black uppercase tracking-wider text-[var(--color-accent-secondary)] shadow-[0_6px_0_0_black]"
        >
          Go to Dashboard
        </Link>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters long");
      return;
    }

    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/v1/users/invitations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.title || data?.message || "Failed to accept invitation");
      }

      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An unexpected error occurred");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md bg-white p-8 border-4 border-black shadow-[10px_10px_0_0_black] rounded-xl text-left">
      <h2 className="text-3xl font-black uppercase mb-2">Set Password</h2>
      <p className="font-bold mb-6 text-gray-700">Join {tenantId} on Komanda</p>

      {error && (
        <div className="mb-4 border-l-4 border-red-500 bg-red-100 p-4 font-bold text-red-700">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div>
          <label className="block mb-2 font-bold uppercase text-sm">New Password</label>
          <input
            type="password"
            className="w-full border-2 border-black p-3 font-bold text-lg focus:outline-none focus:ring-4 focus:ring-[var(--color-accent-primary)] focus:border-black"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
          />
        </div>

        <div>
          <label className="block mb-2 font-bold uppercase text-sm">Confirm Password</label>
          <input
            type="password"
            className="w-full border-2 border-black p-3 font-bold text-lg focus:outline-none focus:ring-4 focus:ring-[var(--color-accent-primary)] focus:border-black"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            minLength={8}
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="mt-4 w-full rounded-full border-4 border-black bg-[var(--color-accent-primary)] px-8 py-3 text-xl font-black uppercase text-[var(--color-accent-secondary)] shadow-[0_6px_0_0_black] hover:-translate-y-1 hover:shadow-[0_10px_0_0_black] transition-all disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:shadow-[0_6px_0_0_black]"
        >
          {loading ? "Activating..." : "Activate Account"}
        </button>
      </form>
    </div>
  );
}

export default function AcceptInvitationPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-[var(--color-accent-tertiary)] text-[var(--color-accent-primary)] p-6">
      <Suspense fallback={<div className="text-2xl font-black uppercase">Loading...</div>}>
        <AcceptInvitationForm />
      </Suspense>
    </main>
  );
}
