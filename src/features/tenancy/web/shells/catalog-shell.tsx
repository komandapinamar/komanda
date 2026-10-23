"use client";

import { useTenantPreset } from "@/features/tenancy/web/tenant-preset-context";
import {
  CatalogEditor,
  type Props as CatalogEditorProps,
} from "@/features/catalog/web/CatalogEditor";

export type CatalogShellProps = Omit<CatalogEditorProps, "preset">;

export function CatalogShell(props: CatalogShellProps) {
  const { preset } = useTenantPreset();

  if (preset === "express_retail") {
    return <CatalogEditor {...props} preset="express_retail" />;
  }

  if (preset === "gastronomy") {
    return <CatalogEditor {...props} preset="gastronomy" />;
  }

  throw new Error(`[CatalogShell] Preset no soportado: ${preset}`);
}
