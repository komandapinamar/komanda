"use client";

import { useTenantPreset } from "@/features/tenancy/web/tenant-preset-context";
import {
  TenantSettingsPanel,
  type TenantSettingsView,
} from "@/features/tenancy/web/TenantSettingsPanel";

export function SettingsShell({
  initialSettings,
}: {
  initialSettings: TenantSettingsView;
}) {
  const { preset } = useTenantPreset();

  if (preset === "express_retail") {
    return (
      <TenantSettingsPanel
        initialSettings={{
          ...initialSettings,
          preset: "express_retail",
        }}
      />
    );
  }

  if (preset === "gastronomy") {
    return (
      <TenantSettingsPanel
        initialSettings={{
          ...initialSettings,
          preset: "gastronomy",
        }}
      />
    );
  }

  throw new Error(`[SettingsShell] Preset no soportado: ${preset}`);
}
