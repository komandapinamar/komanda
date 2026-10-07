"use client";

import type { ReactNode } from "react";
import { useTenantPreset } from "@/features/tenancy/web/tenant-preset-context";
import {
  TenantAdminNav,
  type TenantAdminNavItem,
} from "@/app/(admin)/admin/[tenantId]/TenantAdminNav";
import type { Role } from "@/db/schema/platform";
import { canAccess } from "@/lib/authorization/permissions";

export function AdminNavShell({
  tenantId,
  role,
  switchBusiness,
}: {
  tenantId: string;
  role: Role;
  switchBusiness: ReactNode;
}) {
  const { preset } = useTenantPreset();

  if (preset === "express_retail") {
    const expressItems: TenantAdminNavItem[] = [
      ...(canAccess(role, "catalog")
        ? [{ href: `/admin/${tenantId}/catalog`, label: "Catálogo Retail" }]
        : []),
      ...(canAccess(role, "pedidos")
        ? [{ href: `/admin/${tenantId}/orders`, label: "Ventas / Kiosk" }]
        : []),
      ...(canAccess(role, "analytics")
        ? [{ href: `/admin/${tenantId}/analytics`, label: "Analítica" }]
        : []),
      ...(canAccess(role, "promociones")
        ? [{ href: `/admin/${tenantId}/discounts`, label: "Promociones" }]
        : []),
      ...(canAccess(role, "configuracion")
        ? [
            {
              href: `/admin/${tenantId}/settings`,
              label: "Configuración",
              activePaths: [
                `/admin/${tenantId}/settings`,
                `/admin/${tenantId}/integrations`,
              ],
            },
          ]
        : []),
      ...(canAccess(role, "members")
        ? [{ href: `/admin/${tenantId}/members`, label: "Miembros" }]
        : []),
    ];
    return <TenantAdminNav items={expressItems} switchBusiness={switchBusiness} />;
  }

  if (preset === "gastronomy") {
    const gastronomyItems: TenantAdminNavItem[] = [
      ...(canAccess(role, "pedidos")
        ? [{ href: `/admin/${tenantId}/orders`, label: "Pedidos" }]
        : []),
      ...(canAccess(role, "analytics")
        ? [{ href: `/admin/${tenantId}/analytics`, label: "Analítica" }]
        : []),
      ...(canAccess(role, "catalog")
        ? [{ href: `/admin/${tenantId}/catalog`, label: "Catálogo" }]
        : []),
      ...(canAccess(role, "promociones")
        ? [{ href: `/admin/${tenantId}/discounts`, label: "Promociones" }]
        : []),
      ...(canAccess(role, "configuracion")
        ? [
            {
              href: `/admin/${tenantId}/settings`,
              label: "Configuración",
              activePaths: [
                `/admin/${tenantId}/settings`,
                `/admin/${tenantId}/integrations`,
              ],
            },
          ]
        : []),
      ...(canAccess(role, "members")
        ? [{ href: `/admin/${tenantId}/members`, label: "Miembros" }]
        : []),
    ];
    return <TenantAdminNav items={gastronomyItems} switchBusiness={switchBusiness} />;
  }

  throw new Error(`[AdminNavShell] Preset no soportado: ${preset}`);
}
