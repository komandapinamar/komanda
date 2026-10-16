"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { TenantPreset } from "@/db/schema/platform";

export interface TenantPresetContextValue {
  preset: TenantPreset;
  isExpressRetail: boolean;
  isGastronomy: boolean;
}

const TenantPresetContext = createContext<TenantPresetContextValue | null>(null);

export function TenantPresetProvider({
  preset = "gastronomy",
  children,
}: {
  preset?: TenantPreset;
  children?: ReactNode;
}) {
  const value = useMemo<TenantPresetContextValue>(
    () => ({
      preset,
      isExpressRetail: preset === "express_retail",
      isGastronomy: preset === "gastronomy",
    }),
    [preset],
  );

  return (
    <TenantPresetContext.Provider value={value}>
      {children}
    </TenantPresetContext.Provider>
  );
}

export function useTenantPreset(): TenantPresetContextValue {
  const context = useContext(TenantPresetContext);
  if (!context) {
    throw new Error("useTenantPreset must be used within a TenantPresetProvider");
  }
  return context;
}
