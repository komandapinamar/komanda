"use client";

import { useState, type FormEvent } from "react";
import type { AppliedDiscountInfo } from "@/types/types";

export interface DiscountCouponInputProps {
  appliedDiscount?: AppliedDiscountInfo | null;
  discountTotal?: number;
  onApply: (code: string) => Promise<{ success: boolean; error?: string }>;
  onRemove: () => Promise<void>;
  disabled?: boolean;
  appearance?: "default" | "ticket";
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
        err instanceof Error
          ? err.message
          : "Error inesperado al aplicar cupón.",
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
        className="flex items-center justify-between rounded-full border border-emerald-400/30 bg-emerald-500/10 px-3.5 py-2 text-xs text-emerald-300"
      >
        <div className="flex items-center gap-2">
          <span className="font-mono font-semibold tracking-wider text-[#f4f3f1]">
            {appliedDiscount.code}
          </span>
          <span className="rounded-full bg-emerald-400/20 px-2 py-0.5 text-[10px] font-medium text-emerald-300 tabular-nums">
            {formattedBenefit}
          </span>
        </div>
        <button
          type="button"
          aria-label="Quitar cupón"
          onClick={handleRemove}
          disabled={isSubmitting || disabled}
          className="ml-2 flex size-5 items-center justify-center rounded-full text-xs text-[#c2c2cc] transition hover:bg-white/10 hover:text-white disabled:opacity-50 cursor-pointer"
        >
          ✕
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
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
          className="h-9 min-w-0 flex-1 rounded-full border border-white/12 bg-white/[0.04] px-3.5 text-xs text-[#f4f3f1] placeholder:text-[#c2c2cc]/60 focus:border-white/30 focus:outline-none"
        />
        <button
          data-testid="apply-discount-btn"
          type="submit"
          disabled={!code.trim() || isSubmitting || disabled}
          className="h-9 rounded-full bg-[#f4f3f1] px-4 text-xs font-medium text-[#141416] transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"
        >
          {isSubmitting ? "..." : "Aplicar"}
        </button>
      </form>
      {error ? (
        <p
          data-testid="discount-error-message"
          className="px-2 text-xs font-medium text-red-400"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}

export default DiscountCouponInput;
