"use client";

import { useState, type FormEvent } from "react";
import type { AppliedDiscountInfo } from "@/types/types";

export interface DiscountCouponInputProps {
  appliedDiscount?: AppliedDiscountInfo | null;
  discountTotal?: number;
  onApply: (code: string) => Promise<{ success: boolean; error?: string }>;
  onRemove: () => Promise<void>;
  disabled?: boolean;
}

export function DiscountCouponInput({
  appliedDiscount,
  discountTotal = 0,
  onApply,
  onRemove,
  disabled = false,
}: DiscountCouponInputProps) {
  const [code, setCode] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!code.trim() || isSubmitting || disabled) return;

    setError(null);
    setIsSubmitting(true);

    try {
      const result = await onApply(code.trim().toUpperCase());
      if (result.success) {
        setCode("");
      } else {
        setError(result.error ?? "No se pudo aplicar el cupón.");
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Error inesperado al aplicar cupón.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRemove = async () => {
    setError(null);
    setIsSubmitting(true);
    try {
      await onRemove();
    } finally {
      setIsSubmitting(false);
    }
  };

  if (appliedDiscount) {
    const formattedBenefit =
      appliedDiscount.discountType === "percentage"
        ? `${Number(appliedDiscount.discountValue)}% OFF`
        : `-$${discountTotal.toLocaleString("es-AR")}`;

    return (
      <div
        data-testid="applied-discount-badge"
        className="flex items-center justify-between rounded-sm border border-emerald-600/40 bg-emerald-950/20 px-3 py-2 text-xs text-emerald-400"
      >
        <div className="flex items-center gap-2">
          <span className="font-mono font-bold tracking-wider">
            {appliedDiscount.code}
          </span>
          <span className="rounded-full bg-emerald-800/40 px-2 py-0.5 text-[10px] font-semibold text-emerald-300">
            {formattedBenefit}
          </span>
        </div>
        <button
          type="button"
          aria-label="Quitar cupón"
          onClick={handleRemove}
          disabled={isSubmitting || disabled}
          className="ml-2 font-bold text-red-400 hover:text-red-300 transition disabled:opacity-50"
        >
          ✕
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          data-testid="discount-code-input"
          type="text"
          placeholder="Ingresá tu cupón"
          value={code}
          onChange={(e) => {
            setCode(e.target.value.toUpperCase());
            if (error) setError(null);
          }}
          disabled={isSubmitting || disabled}
          className="flex-1 rounded-sm border border-[var(--color-accent-secondary)]/40 bg-transparent px-3 py-1.5 text-xs text-[var(--color-accent-secondary)] placeholder:text-[var(--color-accent-secondary)]/50 focus:border-[var(--color-accent-secondary)] focus:outline-none"
        />
        <button
          data-testid="apply-discount-btn"
          type="submit"
          disabled={!code.trim() || isSubmitting || disabled}
          className="rounded-sm bg-[var(--color-accent-secondary)] px-3 py-1.5 text-xs font-semibold text-[var(--color-accent-primary)] transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isSubmitting ? "..." : "Aplicar"}
        </button>
      </form>
      {error ? (
        <p
          data-testid="discount-error-message"
          className="text-xs text-red-600 font-medium"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}

export default DiscountCouponInput;
